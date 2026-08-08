/**
 * /api/sanparks — SANParks Media Licensing API.
 *
 * Subscription-based licensing of imagery and footage captured on SANParks
 * property, where the transfer of rights is settled in the same transaction as
 * the sale.
 *
 *   GET  /api/sanparks/plans                              — plan catalogue and term pricing
 *   GET  /api/sanparks/subscriptions                      — the caller's subscriptions
 *   POST /api/sanparks/subscriptions                      — start a 12 or 24 month term
 *   POST /api/sanparks/subscriptions/:id/renew            — renew for a further term
 *   POST /api/sanparks/subscriptions/:id/cancel           — stop auto-renewal
 *   GET  /api/sanparks/assets                             — catalogue search
 *   GET  /api/sanparks/assets/:assetId                    — one asset
 *   GET  /api/sanparks/assets/:assetId/chain              — chain of title
 *   POST /api/sanparks/quotes                             — price a licence, dry run
 *   POST /api/sanparks/licences                           — buy it; rights move with the money
 *   GET  /api/sanparks/licences                           — the caller's licences
 *
 * Every route requires authentication and emits X-Robots-Tag. A media catalogue
 * is the most scrape-attractive surface on the platform, so there is no
 * unauthenticated read here — not even for the plan list.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');

const {
  PLANS,
  TERM_MONTHS_OPTIONS,
  GRACE_DAYS,
  RENEWAL_WINDOW_DAYS,
  getPlan,
  quoteSubscription,
  renewalQuote,
  subscriptionStatusAt,
} = require('../services/sanparks-subscription.service');

const { priceLicence } = require('../services/sanparks-pricing.service');

const {
  checkRightsConflicts,
  verifyChain,
} = require('../services/sanparks-rights.service');

const {
  executeLicensingTransaction,
  LicensingError,
  mapAssetRow,
  mapSubscriptionRow,
} = require('../services/sanparks-licensing.service');

// Anti-crawling header on every response (CLAUDE.md: Bot Crawling Prevention)
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({ error: message, code, ...extra });
}

function handleLicensingError(res, err) {
  if (err instanceof LicensingError) {
    return fail(res, err.status, err.code, err.message, err.blockers ? { blockers: err.blockers } : {});
  }
  console.error('SANParks licensing error:', err.message);
  return fail(res, 500, 'INTERNAL_ERROR', 'Unable to complete the request.');
}

/** The catalogue view. Never exposes the deliverable file, only the preview. */
function publicAsset(row) {
  return {
    assetId: row.asset_id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    park: row.park,
    species: row.species,
    capturedAt: row.captured_at,
    mediaType: row.media_type,
    maxResolutionTier: row.max_resolution_tier,
    durationSeconds: row.duration_seconds,
    rarityTier: row.rarity_tier,
    demandIndex: row.demand_index,
    rightsStatus: row.rights_status,
    contributorType: row.contributor_type,
    sensitiveSpecies: row.sensitive_species,
    previewUrl: row.preview_url,
  };
}

