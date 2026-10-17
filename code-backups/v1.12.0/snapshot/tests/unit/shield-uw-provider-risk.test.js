/**
 * Shield Underwriting — Provider Risk Management.
 *
 * Provider risk controls exposure to the provider (moral hazard of paying
 * upfront): verification, graduated trust tiers, per-patient and volume
 * caps, concentration, performance breakers with minimum sample sizes,
 * tariff control, and the staged payout plan. The provider grade is ALSO
 * handed to the Medical Risk Score as one PD feature.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { POLICY } = require('../../backend/src/shield/policy');
const { assessProviderRisk } = require('../../backend/src/shield/provider-risk');
const { NOW, daysAgo, prodSource, baselineInput } = require('./fixtures/shield-input');

function pr(overrides = {}, opts = {}) {
  const input = baselineInput(overrides);
  return assessProviderRisk(
    { ...input, facilitationAmountCents: opts.facilitationAmountCents ?? input.application.amountCents },
    POLICY,
    { now: NOW, allowMockSources: false }
  );
}

const GAP = {
  application: { segment: 'SEGMENT_1_GAP', amountCents: 3_000_000 },
  segment1: {
    benchmarkCents: 2_500_000,
    schemeBenefitCents: 2_000_000,
    schemeMembershipVerified: true,
    dspIsOnList: true,
    source: prodSource('scheme-verification')
  }
};

describe('provider risk — verification, status and tiers', () => {
  test('clean standard-tier provider passes with tier limits', () => {
    const r = pr();
    assert.equal(r.status, 'PASS');
    assert.equal(r.grade, 'P2');
    assert.equal(r.limits.perPatientCapCents, 2_500_000);
    assert.equal(r.payoutPlan.holdbackPct, 5);
  });

  test('suspended provider → DECLINE', () => {
    const r = pr({ provider: { status: 'SUSPENDED' } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('PROVIDER_STATUS'));
  });

  test('NEW provider is treated as probation (R10,000 per-patient cap)', () => {
    const r = pr({ provider: { tier: 'NEW' } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('PROVIDER_TIER_PATIENT_CAP'));
    assert.equal(r.limits.perPatientCapCents, 1_000_000);
    assert.equal(r.grade, 'P3');
  });

  test('unverified HPCSA / practice number / bank account → REFER', () => {
    for (const k of ['hpcsaVerified', 'practiceNumberVerified', 'bankAccountVerified']) {
      const r = pr({ provider: { verification: { [k]: false } } });
      assert.equal(r.status, 'REFER', k);
      assert.ok(r.reasonCodes.includes('PROVIDER_VERIFICATION_INCOMPLETE'), k);
    }
  });

  test('verification older than 12 months → REFER', () => {
    const r = pr({ provider: { verification: { verifiedAt: daysAgo(400) } } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('PROVIDER_VERIFICATION_STALE'));
  });

  test('monthly volume cap reached → REFER', () => {
    const r = pr({ provider: { metrics: { monthlyVolumeCount: 30 } } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('PROVIDER_MONTHLY_VOLUME_CAP'));
  });

  test('missing provider or metrics or portfolio → REFER (fail closed)', () => {
    assert.ok(pr({ provider: null }).reasonCodes.includes('DATA_UNAVAILABLE:provider'));
    assert.ok(pr({ provider: { metrics: null } }).reasonCodes.includes('DATA_UNAVAILABLE:providerMetrics'));
    assert.ok(pr({ portfolio: null }).reasonCodes.includes('DATA_UNAVAILABLE:portfolio'));
    assert.equal(pr({ portfolio: null }).status, 'REFER');
  });
});

describe('provider risk — concentration (ramp-up aware)', () => {
  test('small book uses absolute rand caps, not percentages', () => {
    const r = pr();
    assert.equal(r.measures.concentrationMode, 'RAMP_UP_ABSOLUTE');
    // A brand-new provider's first arrangement is 100% of its own share —
    // that must NOT block in ramp-up.
    const fresh = pr({ provider: { metrics: { outstandingCents: 0 } }, portfolio: { totalOutstandingCents: 0, procedureTypeOutstandingCents: 0, activeArrangements: 0 } });
    assert.equal(fresh.status, 'PASS');
  });

  test('ramp-up: provider exposure above absolute cap → DECLINE', () => {
    const r = pr({ provider: { metrics: { outstandingCents: POLICY.provider.rampUp.providerCapCents } } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('CONCENTRATION_PROVIDER'));
  });

  test('ramp-up: procedure-type exposure above absolute cap → DECLINE', () => {
    const r = pr({ portfolio: { procedureTypeOutstandingCents: POLICY.provider.rampUp.procedureTypeCapCents } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('CONCENTRATION_PROCEDURE_TYPE'));
  });

  test('mature book: projected provider share above 5% → DECLINE', () => {
    const r = pr({
      portfolio: { totalOutstandingCents: 5_000_000_000, procedureTypeOutstandingCents: 100_000_000 },
      provider: { metrics: { outstandingCents: 260_000_000 } }
    });
    assert.equal(r.measures.concentrationMode, 'PORTFOLIO_SHARE');
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('CONCENTRATION_PROVIDER'));
  });
});

describe('provider risk — performance breakers need credible samples', () => {
  test('tiny sample never suspends a provider (1 miss in 2)', () => {
    const r = pr({ provider: { metrics: { arrangements90d: 2, missed90dRate: 0.5 } } });
    assert.notEqual(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('PROVIDER_METRICS_LOW_CREDIBILITY'));
  });

  test('credible missed-payment rate above 8% → DECLINE (suspend)', () => {
    const r = pr({ provider: { metrics: { arrangements90d: 25, missed90dRate: 0.09 } } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('PROVIDER_PERFORMANCE_SUSPENSION'));
  });

  test('credible missed-payment rate in watch band → REFER and P4 grade', () => {
    const r = pr({ provider: { metrics: { arrangements90d: 25, missed90dRate: 0.06 } } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('PROVIDER_PERFORMANCE_WATCH'));
    assert.equal(r.grade, 'P4');
  });

  test('first-instalment failure rate (collusion signal) → DECLINE', () => {
    const r = pr({ provider: { metrics: { fpdSample: 12, fpdRate: 0.09 } } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('PROVIDER_FIRST_INSTALMENT_FAILURE'));
  });

  test('dispute rate or complaints → REFER', () => {
    assert.ok(pr({ provider: { metrics: { disputeRate: 0.06 } } }).reasonCodes.includes('PROVIDER_DISPUTE_RATE'));
    assert.ok(pr({ provider: { metrics: { complaints30d: 3 } } }).reasonCodes.includes('PROVIDER_COMPLAINTS'));
  });

  test('trusted tier with clean credible record → P1', () => {
    const r = pr({ provider: { tier: 'trusted', metrics: { arrangements90d: 120, missed90dRate: 0.01 } } });
    assert.equal(r.grade, 'P1');
  });
});

describe('provider risk — tariff control (gap segment)', () => {
  test('gap without billing agreement → DECLINE', () => {
    const r = pr({ ...GAP, provider: { billingAgreementSigned: false } }, { facilitationAmountCents: 1_000_000 });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('PROVIDER_NO_BILLING_AGREEMENT'));
  });

  test('invoice 1.3–1.5× benchmark → REFER; above 1.5× → DECLINE', () => {
    const refer = pr({ ...GAP, application: { segment: 'SEGMENT_1_GAP', amountCents: 3_500_000 } }, { facilitationAmountCents: 1_500_000 });
    assert.ok(refer.reasonCodes.includes('TARIFF_ABOVE_BENCHMARK'));
    assert.equal(refer.status, 'REFER');
    const decline = pr({ ...GAP, application: { segment: 'SEGMENT_1_GAP', amountCents: 4_000_000 } }, { facilitationAmountCents: 2_000_000 });
    assert.ok(decline.reasonCodes.includes('TARIFF_ABOVE_HARD_LIMIT'));
    assert.equal(decline.status, 'DECLINE');
  });

  test('missing benchmark → REFER (never a silent pass)', () => {
    const r = pr({ ...GAP, segment1: { benchmarkCents: null } }, { facilitationAmountCents: 1_000_000 });
    assert.ok(r.reasonCodes.includes('TARIFF_BENCHMARK_UNAVAILABLE'));
  });
});

describe('provider risk — staged payout plan', () => {
  test('self-pay: 80% on two-sided procedure confirmation, rest after first collection, holdback retained', () => {
    const { payoutPlan } = pr();
    const total = payoutPlan.tranches.reduce((s, t) => s + t.amountCents, 0);
    assert.equal(total, 1_200_000);
    assert.equal(payoutPlan.tranches[0].amountCents, 960_000);
    assert.deepEqual(payoutPlan.tranches[0].releaseConditions,
      ['PATIENT_PROCEDURE_CONFIRMATION', 'PROVIDER_PROCEDURE_CONFIRMATION']);
    assert.ok(payoutPlan.tranches[1].releaseConditions.includes('FIRST_INSTALMENT_COLLECTED'));
    const hb = payoutPlan.tranches.find((t) => t.releaseConditions.includes('HOLDBACK_RELEASE_90_DAYS_CURRENT'));
    assert.equal(hb.amountCents, 60_000);
    assert.ok(payoutPlan.conditions.includes('PROVIDER_RECOURSE_ON_DISPUTE'));
  });

  test('gap: second tranche waits for EOB reconciliation', () => {
    const { payoutPlan } = pr(GAP, { facilitationAmountCents: 1_000_000 });
    assert.ok(payoutPlan.tranches[1].releaseConditions.includes('EOB_RECONCILIATION'));
  });

  test('exposes the provider PD features', () => {
    const r = pr();
    for (const k of ['providerGrade', 'providerMissedRateCredible', 'providerDisputeRate']) {
      assert.ok(k in r.pdFeatures, k);
    }
  });
});
