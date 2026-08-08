'use strict';

/**
 * Unit Tests — SANParks media subscription engine
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The SANParks Media Licensing product sells access to imagery and footage
 * captured on SANParks property. Access is subscription-based and the
 * subscription runs for a fixed term that the subscriber renews:
 *
 *   - Terms are 12 or 24 months. Nothing else is a valid term.
 *   - A 24-month term is cheaper per year than two 12-month terms (term discount).
 *   - Renewing BEFORE expiry is continuous: the new term starts the day the old
 *     one ends, so there is no gap in licensing cover.
 *   - After expiry there is a grace window. Renewing inside grace is still
 *     continuous (backdated to the old expiry) so the subscriber does not end up
 *     with an unlicensed period they downloaded during.
 *   - After grace the subscription is LAPSED and renewal is a fresh term starting
 *     today, with no price lock.
 *   - Renewing before expiry locks the price of the expiring term for one more
 *     term. Renewing in grace does not.
 *
 * Money is integer cents throughout (CLAUDE.md: never floating point for money).
 *
 * Run: node --test tests/unit/sanparks-subscription.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const subs = require('../../backend/src/services/sanparks-subscription.service');

const {
  PLANS,
  TERM_MONTHS_OPTIONS,
  GRACE_DAYS,
  RENEWAL_WINDOW_DAYS,
  getPlan,
  addMonths,
  quoteSubscription,
  subscriptionStatusAt,
  renewalQuote,
  applyDownload,
  canLicenceAt,
} = subs;

const DAY = 24 * 60 * 60 * 1000;

// ─── Plan catalogue ──────────────────────────────────────────────────────────

describe('plan catalogue', () => {
  test('exposes four ascending tiers', () => {
    const codes = PLANS.map((p) => p.code);
    assert.deepEqual(codes, ['SUPPORTER', 'CREATOR', 'COMMERCIAL', 'BROADCAST']);
  });

  test('annual prices are integer cents and strictly ascending', () => {
    for (const plan of PLANS) {
      assert.ok(Number.isInteger(plan.annualPriceCents), `${plan.code} price not integer cents`);
    }
    for (let i = 1; i < PLANS.length; i += 1) {
      assert.ok(
        PLANS[i].annualPriceCents > PLANS[i - 1].annualPriceCents,
        `${PLANS[i].code} must cost more than ${PLANS[i - 1].code}`
      );
    }
  });

  test('each plan declares the licence scopes it may buy', () => {
    assert.deepEqual(getPlan('SUPPORTER').allowedScopes, ['PERSONAL']);
    assert.ok(getPlan('CREATOR').allowedScopes.includes('EDITORIAL'));
    assert.ok(getPlan('COMMERCIAL').allowedScopes.includes('COMMERCIAL'));
    assert.ok(getPlan('BROADCAST').allowedScopes.includes('BROADCAST'));
  });

  test('only the top tier may acquire exclusive rights or a buyout', () => {
    assert.equal(getPlan('SUPPORTER').exclusivityEligible, false);
    assert.equal(getPlan('CREATOR').exclusivityEligible, false);
    assert.equal(getPlan('COMMERCIAL').exclusivityEligible, false);
    assert.equal(getPlan('BROADCAST').exclusivityEligible, true);
    assert.ok(getPlan('BROADCAST').allowedScopes.includes('EXCLUSIVE_BUYOUT'));
  });

  test('lower tiers are capped to lower resolution deliverables', () => {
    assert.equal(getPlan('SUPPORTER').maxResolutionTier, 'WEB');
    assert.equal(getPlan('BROADCAST').maxResolutionTier, 'MASTER');
  });

  test('getPlan is case-insensitive and rejects unknown codes', () => {
    assert.equal(getPlan('creator').code, 'CREATOR');
    assert.throws(() => getPlan('PLATINUM'), /unknown plan/i);
  });
});

// ─── Term rules ──────────────────────────────────────────────────────────────

describe('term options', () => {
  test('only 12 and 24 month terms exist', () => {
    assert.deepEqual(TERM_MONTHS_OPTIONS, [12, 24]);
  });

  test('quoting any other term is rejected', () => {
    for (const bad of [1, 6, 11, 18, 36, 0, -12]) {
      assert.throws(
        () => quoteSubscription({ planCode: 'CREATOR', termMonths: bad, startDate: new Date('2026-08-08') }),
        /term/i,
        `term ${bad} should be rejected`
      );
    }
  });
});

describe('addMonths', () => {
  test('adds whole months', () => {
    assert.equal(addMonths(new Date('2026-08-08T00:00:00Z'), 12).toISOString().slice(0, 10), '2027-08-08');
    assert.equal(addMonths(new Date('2026-08-08T00:00:00Z'), 24).toISOString().slice(0, 10), '2028-08-08');
  });

  test('clamps to the last day when the target month is shorter', () => {
    // 31 Jan + 1 month must not roll into March.
    assert.equal(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10), '2026-02-28');
  });

  test('handles a leap-day start rolling to a non-leap year', () => {
    assert.equal(addMonths(new Date('2028-02-29T00:00:00Z'), 12).toISOString().slice(0, 10), '2029-02-28');
  });
});

// ─── Subscription quoting ────────────────────────────────────────────────────

describe('quoteSubscription', () => {
  const start = new Date('2026-08-08T00:00:00Z');

  test('a 12-month term costs exactly the plan annual price before VAT', () => {
    const q = quoteSubscription({ planCode: 'CREATOR', termMonths: 12, startDate: start });
    assert.equal(q.netCents, getPlan('CREATOR').annualPriceCents);
    assert.equal(q.termDiscountCents, 0);
  });

  test('a 24-month term is discounted against two annual prices', () => {
    const plan = getPlan('CREATOR');
    const q = quoteSubscription({ planCode: 'CREATOR', termMonths: 24, startDate: start });
    const undiscounted = plan.annualPriceCents * 2;
    assert.equal(q.listCents, undiscounted);
    assert.ok(q.termDiscountCents > 0, 'a two-year term must carry a discount');
    assert.equal(q.netCents, undiscounted - q.termDiscountCents);
    assert.ok(q.netCents < undiscounted);
  });

  test('two-year term is cheaper per month than a one-year term', () => {
    const oneYear = quoteSubscription({ planCode: 'COMMERCIAL', termMonths: 12, startDate: start });
    const twoYear = quoteSubscription({ planCode: 'COMMERCIAL', termMonths: 24, startDate: start });
    assert.ok(twoYear.netCents / 24 < oneYear.netCents / 12);
  });

  test('VAT is 15% of net and gross is net plus VAT, all integer cents', () => {
    const q = quoteSubscription({ planCode: 'BROADCAST', termMonths: 24, startDate: start });
    assert.ok(Number.isInteger(q.netCents));
    assert.ok(Number.isInteger(q.vatCents));
    assert.ok(Number.isInteger(q.grossCents));
    assert.equal(q.vatCents, Math.round(q.netCents * 0.15));
    assert.equal(q.grossCents, q.netCents + q.vatCents);
  });

  test('download credits scale with the term length', () => {
    const plan = getPlan('CREATOR');
    const oneYear = quoteSubscription({ planCode: 'CREATOR', termMonths: 12, startDate: start });
    const twoYear = quoteSubscription({ planCode: 'CREATOR', termMonths: 24, startDate: start });
    assert.equal(oneYear.creditsIncluded, plan.annualCredits);
    assert.equal(twoYear.creditsIncluded, plan.annualCredits * 2);
  });

  test('the quote carries the term boundaries', () => {
    const q = quoteSubscription({ planCode: 'SUPPORTER', termMonths: 24, startDate: start });
    assert.equal(q.startsAt.toISOString().slice(0, 10), '2026-08-08');
    assert.equal(q.expiresAt.toISOString().slice(0, 10), '2028-08-08');
    assert.equal(q.termMonths, 24);
  });
});

// ─── Status over time ────────────────────────────────────────────────────────

describe('subscriptionStatusAt', () => {
  const sub = {
    planCode: 'CREATOR',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    cancelledAt: null,
  };

  test('ACTIVE inside the term', () => {
    assert.equal(subscriptionStatusAt(sub, new Date('2026-06-01T00:00:00Z')), 'ACTIVE');
  });

  test('PENDING before the term starts', () => {
    assert.equal(subscriptionStatusAt(sub, new Date('2025-12-01T00:00:00Z')), 'PENDING');
  });

  test('GRACE just after expiry, within the grace window', () => {
    const inGrace = new Date(sub.expiresAt.getTime() + 5 * DAY);
    assert.equal(subscriptionStatusAt(sub, inGrace), 'GRACE');
  });

  test('LAPSED once the grace window has passed', () => {
    const afterGrace = new Date(sub.expiresAt.getTime() + (GRACE_DAYS + 1) * DAY);
    assert.equal(subscriptionStatusAt(sub, afterGrace), 'LAPSED');
  });

  test('CANCELLED wins over everything once cancelled', () => {
    const cancelled = { ...sub, cancelledAt: new Date('2026-03-01T00:00:00Z') };
    assert.equal(subscriptionStatusAt(cancelled, new Date('2026-06-01T00:00:00Z')), 'CANCELLED');
  });
});

describe('canLicenceAt', () => {
  const sub = {
    planCode: 'CREATOR',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    cancelledAt: null,
  };

  test('an active subscription may licence', () => {
    assert.equal(canLicenceAt(sub, new Date('2026-06-01T00:00:00Z')), true);
  });

  test('a subscription in grace may NOT licence — grace is for renewing, not buying', () => {
    assert.equal(canLicenceAt(sub, new Date(sub.expiresAt.getTime() + 3 * DAY)), false);
  });

  test('lapsed and cancelled subscriptions may not licence', () => {
    assert.equal(canLicenceAt(sub, new Date(sub.expiresAt.getTime() + 400 * DAY)), false);
    assert.equal(
      canLicenceAt({ ...sub, cancelledAt: new Date('2026-02-01T00:00:00Z') }, new Date('2026-06-01T00:00:00Z')),
      false
    );
  });
});

// ─── Renewal ─────────────────────────────────────────────────────────────────

describe('renewalQuote', () => {
  const sub = {
    subscriptionId: 'sub-1',
    planCode: 'COMMERCIAL',
    termMonths: 12,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    netCents: getPlan('COMMERCIAL').annualPriceCents,
    cancelledAt: null,
  };

  test('renewing inside the renewal window is continuous — new term starts at old expiry', () => {
    const now = new Date(sub.expiresAt.getTime() - 10 * DAY);
    const q = renewalQuote(sub, { termMonths: 12, now });
    assert.equal(q.continuous, true);
    assert.equal(q.startsAt.toISOString(), sub.expiresAt.toISOString());
    assert.equal(q.expiresAt.toISOString().slice(0, 10), '2028-01-01');
  });

  test('renewing too early — outside the renewal window — is rejected', () => {
    const tooEarly = new Date(sub.expiresAt.getTime() - (RENEWAL_WINDOW_DAYS + 5) * DAY);
    assert.throws(() => renewalQuote(sub, { termMonths: 12, now: tooEarly }), /renewal window/i);
  });

  test('renewing during grace stays continuous so no unlicensed gap is created', () => {
    const inGrace = new Date(sub.expiresAt.getTime() + 5 * DAY);
    const q = renewalQuote(sub, { termMonths: 12, now: inGrace });
    assert.equal(q.continuous, true);
    assert.equal(q.startsAt.toISOString(), sub.expiresAt.toISOString());
  });

  test('renewing after grace starts a fresh term from today', () => {
    const afterGrace = new Date(sub.expiresAt.getTime() + (GRACE_DAYS + 10) * DAY);
    const q = renewalQuote(sub, { termMonths: 12, now: afterGrace });
    assert.equal(q.continuous, false);
    assert.equal(q.startsAt.toISOString(), afterGrace.toISOString());
  });

  test('renewing before expiry locks the expiring term price for one more term', () => {
    const now = new Date(sub.expiresAt.getTime() - 10 * DAY);
    const stale = { ...sub, netCents: 100000 }; // subscriber bought in cheaper
    const q = renewalQuote(stale, { termMonths: 12, now });
    assert.equal(q.priceLocked, true);
    assert.equal(q.netCents, 100000);
  });

  test('renewing in grace pays the current list price, not the locked one', () => {
    const inGrace = new Date(sub.expiresAt.getTime() + 5 * DAY);
    const stale = { ...sub, netCents: 100000 };
    const q = renewalQuote(stale, { termMonths: 12, now: inGrace });
    assert.equal(q.priceLocked, false);
    assert.equal(q.netCents, getPlan('COMMERCIAL').annualPriceCents);
  });

  test('the renewal term may differ from the original term', () => {
    const now = new Date(sub.expiresAt.getTime() - 10 * DAY);
    const q = renewalQuote(sub, { termMonths: 24, now });
    assert.equal(q.termMonths, 24);
    assert.equal(q.expiresAt.toISOString().slice(0, 10), '2029-01-01');
  });

  test('price lock does not survive a term-length change — a 24-month renewal is re-quoted', () => {
    const now = new Date(sub.expiresAt.getTime() - 10 * DAY);
    const stale = { ...sub, netCents: 100000 };
    const q = renewalQuote(stale, { termMonths: 24, now });
    assert.equal(q.priceLocked, false);
  });

  test('a cancelled subscription cannot be renewed', () => {
    const cancelled = { ...sub, cancelledAt: new Date('2026-06-01T00:00:00Z') };
    const now = new Date(sub.expiresAt.getTime() - 10 * DAY);
    assert.throws(() => renewalQuote(cancelled, { termMonths: 12, now }), /cancelled/i);
  });

  test('renewal credits are added on top of unused credits when continuous', () => {
    const now = new Date(sub.expiresAt.getTime() - 10 * DAY);
    const withLeftovers = { ...sub, creditsRemaining: 17 };
    const q = renewalQuote(withLeftovers, { termMonths: 12, now });
    assert.equal(q.creditsCarriedOver, 17);
    assert.equal(q.creditsRemainingAfter, 17 + getPlan('COMMERCIAL').annualCredits);
  });

  test('unused credits are forfeited when the renewal is not continuous', () => {
    const afterGrace = new Date(sub.expiresAt.getTime() + (GRACE_DAYS + 10) * DAY);
    const withLeftovers = { ...sub, creditsRemaining: 17 };
    const q = renewalQuote(withLeftovers, { termMonths: 12, now: afterGrace });
    assert.equal(q.creditsCarriedOver, 0);
    assert.equal(q.creditsRemainingAfter, getPlan('COMMERCIAL').annualCredits);
  });
});

// ─── Credit accounting ───────────────────────────────────────────────────────

describe('applyDownload', () => {
  test('a covered download spends one credit', () => {
    const r = applyDownload({ creditsRemaining: 5 }, { creditCost: 1 });
    assert.equal(r.creditsSpent, 1);
    assert.equal(r.creditsRemainingAfter, 4);
    assert.equal(r.overageUnits, 0);
  });

  test('a download costing more credits than remain splits into credits plus overage', () => {
    const r = applyDownload({ creditsRemaining: 2 }, { creditCost: 5 });
    assert.equal(r.creditsSpent, 2);
    assert.equal(r.creditsRemainingAfter, 0);
    assert.equal(r.overageUnits, 3);
  });

  test('with no credits left the whole download is overage', () => {
    const r = applyDownload({ creditsRemaining: 0 }, { creditCost: 3 });
    assert.equal(r.creditsSpent, 0);
    assert.equal(r.overageUnits, 3);
  });

  test('credits never go negative', () => {
    const r = applyDownload({ creditsRemaining: 1 }, { creditCost: 10 });
    assert.ok(r.creditsRemainingAfter >= 0);
  });

  test('a zero-credit licence (commercial buyouts are always cash) spends nothing', () => {
    const r = applyDownload({ creditsRemaining: 9 }, { creditCost: 0 });
    assert.equal(r.creditsSpent, 0);
    assert.equal(r.creditsRemainingAfter, 9);
    assert.equal(r.overageUnits, 0);
  });
});
