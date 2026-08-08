/**
 * SANParks Media Licensing — the licensing transaction.
 *
 * The brief's hard requirement lives here: the sale of a frame and the transfer
 * of its rights happen in ONE database transaction. Not a sale followed by a
 * rights job that might fail, not a rights grant followed by a payment that might
 * bounce. One transaction, or neither.
 *
 * That matters most exactly when the catalogue is under pressure. When footage of
 * a lioness giving birth is in demand worldwide and two broadcasters press "buy
 * exclusive" in the same second, the asset row is locked FOR UPDATE before
 * exclusivity is evaluated, so the second one reads the first one's grant and is
 * refused — rather than both being told they own it.
 *
 * Order inside the transaction:
 *
 *   1. idempotency check   — a replayed request returns the first licence
 *   2. lock the asset      — SELECT … FOR UPDATE
 *   3. load + gate the subscription
 *   4. read the live grants, evaluate the rights conflicts
 *   5. price it
 *   6. write: licence → payment → chain of title → asset rights → splits → credits
 *
 * Anything that throws before step 6 means nothing was written at all; anything
 * that throws during step 6 rejects, and the wrapper rolls the whole lot back.
 *
 * The database is injected so this can be unit-tested without one.
 */

'use strict';

const crypto = require('crypto');

const { getPlan, canLicenceAt, applyDownload } = require('./sanparks-subscription.service');
const { priceLicence } = require('./sanparks-pricing.service');
const {
  LICENCE_SCOPES,
  TERRITORIES,
  LICENCE_TERMS,
  RESOLUTION_TIERS,
  checkRightsConflicts,
  licenceEndDate,
  deriveRightsMutation,
  buildChainEntry,
  buildRightsCertificate,
} = require('./sanparks-rights.service');

class LicensingError extends Error {
  constructor(message, { code, status, blockers } = {}) {
    super(message);
    this.name = 'LicensingError';
    this.code = code || 'LICENSING_ERROR';
    this.status = status || 500;
    if (blockers) this.blockers = blockers;
  }
}

// ─── Row mapping ─────────────────────────────────────────────────────────────

function mapAssetRow(row) {
  return {
    assetId: row.asset_id,
    title: row.title,
    park: row.park,
    mediaType: row.media_type,
    resolutionTier: row.resolution_tier,
    maxResolutionTier: row.max_resolution_tier,
    durationSeconds: row.duration_seconds,
    rarityTier: row.rarity_tier,
    demandIndex: row.demand_index,
    rightsStatus: row.rights_status,
    rightsHolderId: row.rights_holder_id,
    contributorId: row.contributor_id,
    contributorType: row.contributor_type,
    contributorRoyaltyBps: row.contributor_royalty_bps,
    propertyReleaseId: row.property_release_id,
    containsIdentifiablePersons: row.contains_identifiable_persons,
    modelReleaseId: row.model_release_id,
    sensitiveSpecies: row.sensitive_species,
    geoRedacted: row.geo_redacted,
    embargoUntil: row.embargo_until,
  };
}

function mapSubscriptionRow(row) {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    licenseeName: row.licensee_name,
    planCode: row.plan_code,
    termMonths: row.term_months,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    cancelledAt: row.cancelled_at,
    creditsRemaining: row.credits_remaining,
  };
}

function mapGrantRow(row) {
  return {
    licenceId: row.licence_id,
    scope: row.scope,
    territory: row.territory,
    territoryCode: row.territory_code,
    exclusive: row.exclusive,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
  };
}

function mapLicenceRow(row) {
  return {
    licenceId: row.licence_id,
    assetId: row.asset_id,
    subscriptionId: row.subscription_id,
    licenseeId: row.licensee_id,
    licenseeName: row.licensee_name,
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
    vatCents: row.vat_cents,
    grossCents: row.gross_cents,
    status: row.status,
    idempotencyKey: row.idempotency_key,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateRequest(input) {
  const required = ['subscriptionId', 'userId', 'assetId', 'scope', 'territory', 'licenceTerm', 'resolutionTier'];
  for (const field of required) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      throw new LicensingError(`Missing required field: ${field}`, { code: 'INVALID_REQUEST', status: 400 });
    }
  }

  const enums = [
    ['scope', LICENCE_SCOPES],
    ['territory', TERRITORIES],
    ['licenceTerm', LICENCE_TERMS],
    ['resolutionTier', RESOLUTION_TIERS],
  ];
  for (const [field, allowed] of enums) {
    if (!allowed.includes(input[field])) {
      throw new LicensingError(
        `Invalid ${field}: ${input[field]}. Expected one of ${allowed.join(', ')}.`,
        { code: 'INVALID_REQUEST', status: 400 }
      );
    }
  }

  if (input.territory !== 'WORLDWIDE' && !input.territoryCode) {
    throw new LicensingError(
      'A territoryCode is required for anything narrower than a worldwide licence.',
      { code: 'INVALID_REQUEST', status: 400 }
    );
  }
}

