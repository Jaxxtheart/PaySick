/**
 * SANParks Media Licensing — pricing engine.
 *
 * A price is a base rate for the media type and resolution, walked through a
 * fixed chain of integer basis-point multipliers, then discounted by the
 * subscriber's plan tier:
 *
 *   base × rarity × demand surge × scope × territory × licence term = list
 *   list − subscriber discount = net;  net + 15% VAT = gross
 *
 * The demand surge is deliberately capped. When a clip of a lioness giving birth
 * lands and the whole world wants it in the same week, the surge should register
 * the demand — but an uncapped multiplier turns the catalogue into an auction and
 * makes the price unquotable, so it tops out at 2.5×.
 *
 * Net is split three ways at the point of sale: a conservation levy back to
 * SANParks, a royalty to the contributor who captured the frame, and the platform
 * fee. The levy is the residual share, which means it also absorbs the rounding —
 * the three parts always reconcile to the net exactly.
 *
 * All money is integer cents (CLAUDE.md: never floating point for money).
 */

'use strict';

const VAT_RATE_BPS = 1500;

/** Base rate by media type and delivered resolution, in cents. */
const BASE_PRICE_CENTS = {
  IMAGE: { WEB: 25000, FULL: 90000, MASTER: 250000 },
  VIDEO: { WEB: 120000, FULL: 450000, MASTER: 1200000 },
};

/** Footage seconds covered by the base rate before per-second pricing starts. */
const VIDEO_INCLUDED_SECONDS = 30;

/** Cents per second of footage beyond the included seconds. */
const VIDEO_PER_SECOND_CENTS = { WEB: 800, FULL: 2000, MASTER: 5000 };

const RARITY_MULTIPLIER_BPS = {
  STANDARD: 10000,
  NOTABLE: 15000,
  RARE: 22500,
  ONCE_IN_A_LIFETIME: 30000,
};

const SCOPE_MULTIPLIER_BPS = {
  PERSONAL: 10000,
  EDITORIAL: 20000,
  COMMERCIAL: 50000,
  BROADCAST: 80000,
  EXCLUSIVE_BUYOUT: 250000,
};

const TERRITORY_MULTIPLIER_BPS = {
  SINGLE_COUNTRY: 10000,
  REGIONAL: 15000,
  WORLDWIDE: 20000,
};

const LICENCE_TERM_MULTIPLIER_BPS = {
  ONE_YEAR: 10000,
  THREE_YEARS: 18000,
  PERPETUAL: 25000,
};

/** Basis points of surge added per unit of 30-day demand. */
const SURGE_BPS_PER_DEMAND_UNIT = 250;

/** Ceiling on the demand surge, so a viral asset stays quotable. */
const SURGE_CAP_BPS = 25000;

/** Credits consumed per download, by scope. Commercial and above are cash sales. */
const SCOPE_CREDIT_COST = {
  PERSONAL: 1,
  EDITORIAL: 2,
  COMMERCIAL: 0,
  BROADCAST: 0,
  EXCLUSIVE_BUYOUT: 0,
};

/** Footage costs more credits than a still at the same scope. */
const VIDEO_CREDIT_MULTIPLIER = 3;

const PLATFORM_FEE_BPS = 1500;
const DEFAULT_CONTRIBUTOR_ROYALTY_BPS = 4000;

/** The conservation levy may never be squeezed below this share of a sale. */
const MIN_CONSERVATION_LEVY_BPS = 1000;

/** Subscriber discount by plan tier, in basis points off the list price. */
const PLAN_DISCOUNT_BPS = {
  SUPPORTER: 0,
  CREATOR: 1000,
  COMMERCIAL: 2000,
  BROADCAST: 3000,
};

function applyBps(cents, bps) {
  return Math.round((cents * bps) / 10000);
}

/**
 * Demand is the count of licence requests against the asset in the last 30 days.
 * Zero demand means no surge; the multiplier climbs from there and stops at the cap.
 */
function surgeMultiplierBps(demandIndex) {
  const demand = Number(demandIndex);
  if (!Number.isFinite(demand) || demand <= 0) return 10000;
  return Math.min(SURGE_CAP_BPS, 10000 + Math.round(demand * SURGE_BPS_PER_DEMAND_UNIT));
}

function creditCostFor(asset, scope) {
  const base = SCOPE_CREDIT_COST[scope];
  if (base === undefined) throw new Error(`Unknown licence scope: ${scope}`);
  if (base === 0) return 0;
  return asset.mediaType === 'VIDEO' ? base * VIDEO_CREDIT_MULTIPLIER : base;
}

/**
 * Split a net sale between conservation, the contributor and the platform.
 *
 * The levy takes the residual, so the three parts reconcile to the net exactly
 * regardless of how the rounding falls.
 */
