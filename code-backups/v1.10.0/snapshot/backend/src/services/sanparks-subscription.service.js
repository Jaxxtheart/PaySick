/**
 * SANParks Media Licensing — subscription engine.
 *
 * Access to the SANParks media library is sold as a fixed-term subscription that
 * the subscriber renews. Terms are 12 or 24 months; a 24-month term is
 * discounted against two annual terms.
 *
 * Continuity is the design constraint that shapes the renewal rules. A licensee
 * who downloaded a frame on the last day of a term and renews a week later must
 * not end up with a week in which they held no subscription — every licence
 * granted has to sit inside a covered period, or the rights record has a hole in
 * it. So renewals inside the grace window are backdated to the old expiry date
 * rather than starting today.
 *
 * All money is integer cents (CLAUDE.md: never floating point for money).
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

/** South African VAT, in basis points. */
const VAT_RATE_BPS = 1500;

/** The only two term lengths sold. */
const TERM_MONTHS_OPTIONS = [12, 24];

/** Discount applied to the list price of each term length, in basis points. */
const TERM_DISCOUNT_BPS = { 12: 0, 24: 1250 };

/** Days after expiry during which a renewal is still treated as continuous. */
const GRACE_DAYS = 30;

/** Days before expiry from which renewal is permitted. */
const RENEWAL_WINDOW_DAYS = 60;

const PLANS = [
  {
    code: 'SUPPORTER',
    name: 'Conservation Supporter',
    audience: 'Individuals, enthusiasts and park visitors',
    annualPriceCents: 120000, // R1 200
    annualCredits: 12,
    allowedScopes: ['PERSONAL'],
    maxResolutionTier: 'WEB',
    exclusivityEligible: false,
    subscriberDiscountBps: 0,
  },
  {
    code: 'CREATOR',
    name: 'Creator',
    audience: 'Freelance photographers, journalists and small studios',
    annualPriceCents: 600000, // R6 000
    annualCredits: 60,
    allowedScopes: ['PERSONAL', 'EDITORIAL'],
    maxResolutionTier: 'FULL',
    exclusivityEligible: false,
    subscriberDiscountBps: 1000,
  },
  {
    code: 'COMMERCIAL',
    name: 'Commercial',
    audience: 'Agencies, publishers and brands',
    annualPriceCents: 2400000, // R24 000
    annualCredits: 240,
    allowedScopes: ['PERSONAL', 'EDITORIAL', 'COMMERCIAL'],
    maxResolutionTier: 'FULL',
    exclusivityEligible: false,
    subscriberDiscountBps: 2000,
  },
  {
    code: 'BROADCAST',
    name: 'Broadcast & Rights',
    audience: 'Broadcasters, streamers and distributors acquiring rights',
    annualPriceCents: 9000000, // R90 000
    annualCredits: 900,
    allowedScopes: ['PERSONAL', 'EDITORIAL', 'COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT'],
    maxResolutionTier: 'MASTER',
    exclusivityEligible: true,
    subscriberDiscountBps: 3000,
  },
];

const PLANS_BY_CODE = new Map(PLANS.map((p) => [p.code, p]));

function getPlan(code) {
  const plan = PLANS_BY_CODE.get(String(code || '').toUpperCase());
  if (!plan) throw new Error(`Unknown plan: ${code}`);
  return plan;
}

function assertTerm(termMonths) {
  if (!TERM_MONTHS_OPTIONS.includes(termMonths)) {
    throw new Error(
      `Invalid subscription term: ${termMonths}. Valid terms are ${TERM_MONTHS_OPTIONS.join(' or ')} months.`
    );
  }
}

/**
 * Add whole months in UTC, clamping to the last day of the target month so that
 * 31 January + 1 month lands on 28/29 February rather than rolling into March.
 */
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDayOfTarget));
  return d;
}

function vatOn(netCents) {
  return Math.round((netCents * VAT_RATE_BPS) / 10000);
}

/**
 * Price a new subscription term.
 *
 * @returns {{planCode, termMonths, listCents, termDiscountBps, termDiscountCents,
 *            netCents, vatCents, grossCents, creditsIncluded, startsAt, expiresAt}}
 */
function quoteSubscription({ planCode, termMonths, startDate }) {
  assertTerm(termMonths);
  const plan = getPlan(planCode);
  const years = termMonths / 12;

  const listCents = plan.annualPriceCents * years;
  const termDiscountBps = TERM_DISCOUNT_BPS[termMonths];
  const termDiscountCents = Math.round((listCents * termDiscountBps) / 10000);
  const netCents = listCents - termDiscountCents;
  const vatCents = vatOn(netCents);

  const startsAt = new Date(startDate.getTime());

  return {
    planCode: plan.code,
    planName: plan.name,
    termMonths,
    listCents,
    termDiscountBps,
    termDiscountCents,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
    creditsIncluded: plan.annualCredits * years,
    startsAt,
    expiresAt: addMonths(startsAt, termMonths),
  };
}