async function loadSubscription(subscriptionId, userId) {
  const { rows } = await query(
    `SELECT * FROM sanparks_subscriptions WHERE subscription_id = $1 AND user_id = $2`,
    [subscriptionId, userId]
  );
  return rows[0] ? mapSubscriptionRow(rows[0]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans
// ─────────────────────────────────────────────────────────────────────────────

router.get('/plans', authenticateToken, async (req, res) => {
  try {
    const plans = PLANS.map((plan) => ({
      code: plan.code,
      name: plan.name,
      audience: plan.audience,
      allowedScopes: plan.allowedScopes,
      maxResolutionTier: plan.maxResolutionTier,
      exclusivityEligible: plan.exclusivityEligible,
      subscriberDiscountBps: plan.subscriberDiscountBps,
      terms: TERM_MONTHS_OPTIONS.map((termMonths) => {
        const q = quoteSubscription({ planCode: plan.code, termMonths, startDate: new Date() });
        return {
          termMonths,
          listCents: q.listCents,
          termDiscountBps: q.termDiscountBps,
          termDiscountCents: q.termDiscountCents,
          netCents: q.netCents,
          vatCents: q.vatCents,
          grossCents: q.grossCents,
          creditsIncluded: q.creditsIncluded,
        };
      }),
    }));

    return res.json({
      plans,
      termOptions: TERM_MONTHS_OPTIONS,
      graceDays: GRACE_DAYS,
      renewalWindowDays: RENEWAL_WINDOW_DAYS,
    });
  } catch (err) {
    console.error('SANParks plans error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to load plans.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM sanparks_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    const now = new Date();
    return res.json({
      subscriptions: rows.map((row) => {
        const sub = mapSubscriptionRow(row);
        return { ...sub, status: subscriptionStatusAt(sub, now) };
      }),
    });
  } catch (err) {
    console.error('SANParks subscriptions error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to load subscriptions.');
  }
});

router.post('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const { planCode, termMonths, licenseeName } = req.body || {};
    if (!planCode || !termMonths) {
      return fail(res, 400, 'INVALID_REQUEST', 'planCode and termMonths are required.');
    }

    let quote;
    try {
      quote = quoteSubscription({
        planCode,
        termMonths: Number(termMonths),
        startDate: new Date(),
      });
    } catch (err) {
      return fail(res, 400, 'INVALID_REQUEST', err.message);
    }

    const created = await transaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO sanparks_subscriptions (
           user_id, licensee_name, plan_code, term_months, starts_at, expires_at,
           credits_remaining, list_cents, net_cents, vat_cents, gross_cents
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          req.user.user_id, licenseeName || null, quote.planCode, quote.termMonths,
          quote.startsAt, quote.expiresAt, quote.creditsIncluded,
          quote.listCents, quote.netCents, quote.vatCents, quote.grossCents,
        ]
      );
      const row = inserted.rows[0];

      await client.query(
        `INSERT INTO sanparks_subscription_terms (
           subscription_id, sequence, plan_code, term_months, starts_at, expires_at,
           continuous, price_locked, list_cents, net_cents, vat_cents, gross_cents,
           credits_added, credits_carried
         ) VALUES ($1,1,$2,$3,$4,$5,true,false,$6,$7,$8,$9,$10,0)`,
        [
          row.subscription_id, quote.planCode, quote.termMonths, quote.startsAt, quote.expiresAt,
          quote.listCents, quote.netCents, quote.vatCents, quote.grossCents, quote.creditsIncluded,
        ]
      );

      await client.query(
        `INSERT INTO sanparks_payments (subscription_id, payer_id, net_cents, vat_cents, gross_cents, status, captured_at)
         VALUES ($1,$2,$3,$4,$5,'CAPTURED',NOW())`,
        [row.subscription_id, req.user.user_id, quote.netCents, quote.vatCents, quote.grossCents]
      );

      return row;
    });

    return res.status(201).json({ subscription: mapSubscriptionRow(created), quote });
  } catch (err) {
    console.error('SANParks subscribe error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to start the subscription.');
  }
});