function splitRevenue(netCents, { contributorType, contributorRoyaltyBps } = {}) {
  const net = Math.max(0, Math.round(Number(netCents) || 0));

  const royaltyBps =
    contributorType === 'SANPARKS'
      ? 0
      : Number.isFinite(Number(contributorRoyaltyBps)) && contributorRoyaltyBps !== null
        ? Number(contributorRoyaltyBps)
        : DEFAULT_CONTRIBUTOR_ROYALTY_BPS;

  if (royaltyBps < 0 || royaltyBps + PLATFORM_FEE_BPS > 10000 - MIN_CONSERVATION_LEVY_BPS) {
    throw new Error(
      `Contributor royalty of ${royaltyBps}bps would leave the conservation levy below ` +
        `its ${MIN_CONSERVATION_LEVY_BPS}bps floor.`
    );
  }

  const contributorRoyaltyCents = applyBps(net, royaltyBps);
  const platformFeeCents = applyBps(net, PLATFORM_FEE_BPS);
  const conservationLevyCents = net - contributorRoyaltyCents - platformFeeCents;

  return {
    conservationLevyCents,
    contributorRoyaltyCents,
    platformFeeCents,
    contributorRoyaltyBps: royaltyBps,
    platformFeeBps: PLATFORM_FEE_BPS,
  };
}

function baseRateFor(asset) {
  const mediaTable = BASE_PRICE_CENTS[asset.mediaType];
  if (!mediaTable) throw new Error(`Unsupported media type: ${asset.mediaType}`);

  const base = mediaTable[asset.resolutionTier];
  if (base === undefined) throw new Error(`Unsupported resolution tier: ${asset.resolutionTier}`);

  if (asset.mediaType !== 'VIDEO') return base;

  const seconds = Math.max(0, Number(asset.durationSeconds) || 0);
  const billableSeconds = Math.max(0, seconds - VIDEO_INCLUDED_SECONDS);
  return base + billableSeconds * VIDEO_PER_SECOND_CENTS[asset.resolutionTier];
}

/**
 * Price one licence.
 *
 * @returns every step of the walk, so the quote can be shown to the buyer and
 *          reconciled afterwards rather than arriving as a single opaque number.
 */
function priceLicence({ asset, scope, territory, licenceTerm, planCode }) {
  const scopeMultiplierBps = SCOPE_MULTIPLIER_BPS[scope];
  if (scopeMultiplierBps === undefined) throw new Error(`Unknown licence scope: ${scope}`);

  const territoryMultiplierBps = TERRITORY_MULTIPLIER_BPS[territory];
  if (territoryMultiplierBps === undefined) throw new Error(`Unknown territory: ${territory}`);

  const licenceTermMultiplierBps = LICENCE_TERM_MULTIPLIER_BPS[licenceTerm];
  if (licenceTermMultiplierBps === undefined) throw new Error(`Unknown licence term: ${licenceTerm}`);

  const rarityMultiplierBps = RARITY_MULTIPLIER_BPS[asset.rarityTier || 'STANDARD'];
  if (rarityMultiplierBps === undefined) throw new Error(`Unknown rarity tier: ${asset.rarityTier}`);

  const baseCents = baseRateFor(asset);
  const surgeBps = surgeMultiplierBps(asset.demandIndex);

  let running = baseCents;
  running = applyBps(running, rarityMultiplierBps);
  running = applyBps(running, surgeBps);
  running = applyBps(running, scopeMultiplierBps);
  running = applyBps(running, territoryMultiplierBps);
  running = applyBps(running, licenceTermMultiplierBps);

  const listCents = running;

  // A buyout is a sale of rights, not a catalogue download — the subscription
  // discount does not apply to it.
  const subscriberDiscountBps =
    scope === 'EXCLUSIVE_BUYOUT' ? 0 : PLAN_DISCOUNT_BPS[String(planCode || '').toUpperCase()] || 0;

  const subscriberDiscountCents = applyBps(listCents, subscriberDiscountBps);
  const netCents = listCents - subscriberDiscountCents;
  const vatCents = applyBps(netCents, VAT_RATE_BPS);

  return {
    baseCents,
    rarityMultiplierBps,
    surgeMultiplierBps: surgeBps,
    scopeMultiplierBps,
    territoryMultiplierBps,
    licenceTermMultiplierBps,
    listCents,
    subscriberDiscountBps,
    subscriberDiscountCents,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
    creditCost: creditCostFor(asset, scope),
    splits: splitRevenue(netCents, {
      contributorType: asset.contributorType,
      contributorRoyaltyBps: asset.contributorRoyaltyBps,
    }),
  };
}

module.exports = {
  VAT_RATE_BPS,
  BASE_PRICE_CENTS,
  VIDEO_INCLUDED_SECONDS,
  VIDEO_PER_SECOND_CENTS,
  RARITY_MULTIPLIER_BPS,
  SCOPE_MULTIPLIER_BPS,
  TERRITORY_MULTIPLIER_BPS,
  LICENCE_TERM_MULTIPLIER_BPS,
  SURGE_CAP_BPS,
  SURGE_BPS_PER_DEMAND_UNIT,
  SCOPE_CREDIT_COST,
  PLATFORM_FEE_BPS,
  DEFAULT_CONTRIBUTOR_ROYALTY_BPS,
  MIN_CONSERVATION_LEVY_BPS,
  PLAN_DISCOUNT_BPS,
  surgeMultiplierBps,
  creditCostFor,
  splitRevenue,
  priceLicence,
};