/**
 * PENDING → ACTIVE → GRACE → LAPSED, with CANCELLED overriding all of them.
 */
function subscriptionStatusAt(subscription, now) {
  const { startsAt, expiresAt, cancelledAt } = subscription;

  if (cancelledAt && now.getTime() >= new Date(cancelledAt).getTime()) return 'CANCELLED';
  if (now.getTime() < new Date(startsAt).getTime()) return 'PENDING';
  if (now.getTime() < new Date(expiresAt).getTime()) return 'ACTIVE';
  if (now.getTime() < new Date(expiresAt).getTime() + GRACE_DAYS * DAY_MS) return 'GRACE';
  return 'LAPSED';
}

/**
 * Grace is for renewing, not for buying. A subscriber past their expiry date can
 * still put their subscription back in order, but cannot acquire new rights in
 * the meantime — a licence granted in an uncovered window is a licence nobody
 * can point at a paid term for.
 */
function canLicenceAt(subscription, now) {
  return subscriptionStatusAt(subscription, now) === 'ACTIVE';
}

/**
 * Price a renewal of an existing subscription.
 *
 * Continuous renewals (before expiry, or inside grace) start the new term at the
 * old expiry date so no uncovered gap appears, and carry unused credits forward.
 * Renewing before expiry additionally locks the expiring term's price for one
 * more term of the same length.
 */
function renewalQuote(subscription, { termMonths, now }) {
  assertTerm(termMonths);

  const { cancelledAt, expiresAt, planCode } = subscription;
  if (cancelledAt && now.getTime() >= new Date(cancelledAt).getTime()) {
    throw new Error('This subscription has been cancelled and cannot be renewed.');
  }

  const expiry = new Date(expiresAt).getTime();
  const windowOpensAt = expiry - RENEWAL_WINDOW_DAYS * DAY_MS;
  if (now.getTime() < windowOpensAt) {
    throw new Error(
      `Outside the renewal window — renewal opens ${RENEWAL_WINDOW_DAYS} days before expiry.`
    );
  }

  const beforeExpiry = now.getTime() < expiry;
  const continuous = now.getTime() < expiry + GRACE_DAYS * DAY_MS;
  const startsAt = continuous ? new Date(expiry) : new Date(now.getTime());

  const plan = getPlan(planCode);
  const listQuote = quoteSubscription({ planCode, termMonths, startDate: startsAt });

  const priceLocked =
    beforeExpiry &&
    Number(subscription.termMonths) === termMonths &&
    Number.isInteger(subscription.netCents);

  const netCents = priceLocked ? subscription.netCents : listQuote.netCents;
  const vatCents = vatOn(netCents);

  const creditsCarriedOver = continuous ? Number(subscription.creditsRemaining || 0) : 0;
  const creditsAdded = plan.annualCredits * (termMonths / 12);

  return {
    subscriptionId: subscription.subscriptionId,
    planCode: plan.code,
    planName: plan.name,
    termMonths,
    continuous,
    priceLocked,
    listCents: listQuote.listCents,
    termDiscountBps: listQuote.termDiscountBps,
    termDiscountCents: listQuote.listCents - netCents,
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
    creditsAdded,
    creditsCarriedOver,
    creditsRemainingAfter: creditsCarriedOver + creditsAdded,
    startsAt,
    expiresAt: addMonths(startsAt, termMonths),
  };
}

/**
 * Spend credits against a download, billing whatever the balance does not cover
 * as overage rather than refusing the download.
 */
function applyDownload(subscription, { creditCost }) {
  const remaining = Math.max(0, Number(subscription.creditsRemaining || 0));
  const cost = Math.max(0, Number(creditCost || 0));
  const creditsSpent = Math.min(remaining, cost);

  return {
    creditsSpent,
    creditsRemainingAfter: remaining - creditsSpent,
    overageUnits: cost - creditsSpent,
  };
}

module.exports = {
  VAT_RATE_BPS,
  TERM_MONTHS_OPTIONS,
  TERM_DISCOUNT_BPS,
  GRACE_DAYS,
  RENEWAL_WINDOW_DAYS,
  PLANS,
  getPlan,
  addMonths,
  quoteSubscription,
  subscriptionStatusAt,
  canLicenceAt,
  renewalQuote,
  applyDownload,
};