router.post('/subscriptions/:subscriptionId/renew', authenticateToken, async (req, res) => {
  try {
    const subscription = await loadSubscription(req.params.subscriptionId, req.user.user_id);
    if (!subscription) return fail(res, 404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');

    const termMonths = Number((req.body || {}).termMonths || subscription.termMonths);

    let quote;
    try {
      quote = renewalQuote(subscription, { termMonths, now: new Date() });
    } catch (err) {
      return fail(res, 409, 'RENEWAL_NOT_AVAILABLE', err.message);
    }

    const updated = await transaction(async (client) => {
      const { rows } = await client.query(
        `SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM sanparks_subscription_terms WHERE subscription_id = $1`,
        [subscription.subscriptionId]
      );
      const sequence = rows[0].next;

      await client.query(
        `INSERT INTO sanparks_subscription_terms (
           subscription_id, sequence, plan_code, term_months, starts_at, expires_at,
           continuous, price_locked, list_cents, net_cents, vat_cents, gross_cents,
           credits_added, credits_carried
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          subscription.subscriptionId, sequence, quote.planCode, quote.termMonths,
          quote.startsAt, quote.expiresAt, quote.continuous, quote.priceLocked,
          quote.listCents, quote.netCents, quote.vatCents, quote.grossCents,
          quote.creditsAdded, quote.creditsCarriedOver,
        ]
      );

      const result = await client.query(
        `UPDATE sanparks_subscriptions
         SET term_months = $1, starts_at = $2, expires_at = $3, credits_remaining = $4,
             list_cents = $5, net_cents = $6, vat_cents = $7, gross_cents = $8, updated_at = NOW()
         WHERE subscription_id = $9
         RETURNING *`,
        [
          quote.termMonths, quote.startsAt, quote.expiresAt, quote.creditsRemainingAfter,
          quote.listCents, quote.netCents, quote.vatCents, quote.grossCents,
          subscription.subscriptionId,
        ]
      );

      await client.query(
        `INSERT INTO sanparks_payments (subscription_id, payer_id, net_cents, vat_cents, gross_cents, status, captured_at)
         VALUES ($1,$2,$3,$4,$5,'CAPTURED',NOW())`,
        [subscription.subscriptionId, req.user.user_id, quote.netCents, quote.vatCents, quote.grossCents]
      );

      return result.rows[0];
    });

    return res.json({ subscription: mapSubscriptionRow(updated), renewal: quote });
  } catch (err) {
    console.error('SANParks renew error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to renew the subscription.');
  }
});

router.post('/subscriptions/:subscriptionId/cancel', authenticateToken, async (req, res) => {
  try {
    const subscription = await loadSubscription(req.params.subscriptionId, req.user.user_id);
    if (!subscription) return fail(res, 404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');

    // Cancellation stops the renewal; it does not void the paid term, and it
    // does not touch licences already granted under it — those were bought.
    const { rows } = await query(
      `UPDATE sanparks_subscriptions
       SET auto_renew = false, cancelled_at = COALESCE(cancelled_at, expires_at), updated_at = NOW()
       WHERE subscription_id = $1
       RETURNING *`,
      [subscription.subscriptionId]
    );

    return res.json({
      subscription: mapSubscriptionRow(rows[0]),
      message: 'Auto-renewal stopped. The subscription runs to the end of its paid term.',
    });
  } catch (err) {
    console.error('SANParks cancel error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to cancel the subscription.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

router.get('/assets', authenticateToken, async (req, res) => {
  try {
    const { park, mediaType, rarityTier, search } = req.query;
    const limit = Math.min(Number(req.query.limit) || 24, 60);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const filters = [`rights_status <> 'WITHDRAWN'`];
    const params = [];

    if (park) { params.push(park); filters.push(`park = $${params.length}`); }
    if (mediaType) { params.push(mediaType); filters.push(`media_type = $${params.length}`); }
    if (rarityTier) { params.push(rarityTier); filters.push(`rarity_tier = $${params.length}`); }
    if (search) { params.push(`%${search}%`); filters.push(`(title ILIKE $${params.length} OR species ILIKE $${params.length})`); }

    params.push(limit, offset);

    const { rows } = await query(
      `SELECT * FROM sanparks_assets
       WHERE ${filters.join(' AND ')}
       ORDER BY demand_index DESC, captured_at DESC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({ assets: rows.map(publicAsset), limit, offset });
  } catch (err) {
    console.error('SANParks catalogue error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to load the catalogue.');
  }
});

router.get('/assets/:assetId', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM sanparks_assets WHERE asset_id = $1`, [req.params.assetId]);
    if (rows.length === 0) return fail(res, 404, 'ASSET_NOT_FOUND', 'Asset not found.');
    return res.json({ asset: publicAsset(rows[0]) });
  } catch (err) {
    console.error('SANParks asset error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to load the asset.');
  }
});

router.get('/assets/:assetId/chain', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT sequence, previous_hash, entry_hash, event, payload, recorded_at, licence_id
       FROM sanparks_rights_chain
       WHERE asset_id = $1
       ORDER BY sequence ASC`,
      [req.params.assetId]
    );

    const entries = rows.map((row) => ({
      assetId: req.params.assetId,
      sequence: row.sequence,
      previousHash: row.previous_hash,
      entryHash: row.entry_hash,
      event: row.event,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
      licenceId: row.licence_id,
    }));

    return res.json({ assetId: req.params.assetId, entries, verification: verifyChain(entries) });
  } catch (err) {
    console.error('SANParks chain error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to load the chain of title.');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Quoting and licensing
// ─────────────────────────────────────────────────────────────────────────────

router.post('/quotes', authenticateToken, async (req, res) => {
  try {
    const {
      subscriptionId, assetId, scope, territory, territoryCode = null,
      licenceTerm, resolutionTier, exclusive = false,
    } = req.body || {};

    if (!subscriptionId || !assetId || !scope || !territory || !licenceTerm || !resolutionTier) {
      return fail(res, 400, 'INVALID_REQUEST',
        'subscriptionId, assetId, scope, territory, licenceTerm and resolutionTier are required.');
    }

    const subscription = await loadSubscription(subscriptionId, req.user.user_id);
    if (!subscription) return fail(res, 404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');

    const assetResult = await query(`SELECT * FROM sanparks_assets WHERE asset_id = $1`, [assetId]);
    if (assetResult.rows.length === 0) return fail(res, 404, 'ASSET_NOT_FOUND', 'Asset not found.');
    const asset = mapAssetRow(assetResult.rows[0]);

    const grants = await query(
      `SELECT licence_id, scope, territory, territory_code, exclusive, starts_at, ends_at, status
       FROM sanparks_licences WHERE asset_id = $1 AND status = 'ACTIVE'`,
      [assetId]
    );

    const now = new Date();
    const plan = getPlan(subscription.planCode);
    const request = { scope, territory, territoryCode, licenceTerm, resolutionTier, exclusive };

    const rights = checkRightsConflicts({
      asset,
      plan,
      request,
      activeGrants: grants.rows.map((row) => ({
        licenceId: row.licence_id,
        scope: row.scope,
        territory: row.territory,
        territoryCode: row.territory_code,
        exclusive: row.exclusive,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
      })),
      now,
    });

    let quote = null;
    try {
      quote = priceLicence({ asset: { ...asset, resolutionTier }, scope, territory, licenceTerm, planCode: plan.code });
    } catch (err) {
      return fail(res, 400, 'INVALID_REQUEST', err.message);
    }

    return res.json({
      quote,
      rights: { grantable: rights.ok, instrumentType: rights.instrumentType, blockers: rights.blockers },
      subscriptionStatus: subscriptionStatusAt(subscription, now),
      creditsRemaining: subscription.creditsRemaining,
    });
  } catch (err) {
    console.error('SANParks quote error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to price the licence.');
  }
});

router.post('/licences', authenticateToken, async (req, res) => {
  try {
    const {
      subscriptionId, assetId, scope, territory, territoryCode = null,
      licenceTerm, resolutionTier, exclusive = false, idempotencyKey = null,
    } = req.body || {};

    const receipt = await executeLicensingTransaction({
      subscriptionId,
      userId: req.user.user_id,
      assetId,
      scope,
      territory,
      territoryCode,
      licenceTerm,
      resolutionTier,
      exclusive,
      idempotencyKey: idempotencyKey || req.get('Idempotency-Key') || null,
      now: new Date(),
    });

    return res.status(receipt.replayed ? 200 : 201).json(receipt);
  } catch (err) {
    return handleLicensingError(res, err);
  }
});

router.get('/licences', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT l.*, a.title, a.park, a.reference
       FROM sanparks_licences l
       JOIN sanparks_assets a ON a.asset_id = l.asset_id
       WHERE l.licensee_id = $1
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [req.user.user_id]
    );

    return res.json({
      licences: rows.map((row) => ({
        licenceId: row.licence_id,
        assetId: row.asset_id,
        assetTitle: row.title,
        assetReference: row.reference,
        park: row.park,
        scope: row.scope,
        territory: row.territory,
        territoryCode: row.territory_code,
        licenceTerm: row.licence_term,
        resolutionTier: row.resolution_tier,
        exclusive: row.exclusive,
        instrumentType: row.instrument_type,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        netCents: row.net_cents,
        grossCents: row.gross_cents,
        status: row.status,
      })),
    });
  } catch (err) {
    console.error('SANParks licences error:', err.message);
    return fail(res, 500, 'INTERNAL_ERROR', 'Unable to load licences.');
  }
});

module.exports = router;
