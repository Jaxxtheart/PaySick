/**
 * Shield Underwriting — orchestration engine and decision record.
 *
 * underwrite(input, { now }) evaluates EVERY stage (so declined applications
 * still produce a full feature vector for the data flywheel), then the
 * decision is the most severe stage result:
 *
 *   DECLINED  >  REFER  >  APPROVED(_COOLING_OFF)
 *
 * Outcomes are reported in three clearly separated sections plus an
 * explicit outcomeMap stating what feeds the PD, what is patient
 * affordability, and what is provider risk management.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { underwrite } = require('../../backend/src/shield/engine');
const { POLICY, derivePolicy } = require('../../backend/src/shield/policy');
const { buildDecisionRecord, replayDecision, canonicalHash } = require('../../backend/src/shield/decision-record');
const shield = require('../../backend/src/shield');
const { NOW, prodSource, baselineInput } = require('./fixtures/shield-input');

const OPTS = { now: NOW };
const run = (overrides = {}, opts = {}) => underwrite(baselineInput(overrides), { ...OPTS, ...opts });

const GAP_POLICY = derivePolicy({ segments: { SEGMENT_1_GAP: { enabled: true } } }, 'TEST-GAP-ENABLED');
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

describe('engine — happy path and outcome structure', () => {
  test('clean application is APPROVED and marketplace-eligible', () => {
    const r = run();
    assert.equal(r.decision, 'APPROVED', JSON.stringify(r.reasonCodes));
    assert.equal(r.marketplaceEligible, true);
    assert.equal(r.humanReviewRequired, false);
    assert.equal(r.fundingRoute, 'MARKETPLACE_OR_BALANCE_SHEET');
  });

  test('disbursement is conditional on mandate and two-sided procedure confirmation', () => {
    const r = run();
    for (const c of ['DEBICHECK_MANDATE_AUTHORISED', 'PATIENT_PROCEDURE_CONFIRMATION', 'PROVIDER_PROCEDURE_CONFIRMATION']) {
      assert.ok(r.disbursementConditions.includes(c), c);
    }
    const authorised = run({ mandate: { debiCheckAuthorised: true } });
    assert.ok(!authorised.disbursementConditions.includes('DEBICHECK_MANDATE_AUTHORISED'));
  });

  test('reports three separate sections plus versions', () => {
    const r = run();
    assert.ok(r.patientAffordability && r.patientAffordability.status);
    assert.ok(r.providerRisk && r.providerRisk.status);
    assert.ok(r.medicalRiskScore && typeof r.medicalRiskScore.pd12m === 'number');
    assert.equal(r.policyVersion, POLICY.version);
    assert.match(r.modelId, /^MRS-/);
    assert.equal(r.evaluatedAt, NOW.toISOString());
  });

  test('outcomeMap states exactly what feeds PD vs affordability vs provider risk', () => {
    const r = run();
    const map = r.outcomeMap;
    assert.deepEqual(map.probabilityOfNonRepayment.inputs, r.medicalRiskScore.pdInputs);
    for (const k of ['netAssessedCents', 'expenseNormCents', 'obligationsCents', 'discretionaryIncomeCents', 'instalmentCents', 'rti', 'dtiPost']) {
      assert.ok(map.patientAffordability.measures.includes(k), k);
    }
    for (const k of ['verification', 'tier', 'perPatientCapCents', 'concentration', 'performanceBreakers', 'tariffControl', 'payoutPlan']) {
      assert.ok(map.providerRiskManagement.controls.includes(k), k);
    }
    assert.deepEqual(map.probabilityOfNonRepayment.fromPatientAffordability.sort(),
      ['discretionaryCover', 'incomeCv', 'incomeVerificationMethod', 'rti'].sort());
    assert.deepEqual(map.probabilityOfNonRepayment.fromProviderRisk.sort(),
      ['providerDisputeRate', 'providerGrade', 'providerMissedRateCredible'].sort());
    assert.match(map.patientAffordability.rule, /never overridden/i);
  });

  test('requires an explicit evaluation time (determinism)', () => {
    assert.throws(() => underwrite(baselineInput(), {}), /now/);
  });

  test('deterministic: same input and time → identical outcome', () => {
    assert.deepEqual(run(), run());
  });
});

describe('engine — precedence and fail-closed behaviour', () => {
  test('a strong PD can never rescue failed affordability', () => {
    const r = run({ bureau: { score: 820 }, application: { amountCents: 7_000_000, termMonths: 6 }, provider: { tier: 'premium' } });
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.decisiveStage, 'AFFORDABILITY');
    assert.ok(r.medicalRiskScore.grade === 'A' || r.medicalRiskScore.grade === 'B');
  });

  test('knock-out is a hard decline, and the PD is still computed for reject inference', () => {
    const r = run({ bureau: { underDebtReview: true } });
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.decisiveStage, 'KNOCKOUT');
    assert.equal(r.hardDecline, true);
    assert.equal(typeof r.medicalRiskScore.pd12m, 'number');
  });

  test('missing portfolio metrics → REFER (no silent zeros)', () => {
    const r = run({ portfolio: null });
    assert.equal(r.decision, 'REFER');
    assert.equal(r.marketplaceEligible, false);
    assert.ok(r.reasonCodes.includes('DATA_UNAVAILABLE:portfolio'));
  });

  test('amber affordability → REFER with human review, not marketplace', () => {
    const r = run({ application: { amountCents: 6_000_000 }, provider: { tier: 'premium' } });
    assert.equal(r.decision, 'REFER');
    assert.equal(r.humanReviewRequired, true);
    assert.equal(r.marketplaceEligible, false);
  });

  test('mock data sources are refused unless explicitly allowed', () => {
    const mocked = baselineInput({ bureau: { source: { isMock: true } } });
    assert.equal(underwrite(mocked, OPTS).decision, 'REFER');
    assert.equal(underwrite(mocked, { ...OPTS, allowMockSources: true }).decision, 'APPROVED');
  });

  test('provider per-patient cap decline offers the largest amount that fits', () => {
    const r = run({ provider: { tier: 'NEW' } });
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.decisiveStage, 'PROVIDER');
    assert.equal(r.alternative.maxAmountCents, 1_000_000);
  });
});

describe('engine — portfolio circuit breakers', () => {
  test('arrears above tighten level → 15% RTI ceiling', () => {
    const r = run({ portfolio: { arrears30Rate: POLICY.portfolio.arrearsTightenRate + 0.01 } });
    assert.equal(r.patientAffordability.measures.rtiCeiling, 0.15);
    assert.ok(r.circuitBreakers.includes('PORTFOLIO_ARREARS_TIGHTEN'));
  });

  test('arrears above halt level → REFER every new origination', () => {
    const r = run({ portfolio: { arrears30Rate: POLICY.portfolio.arrearsHaltRate + 0.01 } });
    assert.equal(r.decision, 'REFER');
    assert.ok(r.reasonCodes.includes('PORTFOLIO_ORIGINATION_HALT'));
  });

  test('balance-sheet share above 40% → approved but marketplace-only funding', () => {
    const r = run({ portfolio: { balanceSheetShare: 0.45 } });
    assert.equal(r.decision, 'APPROVED');
    assert.equal(r.fundingRoute, 'MARKETPLACE_ONLY');
  });

  test('reserve fund below 15% of monthly fee income → REFER', () => {
    const r = run({ portfolio: { reserveFundCents: 1_000_000, monthlyFeeIncomeCents: 20_000_000 } });
    assert.equal(r.decision, 'REFER');
    assert.ok(r.reasonCodes.includes('RESERVE_FUND_BELOW_FLOOR'));
  });
});

describe('engine — segments and gap financing', () => {
  test('gap financing is a Phase 2 segment: disabled by default', () => {
    const r = run(GAP);
    assert.equal(r.decision, 'DECLINED');
    assert.ok(r.reasonCodes.includes('SEGMENT_NOT_ENABLED'));
  });

  test('gap amount = invoice − verified scheme benefit (never a rate multiple)', () => {
    const r = run(GAP, { policy: GAP_POLICY });
    assert.equal(r.terms.facilitationAmountCents, 1_000_000);
    assert.equal(r.decision, 'APPROVED', JSON.stringify(r.reasonCodes));
  });

  test('unknown gap amount only softens sizing declines — a suspended provider still declines', () => {
    const r = run({ ...GAP, segment1: { schemeBenefitCents: null }, provider: { status: 'SUSPENDED' } }, { policy: GAP_POLICY });
    assert.equal(r.decision, 'DECLINED');
    assert.ok(r.reasonCodes.includes('PROVIDER_STATUS'));
  });

  test('gap without a verified scheme benefit → REFER', () => {
    const r = run({ ...GAP, segment1: { schemeBenefitCents: null } }, { policy: GAP_POLICY });
    assert.equal(r.decision, 'REFER');
    assert.ok(r.reasonCodes.includes('GAP_SCHEME_BENEFIT_UNAVAILABLE'));
  });
});

describe('engine — cooling-off and MRS thresholds', () => {
  test('elective above R15,000 → APPROVED_COOLING_OFF for 48 hours', () => {
    const r = run({ application: { amountCents: 2_000_000 } });
    assert.equal(r.decision, 'APPROVED_COOLING_OFF');
    assert.equal(r.coolingOff.expiresAt, new Date(NOW.getTime() + 48 * 3600 * 1000).toISOString());
    assert.equal(r.marketplaceEligible, true);
  });

  test('PD above decline threshold → DECLINED at the MRS stage', () => {
    const r = run({ bureau: { score: 540, worstArrearsCycles12m: 2, enquiries90d: 7 } });
    assert.equal(r.decision, 'DECLINED');
    assert.equal(r.decisiveStage, 'MEDICAL_RISK_SCORE');
    assert.ok(r.reasonCodes.includes('PD_ABOVE_DECLINE_THRESHOLD'));
  });

  test('PD in refer band → REFER', () => {
    const r = run({ bureau: { score: 540, worstArrearsCycles12m: 2 } });
    assert.equal(r.decision, 'REFER');
    assert.ok(r.reasonCodes.includes('PD_REFER_BAND'));
  });

  test('expected loss above arrangement revenue → DECLINED', () => {
    const thin = derivePolicy({ pricing: { mdrPercent: 0.5 } }, 'TEST-THIN-MARGIN');
    const r = run({}, { policy: thin });
    assert.equal(r.decision, 'DECLINED');
    assert.ok(r.reasonCodes.includes('EXPECTED_LOSS_EXCEEDS_REVENUE'));
    assert.ok(r.medicalRiskScore.expectedLossToRevenue > 1);
  });
});

describe('engine — governance and language', () => {
  test('prohibited inputs are stripped, recorded, and change nothing', () => {
    const dirty = baselineInput({ chronicMedicationAdherence: 0.1, patientProfile: { race: 'x', age: 61 } });
    const r = underwrite(dirty, OPTS);
    assert.deepEqual(r.governance.prohibitedInputsRemoved.sort(),
      ['chronicMedicationAdherence', 'patientProfile.age', 'patientProfile.race']);
    assert.equal(r.medicalRiskScore.pd12m, run().medicalRiskScore.pd12m);
  });

  test('no prohibited terminology in any outcome', () => {
    const PROHIBITED = ['loan', 'interest', 'borrower', 'default ', 'lend'];
    const outcomes = [
      run(), run({ bureau: { underDebtReview: true } }), run({ portfolio: null }),
      run({ application: { amountCents: 2_000_000 } }), run({ bureau: { score: 540, worstArrearsCycles12m: 2 } })
    ];
    for (const o of outcomes) {
      const s = JSON.stringify(o).toLowerCase();
      for (const w of PROHIBITED) assert.ok(!s.includes(w), `found "${w}"`);
    }
  });
});

describe('decision record — audit and replay', () => {
  test('canonicalHash ignores key order', () => {
    assert.equal(canonicalHash({ a: 1, b: { c: 2, d: 3 } }), canonicalHash({ b: { d: 3, c: 2 }, a: 1 }));
  });

  test('record captures versions, hashes and the full feature vector', () => {
    const input = baselineInput();
    const outcome = underwrite(input, OPTS);
    const rec = buildDecisionRecord(input, OPTS, outcome);
    assert.equal(rec.policyVersion, POLICY.version);
    assert.equal(rec.modelId, outcome.modelId);
    assert.match(rec.inputHash, /^[a-f0-9]{64}$/);
    assert.match(rec.outcomeHash, /^[a-f0-9]{64}$/);
    assert.ok(rec.featureVector.decisioning.bureauScore === 690);
    assert.ok('applicationHour' in rec.featureVector.shadow || rec.featureVector.shadow);
  });

  test('replay reproduces the decision exactly; tampering is detected', () => {
    const input = baselineInput();
    const rec = buildDecisionRecord(input, OPTS, underwrite(input, OPTS));
    assert.equal(replayDecision(rec).matches, true);
    const tampered = { ...rec, outcome: { ...rec.outcome, decision: 'DECLINED' } };
    assert.equal(replayDecision(tampered).matches, false);
  });

  test('module index exposes the public surface', () => {
    for (const k of ['underwrite', 'POLICY', 'buildDecisionRecord', 'replayDecision', 'buildUnderwritingInput']) {
      assert.ok(k in shield, k);
    }
  });
});
