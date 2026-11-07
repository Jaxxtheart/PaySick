/**
 * Unit Tests — Kehr pre-approval engine (preapproval.service.js) and the
 * patient-stage Shield gates (shield-gates.service.js runPatientGates)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Journey A (harness blueprint): before treatment, a patient is assessed
 * and leaves with a pre-approval PASS: a ceiling, a maximum term, a code
 * and an expiry. The pass converts into a plan when the bill arrives.
 *
 * Integrity rules under test:
 *   - The real Shield engine runs. Gates 5, 3 and 2 run at pre-approval
 *     (no provider is known yet); Gates 1 and 4 need a provider and run in
 *     full at conversion. Nothing is skipped: the pass records the
 *     provider checks as pending.
 *   - Hard floors from affordability-policy.js hold: R4,000 minimum income,
 *     20% repayment-to-income (15% when urgent or manually verified),
 *     55% DTI for full-procedure financing, R2,000 minimum gap.
 *   - PD/LGD/expected loss come from risk-model.js v1.1. Up to 2.5%
 *     expected loss approves, 2.5% to 5% goes to a person, above 5% declines.
 *   - Mismatched documents send the case to a person; they never decline it.
 *   - Cooling-off (elective over R15,000) starts at pre-approval.
 *   - The patient view and the provider view are allowlists.
 *
 * Run: node --test tests/unit/preapproval.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { runPatientGates } = require('../../backend/src/services/shield-gates.service');
const pre = require('../../backend/src/services/preapproval.service');

const NOW = new Date('2026-10-27T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function application(overrides = {}) {
  return {
    patientId: 'user-1',
    monthlyIncomeCents: 2_200_000,
    obligationsCents: 400_000,
    incomeVerificationMethod: 'STITCH_OPEN_BANKING',
    incomeVerifiedAt: new Date(NOW.getTime() - DAY).toISOString(),
    estimateCents: 16_500_000,
    schemeCoverCents: 11_800_000,
    urgency: 'planned',
    risk: {
      hasMedicalAid: true,
      medicalAidTier: 'classic',
      procedureRisk: { base_pd_risk: 35, base_lgd_risk: 40, necessity_score: 0.8 },
      providerScore: 70,
      isNetworkPartner: true,
    },
    crossCheck: { consistent: true, flags: [] },
    portfolio: { arrearsRate: 0.02, balanceSheetPercent: 0.1, reserveFundBalance: 1_000_000, monthlyFeeIncome: 1_000_000 },
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// runPatientGates
// ─────────────────────────────────────────────
describe('shield-gates runPatientGates (Gates 5, 3 and 2)', () => {
  const ctx = (overrides = {}) => ({
    application: { applicationId: 'pre-1', providerInvoiceAmount: 4_700_000, termMonths: 12, segment: 'SEGMENT_2_FULL', procedureUrgency: 'PLANNED', ...overrides.application },
    patient: { verifiedMonthlyIncome: 2_200_000, verifiedAt: new Date().toISOString(), incomeVerificationMethod: 'STITCH_OPEN_BANKING', ...overrides.patient },
    portfolio: { arrearsRate: 0.02, balanceSheetPercent: 0.1, reserveFundBalance: 1, monthlyFeeIncome: 1, ...overrides.portfolio },
  });

  test('passes an affordable request and reports the ratio and ceiling', () => {
    const r = runPatientGates(ctx());
    assert.equal(r.decision, 'PASSED');
    assert.equal(r.affordabilityCeiling, 0.20);
    assert.ok(r.affordabilityRatio < 0.20);
    assert.deepEqual(r.gatesRun, ['GATE_5_CIRCUIT_BREAKER', 'GATE_3_URGENCY', 'GATE_2_AFFORDABILITY']);
    assert.deepEqual(r.gatesPending, ['GATE_1_PROVIDER', 'GATE_4_TARIFF']);
  });

  test('declines above the 20% ceiling, and tightens to 15% when urgent', () => {
    assert.equal(runPatientGates(ctx({ application: { providerInvoiceAmount: 6_000_000, termMonths: 12 } })).decision, 'DECLINED');
    // R42,000 over 12 months is R3,500 a month: 15.9% of R22,000, inside 20% but over the urgent 15%
    const urgent = runPatientGates(ctx({ application: { providerInvoiceAmount: 4_200_000, termMonths: 12, procedureUrgency: 'URGENT' } }));
    assert.equal(runPatientGates(ctx({ application: { providerInvoiceAmount: 4_200_000, termMonths: 12 } })).decision, 'PASSED');
    assert.equal(urgent.decision, 'DECLINED');
    assert.equal(urgent.affordabilityCeiling, 0.15);
  });

  test('a provider missed-payment breaker is not applied without a provider; balance-sheet breaker still declines', () => {
    assert.equal(runPatientGates(ctx({ portfolio: { balanceSheetPercent: 0.5 } })).decision, 'DECLINED');
  });

  test('flags cooling-off for an elective case over R15,000', () => {
    const r = runPatientGates(ctx({ application: { procedureUrgency: 'ELECTIVE' } }));
    assert.equal(r.coolingOffRequired, true);
  });

  test('declines stale income (older than 90 days)', () => {
    const r = runPatientGates(ctx({ patient: { verifiedAt: new Date(Date.now() - 91 * DAY).toISOString() } }));
    assert.equal(r.decision, 'DECLINED');
    assert.match(r.reason, /older than 90 days/);
  });
});

// ─────────────────────────────────────────────
// assessPreApproval
// ─────────────────────────────────────────────
describe('assessPreApproval', () => {
  test('pre-approves a ceiling covering the shortfall plus headroom, over the longest affordable term', () => {
    const r = pre.assessPreApproval(application(), { now: NOW });
    assert.equal(r.status, 'pre_approved');
    assert.equal(r.shortfallCents, 4_700_000);
    assert.equal(r.ceilingCents, pre.ceilingTarget(4_700_000));
    assert.equal(r.ceilingCents, 4_900_000);
    assert.equal(r.maxTermMonths, 12);
    assert.equal(r.indicativeMonthlyCents, Math.ceil(4_900_000 / 12));
    assert.equal(r.coversShortfall, true);
    assert.equal(r.modelVersion, 'v1.1');
    assert.deepEqual(r.gatesPending, ['GATE_1_PROVIDER', 'GATE_4_TARIFF']);
  });

  test('records every term tried, with the gate and model outcome, for the audit log', () => {
    const r = pre.assessPreApproval(application(), { now: NOW });
    assert.deepEqual(r.trace.map((t) => t.termMonths), [12, 6, 3]);
    for (const t of r.trace) {
      assert.ok('amountCents' in t && 'gate' in t && 'risk' in t);
    }
  });

  test('lowers the ceiling to what the 20% repayment-to-income ceiling allows', () => {
    const r = pre.assessPreApproval(application({ monthlyIncomeCents: 1_500_000, obligationsCents: 0 }), { now: NOW });
    // R15,000 income: at most R3,000 a month, so at most R36,000 over 12 months
    assert.equal(r.status, 'pre_approved');
    assert.ok(r.ceilingCents <= 3_600_000);
    assert.equal(r.coversShortfall, false);
  });

  test('applies the 55% DTI limit for full-procedure financing (no scheme cover)', () => {
    const r = pre.assessPreApproval(application({ schemeCoverCents: 0, estimateCents: 3_000_000, monthlyIncomeCents: 2_000_000, obligationsCents: 1_000_000 }), { now: NOW });
    const instalment = r.indicativeMonthlyCents || 0;
    assert.ok((1_000_000 + instalment) / 2_000_000 <= 0.55 + 1e-9, `DTI ${(1_000_000 + instalment) / 2_000_000}`);
  });

  test('declines below the R4,000 minimum income, with no override', () => {
    const r = pre.assessPreApproval(application({ monthlyIncomeCents: 390_000 }), { now: NOW });
    assert.equal(r.status, 'declined');
    assert.equal(r.reasonCode, 'MIN_INCOME');
  });

  test('says no plan is needed when the scheme covers everything', () => {
    assert.equal(pre.assessPreApproval(application({ schemeCoverCents: 16_500_000 }), { now: NOW }).status, 'not_needed');
  });

  test('a gap under R2,000 is too small to finance', () => {
    assert.equal(pre.assessPreApproval(application({ estimateCents: 11_950_000 }), { now: NOW }).status, 'below_minimum');
  });

  test('mismatched documents go to a person, never to a decline', () => {
    const r = pre.assessPreApproval(application({ crossCheck: { consistent: false, flags: ['PAYSLIP_BANK_MISMATCH'] } }), { now: NOW });
    assert.equal(r.status, 'review');
    assert.equal(r.reasonCode, 'DOCUMENT_MISMATCH');
  });

  test('elective over R15,000: cooling-off ends 48 hours after pre-approval', () => {
    const r = pre.assessPreApproval(application({ urgency: 'elective' }), { now: NOW });
    assert.equal(r.status, 'pre_approved');
    assert.equal(r.coolingOffEndsAt, new Date(NOW.getTime() + 48 * 60 * 60 * 1000).toISOString());
  });

  test('a planned, non-elective case has no cooling-off', () => {
    assert.equal(pre.assessPreApproval(application(), { now: NOW }).coolingOffEndsAt, null);
  });

  test('urgent cases use the tighter 15% ceiling', () => {
    const planned = pre.assessPreApproval(application({ monthlyIncomeCents: 1_500_000, obligationsCents: 0 }), { now: NOW });
    const urgent = pre.assessPreApproval(application({ monthlyIncomeCents: 1_500_000, obligationsCents: 0, urgency: 'urgent' }), { now: NOW });
    assert.ok(urgent.ceilingCents < planned.ceilingCents);
    assert.ok(urgent.ceilingCents <= Math.floor(0.15 * 1_500_000) * 12);
  });

  test('a high expected loss goes to review or decline, never approve', () => {
    const risky = application({
      risk: { hasMedicalAid: false, procedureRisk: { base_pd_risk: 95, base_lgd_risk: 70, necessity_score: 0.1 }, providerScore: 5, healthScore: 5, isNetworkPartner: false },
      schemeCoverCents: 0, estimateCents: 2_000_000,
    });
    const r = pre.assessPreApproval(risky, { now: NOW });
    assert.ok(['review', 'declined'].includes(r.status), r.status);
  });
});

// ─────────────────────────────────────────────
// Pass
// ─────────────────────────────────────────────
describe('createPass', () => {
  const assessment = pre.assessPreApproval(application({ urgency: 'elective' }), { now: NOW });

  test('issues a code, a 90-day expiry and carries the ceiling and cooling-off', () => {
    const pass = pre.createPass({ assessment, patientId: 'user-1', now: NOW, random: () => 0 });
    assert.match(pass.code, /^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$/);
    assert.equal(pass.ceilingCents, assessment.ceilingCents);
    assert.equal(pass.maxTermMonths, 12);
    assert.equal(pass.expiresAt, new Date(NOW.getTime() + 90 * DAY).toISOString());
    assert.equal(pass.coolingOffEndsAt, assessment.coolingOffEndsAt);
    assert.equal(pass.status, 'active');
    assert.equal(pass.modelVersion, 'v1.1');
  });

  test('refuses to issue a pass for anything but a pre-approval', () => {
    assert.throws(() => pre.createPass({ assessment: { status: 'review' }, patientId: 'u', now: NOW }), /pre-approval/);
  });
});

describe('evaluateConversion', () => {
  const assessment = pre.assessPreApproval(application({ urgency: 'elective' }), { now: NOW });
  const pass = pre.createPass({ assessment, patientId: 'user-1', now: NOW, random: () => 0.5 });
  const after = (days) => new Date(NOW.getTime() + days * DAY);

  test('within the ceiling, same procedure, after cooling-off: convert', () => {
    const r = pre.evaluateConversion({ pass, bill: { amountCents: 4_560_000, procedureMatches: true }, now: after(10) });
    assert.equal(r.outcome, 'convert');
    assert.equal(r.requiresRefresh, false);
    assert.deepEqual(r.termOptions, [3, 6, 12]);
  });

  test('before cooling-off ends: wait, with the time it ends', () => {
    const r = pre.evaluateConversion({ pass, bill: { amountCents: 4_000_000, procedureMatches: true }, now: after(1) });
    assert.equal(r.outcome, 'cooling_off');
    assert.equal(r.until, pass.coolingOffEndsAt);
  });

  test('above the ceiling: re-assess only the difference', () => {
    const r = pre.evaluateConversion({ pass, bill: { amountCents: 5_200_000, procedureMatches: true }, now: after(10) });
    assert.equal(r.outcome, 'reassess_difference');
    assert.equal(r.deltaCents, 5_200_000 - pass.ceilingCents);
  });

  test('a different procedure needs a fresh assessment', () => {
    assert.equal(pre.evaluateConversion({ pass, bill: { amountCents: 1_000_000, procedureMatches: false }, now: after(10) }).outcome, 'reassess');
  });

  test('older than 30 days: convert, but refresh income and bureau first', () => {
    assert.equal(pre.evaluateConversion({ pass, bill: { amountCents: 4_000_000, procedureMatches: true }, now: after(31) }).requiresRefresh, true);
  });

  test('after 90 days: expired', () => {
    assert.equal(pre.evaluateConversion({ pass, bill: { amountCents: 4_000_000, procedureMatches: true }, now: after(91) }).outcome, 'expired');
  });

  test('a used or withdrawn pass cannot convert', () => {
    assert.equal(pre.evaluateConversion({ pass: { ...pass, status: 'converted' }, bill: { amountCents: 1, procedureMatches: true }, now: after(10) }).outcome, 'not_active');
  });
});

// ─────────────────────────────────────────────
// Views
// ─────────────────────────────────────────────
describe('patientPreapprovalView and providerPassView', () => {
  const assessment = pre.assessPreApproval(application(), { now: NOW });
  const pass = pre.createPass({ assessment, patientId: 'user-1', now: NOW, random: () => 0.3 });
  const INTERNAL = /pd|lgd|expectedLoss|risk|trace|gate|reason|factor|income|obligation|modelVersion|score/i;

  test('the patient sees the ceiling, term, code, dates and a message, and nothing about how it was decided', () => {
    const view = pre.patientPreapprovalView({ assessment, pass });
    assert.deepEqual(Object.keys(view).sort(), ['ceilingCents', 'code', 'coolingOffEndsAt', 'coversShortfall', 'expiresAt', 'indicativeMonthlyCents', 'maxTermMonths', 'message', 'status']);
    for (const key of Object.keys(view)) assert.doesNotMatch(key, INTERNAL, key);
  });

  test('a review shows only that it is being checked', () => {
    const view = pre.patientPreapprovalView({ assessment: { status: 'review', reasonCode: 'DOCUMENT_MISMATCH' } });
    assert.deepEqual(view, { status: 'checking', message: "We're checking a few details. We'll let you know here." });
  });

  test('a decline offers a person to review it and gives no reason code', () => {
    const view = pre.patientPreapprovalView({ assessment: { status: 'declined', reasonCode: 'MIN_INCOME' } });
    assert.deepEqual(view, { status: 'not_available', message: "We can't pre-approve this right now.", canRequestReview: true });
  });

  test('the provider sees the code, status, ceiling and expiry only', () => {
    assert.deepEqual(Object.keys(pre.providerPassView(pass)).sort(), ['ceilingCents', 'code', 'expiresAt', 'status']);
  });
});