// ─── The transaction ─────────────────────────────────────────────────────────

/**
 * Sell a licence and transfer the rights in a single transaction.
 *
 * @returns {Promise<{licence, certificate, quote, splits, chainEntry, credits, replayed}>}
 * @throws {LicensingError} with .status and, for conflicts, .blockers
 */
async function executeLicensingTransaction(input, { db } = {}) {
  validateRequest(input);

  // Resolved lazily so the module stays usable — and unit-testable — without a
  // database driver present. Callers in the app pass nothing and get the pool.
  // eslint-disable-next-line global-require
  const database = db || require('../config/database');

  const {
    subscriptionId,
    userId,
    assetId,
    scope,
    territory,
    territoryCode = null,
    licenceTerm,
    resolutionTier,
    exclusive = false,
    idempotencyKey = null,
    now = new Date(),
  } = input;

  return database.transaction(async (client) => {
    // 1 ── Has this exact request already been settled?
    if (idempotencyKey) {
      const replay = await client.query(
        `SELECT * FROM sanparks_licences WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
      );
      if (replay.rows.length > 0) {
        return {
          replayed: true,
          licence: mapLicenceRow(replay.rows[0]),
          certificate: null,
          quote: null,
          splits: null,
          chainEntry: null,
          credits: null,
        };
      }
    }

    // 2 ── Lock the asset before anything about exclusivity is decided.
    const assetResult = await client.query(
      `SELECT * FROM sanparks_assets WHERE asset_id = $1 FOR UPDATE`,
      [assetId]
    );
    if (assetResult.rows.length === 0) {
      throw new LicensingError('Asset not found.', { code: 'ASSET_NOT_FOUND', status: 404 });
    }
    const asset = mapAssetRow(assetResult.rows[0]);

    // 3 ── The subscription that is paying for this, locked so credits cannot
    //      be spent twice concurrently.
    const subResult = await client.query(
      `SELECT * FROM sanparks_subscriptions
       WHERE subscription_id = $1 AND user_id = $2
       FOR UPDATE`,
      [subscriptionId, userId]
    );
    if (subResult.rows.length === 0 || subResult.rows[0].user_id !== userId) {
      throw new LicensingError('Subscription not found for this user.', {
        code: 'SUBSCRIPTION_NOT_FOUND',
        status: 404,
      });
    }
    const subscription = mapSubscriptionRow(subResult.rows[0]);

    if (!canLicenceAt(subscription, now)) {
      throw new LicensingError(
        'This subscription is not active. Renew it before acquiring further rights.',
        { code: 'SUBSCRIPTION_NOT_ACTIVE', status: 403 }
      );
    }

    let plan;
    try {
      plan = getPlan(subscription.planCode);
    } catch (err) {
      throw new LicensingError(err.message, { code: 'PLAN_NOT_FOUND', status: 500 });
    }

    // 4 ── What is already live on this asset, and does the grant conflict?
    const grantsResult = await client.query(
      `SELECT licence_id, scope, territory, territory_code, exclusive, starts_at, ends_at, status
       FROM sanparks_licences
       WHERE asset_id = $1 AND status = 'ACTIVE'`,
      [assetId]
    );
    const activeGrants = grantsResult.rows.map(mapGrantRow);

    const request = { scope, territory, territoryCode, licenceTerm, resolutionTier, exclusive };
    const rights = checkRightsConflicts({ asset, plan, request, activeGrants, now });

    if (!rights.ok) {
      throw new LicensingError('This asset cannot be licensed on the requested terms.', {
        code: 'RIGHTS_CONFLICT',
        status: 409,
        blockers: rights.blockers,
      });
    }

    // 5 ── Price it. The delivered resolution, not the stored one, sets the rate.
    const quote = priceLicence({
      asset: { ...asset, resolutionTier },
      scope,
      territory,
      licenceTerm,
      planCode: plan.code,
    });

    const credits = applyDownload(subscription, { creditCost: quote.creditCost });

    const chainResult = await client.query(
      `SELECT sequence, entry_hash FROM sanparks_rights_chain
       WHERE asset_id = $1
       ORDER BY sequence DESC
       LIMIT 1`,
      [assetId]
    );
    const previousEntry =
      chainResult.rows.length > 0
        ? { sequence: chainResult.rows[0].sequence, entryHash: chainResult.rows[0].entry_hash }
        : null;

    // 6 ── Write. Everything from here shares the transaction's fate.
    const licenceId = crypto.randomUUID();
    const startsAt = new Date(now.getTime());
    const endsAt = licenceEndDate(startsAt, licenceTerm);

    const licence = {
      licenceId,
      assetId,
      subscriptionId,
      licenseeId: userId,
      licenseeName: subscription.licenseeName || userId,
      scope,
      territory,
      territoryCode,
      licenceTerm,
      resolutionTier,
      exclusive: Boolean(exclusive) || scope === 'EXCLUSIVE_BUYOUT',
      instrumentType: rights.instrumentType,
      startsAt,
      endsAt,
      netCents: quote.netCents,
      vatCents: quote.vatCents,
      grossCents: quote.grossCents,
      status: 'ACTIVE',
    };

    await client.query(
      `INSERT INTO sanparks_licences (
         licence_id, asset_id, subscription_id, licensee_id, licensee_name,
         scope, territory, territory_code, licence_term, resolution_tier,
         exclusive, instrument_type, starts_at, ends_at,
         list_cents, net_cents, vat_cents, gross_cents,
         credits_spent, overage_units, status, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        licenceId, assetId, subscriptionId, userId, licence.licenseeName,
        scope, territory, territoryCode, licenceTerm, resolutionTier,
        licence.exclusive, rights.instrumentType, startsAt, endsAt,
        quote.listCents, quote.netCents, quote.vatCents, quote.grossCents,
        credits.creditsSpent, credits.overageUnits, 'ACTIVE', idempotencyKey,
      ]
    );

    await client.query(
      `INSERT INTO sanparks_payments (
         payment_id, licence_id, subscription_id, payer_id,
         net_cents, vat_cents, gross_cents, status, captured_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        crypto.randomUUID(), licenceId, subscriptionId, userId,
        quote.netCents, quote.vatCents, quote.grossCents, 'CAPTURED', startsAt,
      ]
    );

    // The rights move here, in the same transaction as the money.
    const chainEntry = buildChainEntry({
      previousEntry,
      assetId,
      event: rights.instrumentType === 'ASSIGNMENT' ? 'RIGHTS_ASSIGNED' : 'LICENCE_GRANTED',
      payload: {
        licenceId,
        licenseeId: userId,
        instrumentType: rights.instrumentType,
        scope,
        territory,
        territoryCode,
        licenceTerm,
        exclusive: licence.exclusive,
        netCents: quote.netCents,
      },
      at: startsAt,
    });

    await client.query(
      `INSERT INTO sanparks_rights_chain (
         chain_id, asset_id, licence_id, sequence, previous_hash, entry_hash,
         event, payload, recorded_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        crypto.randomUUID(), assetId, licenceId, chainEntry.sequence,
        chainEntry.previousHash, chainEntry.entryHash, chainEntry.event,
        JSON.stringify(chainEntry.payload), chainEntry.recordedAt,
      ]
    );

    const mutation = deriveRightsMutation({
      asset,
      instrumentType: rights.instrumentType,
      licenseeId: userId,
    });

    if (mutation.changed) {
      await client.query(
        `UPDATE sanparks_assets
         SET rights_status = $1, rights_holder_id = $2, updated_at = NOW()
         WHERE asset_id = $3`,
        [mutation.rightsStatus, mutation.rightsHolderId, assetId]
      );
    }

    const beneficiaries = [
      ['CONSERVATION_LEVY', 'sanparks', quote.splits.conservationLevyCents],
      ['CONTRIBUTOR_ROYALTY', asset.contributorId, quote.splits.contributorRoyaltyCents],
      ['PLATFORM_FEE', 'paysick', quote.splits.platformFeeCents],
    ];
    for (const [type, beneficiaryId, amountCents] of beneficiaries) {
      await client.query(
        `INSERT INTO sanparks_revenue_splits (
           split_id, licence_id, asset_id, beneficiary_type, beneficiary_id, amount_cents
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [crypto.randomUUID(), licenceId, assetId, type, beneficiaryId, amountCents]
      );
    }

    if (credits.creditsSpent > 0) {
      await client.query(
        `UPDATE sanparks_subscriptions
         SET credits_remaining = $1, updated_at = NOW()
         WHERE subscription_id = $2`,
        [credits.creditsRemainingAfter, subscriptionId]
      );
    }

    return {
      replayed: false,
      licence,
      certificate: buildRightsCertificate({ licence, asset, chainEntry }),
      quote,
      splits: quote.splits,
      chainEntry,
      credits,
    };
  });
}

module.exports = {
  LicensingError,
  executeLicensingTransaction,
  mapAssetRow,
  mapSubscriptionRow,
  mapLicenceRow,
};
