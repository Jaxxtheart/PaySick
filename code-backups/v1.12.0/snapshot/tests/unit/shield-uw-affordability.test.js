/**
 * Shield Underwriting — Patient Affordability (and the terms it depends on).
 *
 * Patient affordability is a regulatory pass/fail gate. It is NOT a score:
 * a strong Medical Risk Score can never rescue a failed affordability test.
 * Its outputs are (a) the gate result and (b) capacity measures that are
 * handed on to the Medical Risk Score as PD features.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { POLICY, expenseNorm } = require('../../backend/src/shield/policy');
const { computeTerms, maxAmountForInstalment } = require('../../backend/src/shield/terms');
const { assessAffordability } = require('../../backend/src/shield/affordability');
const { NOW, daysAgo, baselineInput, mergeDeep } = require('./fixtures/shield-input');

function afford(overrides = {}, flags = {}) {
  const input = baselineInput(overrides);
  const terms = computeTerms({ amountCents: input.application.amountCents, termMonths: input.application.termMonths }, POLICY);
  return assessAffordability({
    income: input.income,
    bureau: input.bureau,
    declared: input.declared,
    terms,
    flags
  }, POLICY, { now: NOW, allowMockSources: false });
}

describe('policy', () => {
  test('is frozen and versioned', () => {
    assert.ok(Object.isFrozen(POLICY));
    assert.match(POLICY.version, /^SHIELD-POL-/);
  });

  test('minimum expense norm follows the NCA band table (gross income)', () => {
    // R40,000 gross: R2,855.38 + 8.2% of the excess over R25,000
    assert.equal(expenseNorm(4_000_000), 285_538 + Math.round(0.082 * 1_500_000));
    // R6,000 gross: R800 + 6.75% of the excess over R800
    assert.equal(expenseNorm(600_000), 80_000 + Math.round(0.0675 * 520_000));
    // R500 gross: 100% of income
    assert.equal(expenseNorm(50_000), 50_000);
  });
});

describe('terms — the instalment always includes every patient-facing fee', () => {
  test('zero-rate MDR-funded arrangement amortises evenly', () => {
    const t = computeTerms({ amountCents: 1_200_000, termMonths: 12 }, POLICY);
    assert.equal(t.instalmentCents, 100_000);
    assert.equal(t.mdrCents, Math.round(1_200_000 * POLICY.pricing.mdrPercent / 100));
  });

  test('patient fees and rate raise the instalment used for affordability', () => {
    const plain = computeTerms({ amountCents: 1_200_000, termMonths: 12 }, POLICY);
    const priced = computeTerms({
      amountCents: 1_200_000, termMonths: 12,
      pricing: { patientAnnualRate: 0.18, monthlyServiceFeeCents: 6_900, initiationFeeCents: 50_000 }
    }, POLICY);
    assert.ok(priced.instalmentCents > plain.instalmentCents + 6_900);
    assert.ok(priced.costOfCreditCents > 0);
    assert.ok(priced.revenueCents > plain.revenueCents);
  });

  test('maxAmountForInstalment is the inverse of the instalment calculation', () => {
    const amount = maxAmountForInstalment(100_000, 12, POLICY);
    assert.equal(amount, 1_200_000);
  });
});

describe('patient affordability gate', () => {
  test('clean baseline passes with full measures', () => {
    const r = afford();
    assert.equal(r.status, 'PASS');
    const m = r.measures;
    assert.equal(m.grossAssessedCents, 4_000_000);
    assert.equal(m.netAssessedCents, 3_000_000);
    // obligations: the HIGHEST of bureau, declared and observed debit orders
    assert.equal(m.obligationsCents, 500_000);
    assert.equal(m.expenseNormCents, expenseNorm(4_000_000));
    assert.equal(m.discretionaryIncomeCents, 3_000_000 - expenseNorm(4_000_000) - 500_000);
    assert.equal(m.instalmentCents, 100_000);
    assert.ok(Math.abs(m.rti - 100_000 / 3_000_000) < 1e-9);
  });

  test('RTI is measured on NET income, DTI on GROSS income', () => {
    const r = afford();
    assert.ok(Math.abs(r.measures.rti - 100_000 / 3_000_000) < 1e-9);
    assert.ok(Math.abs(r.measures.dtiPost - (500_000 + 100_000) / 4_000_000) < 1e-9);
  });

  test('declared expenses above the norm replace the norm', () => {
    const r = afford({ declared: { expensesCents: 900_000 } });
    assert.equal(r.measures.minimumExpensesCents, 900_000);
  });

  test('no income record → DECLINE (fail closed)', () => {
    const r = afford({ income: null });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('INCOME_NOT_VERIFIED'));
  });

  test('income older than 90 days → DECLINE', () => {
    const r = afford({ income: { verifiedAt: daysAgo(91) } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('INCOME_VERIFICATION_STALE'));
  });

  test('self-declared income is never treated as verified → REFER', () => {
    const r = afford({ income: { method: 'SELF_DECLARED' } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('INCOME_SELF_DECLARED'));
  });

  test('fewer than 3 months of income evidence → REFER', () => {
    const input = baselineInput();
    const r = afford({ income: { months: input.income.months.slice(0, 2) } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('INCOME_EVIDENCE_INSUFFICIENT'));
  });

  test('mock income source is refused in production mode → REFER', () => {
    const r = afford({ income: { source: { isMock: true } } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('DATA_SOURCE_NOT_PRODUCTION:income'));
  });

  test('net income below R4,000 floor → DECLINE', () => {
    const months = Array(3).fill({ grossCents: 450_000, netCents: 390_000 });
    const r = afford({ income: { months } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('INCOME_BELOW_FLOOR'));
  });

  test('volatile income (CV > 25%) is assessed on the lowest month', () => {
    const months = [
      { grossCents: 2_000_000, netCents: 1_600_000 },
      { grossCents: 6_000_000, netCents: 4_400_000 },
      { grossCents: 4_000_000, netCents: 3_000_000 }
    ];
    const r = afford({ income: { months } });
    assert.equal(r.measures.grossAssessedCents, 2_000_000);
    assert.equal(r.measures.netAssessedCents, 1_600_000);
    assert.ok(r.measures.incomeCv > 0.25);
  });

  test('instalment above discretionary income → DECLINE with affordable alternative', () => {
    // Large obligations leave almost nothing discretionary
    const r = afford({ bureau: { monthlyObligationsCents: 2_500_000 } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('DISCRETIONARY_INCOME_INSUFFICIENT'));
    assert.ok(r.maxAffordable.amountCents >= 0);
    assert.ok(r.maxAffordable.amountCents < 1_200_000);
  });

  test('obligations are never ignored: high DTI declines even when RTI is fine', () => {
    // DTI post > 55% on gross; RTI stays low
    const r = afford({ bureau: { monthlyObligationsCents: 2_150_000 } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('DTI_ABOVE_CEILING'));
  });

  test('DTI ceiling applies to gap financing too (no segment exemption)', () => {
    const input = baselineInput({ bureau: { monthlyObligationsCents: 2_150_000 } });
    const terms = computeTerms({ amountCents: 1_200_000, termMonths: 12 }, POLICY);
    const r = assessAffordability({ ...input, terms, flags: { segment: 'SEGMENT_1_GAP' } }, POLICY, { now: NOW });
    assert.ok(r.reasonCodes.includes('DTI_ABOVE_CEILING'));
  });

  test('RTI above 20% of net → DECLINE', () => {
    const r = afford({ application: { amountCents: 8_000_000, termMonths: 12 } });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('RTI_ABOVE_CEILING'));
    assert.equal(r.measures.rtiCeiling, 0.20);
  });

  test('urgent, manual-income or tightened portfolio → 15% ceiling', () => {
    assert.equal(afford({}, { urgent: true }).measures.rtiCeiling, 0.15);
    assert.equal(afford({}, { tightened: true }).measures.rtiCeiling, 0.15);
    const manual = afford({ income: { method: 'MANUAL_REVIEW' } });
    assert.equal(manual.measures.rtiCeiling, 0.15);
    assert.equal(manual.status, 'REFER');
  });

  test('RTI in the 15–20% band → AMBER (human review)', () => {
    // ~16.7% of R30,000 net
    const r = afford({ application: { amountCents: 6_000_000, termMonths: 12 } });
    assert.equal(r.status, 'AMBER');
    assert.ok(r.reasonCodes.includes('RTI_AMBER'));
  });

  test('exposes the capacity measures handed to the PD model', () => {
    const r = afford();
    for (const k of ['discretionaryCover', 'rti', 'dtiPost', 'incomeCv', 'incomeVerificationMethod']) {
      assert.ok(k in r.pdFeatures, `missing PD feature ${k}`);
    }
  });

  test('is deterministic — same input, same output', () => {
    assert.deepEqual(afford(), afford());
  });

  test('mergeDeep fixture sanity', () => {
    assert.equal(mergeDeep({ a: { b: 1 } }, { a: { c: 2 } }).a.b, 1);
  });
});
