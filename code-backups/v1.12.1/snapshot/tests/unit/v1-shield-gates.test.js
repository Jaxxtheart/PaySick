/**
 * Unit tests — Shield Framework 5-gate decision engine.
 *
 * The engine is a pure function:
 *   runShieldDecision(context) -> { decision, gate?, reason?, ...terms }
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { runShieldDecision } = require('../../backend/src/services/shield-gates.service');

function mergeDeep(a, b) {
  const out = { ...a };
  Object.keys(b).forEach((k) => {
    out[k] =
      b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && !(b[k] instanceof Date)
        ? mergeDeep(a[k] || {}, b[k])
        : b[k];
  });
  return out;
}

function baseline(overrides = {}) {
  const ctx = {
    application: {
      applicationId: 'app-1',
      segment: 'SEGMENT_2_OOP',
      procedureUrgency: 'ELECTIVE',
      providerInvoiceAmount: 1000000,
      termMonths: 12
    },
    provider: {
      providerId: 'prov-1',
      status: 'ACTIVE',
      billingAgreementSigned: true,
      bookSharePercent: 0.02,
      procedureTypeSharePercent: 0.05,
      patientPdRate: 0.01
    },
    patient: {
      patientId: 'pat-1',
      verifiedMonthlyIncome: 5000000,
      incomeVerificationMethod: 'STITCH_OPEN_BANKING',
      verifiedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    },
    portfolio: {
      arrearsRate: 0.02,
      balanceSheetPercent: 0.2,
      segment1TariffFlaggedRate: 0.01,
      reserveFundBalance: 100_000_000,
      monthlyFeeIncome: 10_000_000
    },
    segment1: {
      benchmarkProcedureCost: 1000000,
      patientPlanCoveragePercent: 1.0,
      dspIsOnList: true
    },
    feePercent: 5
  };
  return mergeDeep(ctx, overrides);
}

describe('Gate 1 — Provider Gate', () => {
  test('APPROVES when provider is ACTIVE and all checks pass', () => {
    const r = runShieldDecision(baseline());
    assert.equal(r.decision, 'APPROVED');
  });

  test('DECLINES when provider is SUSPENDED', () => {
    const r = runShieldDecision(baseline({ provider: { status: 'SUSPENDED' } }));
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_1_PROVIDER');
  });

  test('DECLINES when provider book share >= 5%', () => {
    const r = runShieldDecision(baseline({ provider: { bookSharePercent: 0.06 } }));
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_1_PROVIDER');
  });

  test('DECLINES when procedure type share >= 20%', () => {
    const r = runShieldDecision(baseline({ provider: { procedureTypeSharePercent: 0.21 } }));
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_1_PROVIDER');
  });
});

describe('Gate 2 — Patient Affordability Gate', () => {
  test('BLOCKS instalment exceeding 20% of verified income', () => {
    const r = runShieldDecision(
      baseline({
        application: { providerInvoiceAmount: 24000000, termMonths: 12 },
        patient: { verifiedMonthlyIncome: 5000000 }
      })
    );
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_2_AFFORDABILITY');
  });

  test('BLOCKS instalment exceeding 15% when income verified by manual review', () => {
    const r = runShieldDecision(
      baseline({
        application: { providerInvoiceAmount: 10000000, termMonths: 12 },
        patient: { verifiedMonthlyIncome: 5000000, incomeVerificationMethod: 'MANUAL_REVIEW' }
      })
    );
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_2_AFFORDABILITY');
  });

  test('DECLINES when income verification is stale (>90 days)', () => {
    const r = runShieldDecision(
      baseline({
        patient: { verifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) }
      })
    );
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_2_AFFORDABILITY');
  });

  test('DECLINES when patient has no verified income', () => {
    const r = runShieldDecision(baseline({ patient: { verifiedMonthlyIncome: null } }));
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_2_AFFORDABILITY');
  });
});

describe('Gate 3 — Urgency & Cooling-Off Gate', () => {
  test('ELECTIVE >R15,000 returns COOLING_OFF with expiry 48h out', () => {
    const r = runShieldDecision(
      baseline({
        application: { procedureUrgency: 'ELECTIVE', providerInvoiceAmount: 2000000 }
      })
    );
    assert.equal(r.decision, 'COOLING_OFF');
    assert.ok(r.coolingOffExpiresAt);
    const diffMs = new Date(r.coolingOffExpiresAt).getTime() - Date.now();
    assert.ok(diffMs > 47 * 3600 * 1000);
    assert.ok(diffMs < 49 * 3600 * 1000);
  });

  test('ELECTIVE <=R15,000 does not trigger cooling-off', () => {
    const r = runShieldDecision(
      baseline({ application: { procedureUrgency: 'ELECTIVE', providerInvoiceAmount: 1000000 } })
    );
    assert.equal(r.decision, 'APPROVED');
  });

  test('URGENT skips cooling-off even at high amounts', () => {
    const r = runShieldDecision(
      baseline({
        application: { procedureUrgency: 'URGENT', providerInvoiceAmount: 2500000 },
        patient: { verifiedMonthlyIncome: 80000000 }
      })
    );
    assert.equal(r.decision, 'APPROVED');
  });

  test('URGENT applies tighter 0.15 affordability ceiling', () => {
    const r = runShieldDecision(
      baseline({
        application: {
          procedureUrgency: 'URGENT',
          providerInvoiceAmount: 10000000,
          termMonths: 12
        },
        patient: { verifiedMonthlyIncome: 5000000 }
      })
    );
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_2_AFFORDABILITY');
  });
});

describe('Gate 4 — Tariff Control Gate (Segment 1 only)', () => {
  test('ROUTES to manual review when invoice exceeds benchmark by 30%+', () => {
    const r = runShieldDecision(
      baseline({
        application: { segment: 'SEGMENT_1_GAP', providerInvoiceAmount: 1400000 },
        segment1: {
          benchmarkProcedureCost: 1000000,
          dspIsOnList: true,
          patientPlanCoveragePercent: 1.0
        }
      })
    );
    assert.equal(r.decision, 'MANUAL_REVIEW');
    assert.equal(r.gate, 'GATE_4_TARIFF');
  });

  test('SETS dspWarningRequired when provider not on scheme DSP list', () => {
    const r = runShieldDecision(
      baseline({
        application: { segment: 'SEGMENT_1_GAP', providerInvoiceAmount: 1000000 },
        segment1: {
          benchmarkProcedureCost: 1000000,
          dspIsOnList: false,
          patientPlanCoveragePercent: 1.0
        }
      })
    );
    assert.equal(r.dspWarningRequired, true);
  });

  test('CALCULATES facilitation from benchmark, not provider invoice', () => {
    const r = runShieldDecision(
      baseline({
        application: { segment: 'SEGMENT_1_GAP', providerInvoiceAmount: 1200000 },
        segment1: {
          benchmarkProcedureCost: 1000000,
          dspIsOnList: true,
          patientPlanCoveragePercent: 0.8
        }
      })
    );
    assert.equal(r.disbursementAmount, 200000);
  });

  test('Gate 4 only applies to SEGMENT_1_GAP', () => {
    const r = runShieldDecision(
      baseline({
        application: { segment: 'SEGMENT_2_OOP', providerInvoiceAmount: 1400000 },
        segment1: { benchmarkProcedureCost: 1000000 }
      })
    );
    assert.equal(r.decision, 'APPROVED');
  });
});

describe('Gate 5 — Portfolio Circuit Breakers', () => {
  test('SUSPENDS application when provider 90-day PD exceeds 8%', () => {
    const r = runShieldDecision(baseline({ provider: { patientPdRate: 0.09 } }));
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_5_CIRCUIT_BREAKER');
    assert.equal(r.circuitBreaker, 'PROVIDER_PD_RATE');
  });

  test('TIGHTENS affordability ceiling when portfolio arrears exceed 6%', () => {
    const r = runShieldDecision(
      baseline({
        portfolio: { arrearsRate: 0.07 },
        application: { providerInvoiceAmount: 10000000, termMonths: 12 },
        patient: { verifiedMonthlyIncome: 5000000 }
      })
    );
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_2_AFFORDABILITY');
  });

  test('Declines balance-sheet origination when balanceSheetPercent > 40%', () => {
    const r = runShieldDecision(baseline({ portfolio: { balanceSheetPercent: 0.5 } }));
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.gate, 'GATE_5_CIRCUIT_BREAKER');
    assert.equal(r.circuitBreaker, 'BALANCE_SHEET');
  });

  test('Flags reserve fund breaker when reserve < 15% of monthly fee income', () => {
    const r = runShieldDecision(
      baseline({
        portfolio: { reserveFundBalance: 100_000, monthlyFeeIncome: 100_000_000 }
      })
    );
    assert.ok(r.circuitBreakersFired.includes('RESERVE_FUND'));
  });
});

describe('Terminology compliance — Shield decision responses', () => {
  const PROHIBITED = ['loan', 'interest', 'borrower', 'default ', 'lend'];

  function scan(obj) {
    const str = JSON.stringify(obj).toLowerCase();
    return PROHIBITED.filter((t) => str.includes(t));
  }

  test('APPROVED response contains no prohibited terms', () => {
    assert.deepEqual(scan(runShieldDecision(baseline())), []);
  });

  test('DECLINED response contains no prohibited terms', () => {
    assert.deepEqual(scan(runShieldDecision(baseline({ provider: { status: 'SUSPENDED' } }))), []);
  });

  test('MANUAL_REVIEW response contains no prohibited terms', () => {
    const r = runShieldDecision(
      baseline({
        application: { segment: 'SEGMENT_1_GAP', providerInvoiceAmount: 1500000 },
        segment1: {
          benchmarkProcedureCost: 1000000,
          dspIsOnList: true,
          patientPlanCoveragePercent: 1.0
        }
      })
    );
    assert.deepEqual(scan(r), []);
  });

  test('COOLING_OFF response contains no prohibited terms', () => {
    const r = runShieldDecision(
      baseline({
        application: { procedureUrgency: 'ELECTIVE', providerInvoiceAmount: 2000000 }
      })
    );
    assert.deepEqual(scan(r), []);
  });
});
