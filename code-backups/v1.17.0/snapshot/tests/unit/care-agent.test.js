'use strict';

/**
 * Unit Tests — Care Agent orchestration service
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Covers the pure, DB-free parts of the "Understand" and "Construct" stages
 * of the PaySick Care Agent: merging extracted/edited fields into a running
 * summary, deciding what's still missing, picking the next progressive
 * question, and building zero-interest payment-term options consistent
 * with fee.service.js's documented policy (0% patient interest) and
 * patient-gate.service.js's affordability comfort zone.
 *
 * Run: node --test tests/unit/care-agent.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeCareSummary,
  missingFieldsFor,
  nextQuestion,
  computeShortfallCents,
  buildTermOptions,
  TERM_OPTIONS_MONTHS
} = require('../../backend/src/services/care-agent.service');

const { AMBER_THRESHOLDS } = require('../../backend/src/utils/affordability-policy');

describe('mergeCareSummary', () => {
  test('fills in blank fields from a fresh extraction', () => {
    const summary = mergeCareSummary({}, {
      treatmentDescription: 'dental implants',
      quotedAmountCents: 4800000,
      providerName: null,
      schemeContributionCents: undefined
    });
    assert.equal(summary.treatmentDescription, 'dental implants');
    assert.equal(summary.quotedAmountCents, 4800000);
  });

  test('never overwrites a field the patient already confirmed/edited', () => {
    const existing = { quotedAmountCents: 5000000, treatmentDescription: 'dental implants' };
    const merged = mergeCareSummary(existing, { quotedAmountCents: 4800000 });
    assert.equal(merged.quotedAmountCents, 5000000,
      'a value already present in the running summary must win over a new extraction');
  });

  test('does not introduce a schemeContributionCents key when the extraction has none', () => {
    const merged = mergeCareSummary({}, { treatmentDescription: 'implants' });
    assert.equal('schemeContributionCents' in merged, false);
  });
});

describe('missingFieldsFor', () => {
  test('flags both required fields absent on an empty summary', () => {
    const missing = missingFieldsFor({});
    assert.ok(missing.includes('treatmentDescription'));
    assert.ok(missing.includes('quotedAmountCents'));
    assert.ok(missing.includes('schemeContributionCents'));
  });

  test('a schemeContributionCents of 0 (explicitly "not covered") is not missing', () => {
    const missing = missingFieldsFor({
      treatmentDescription: 'implants',
      quotedAmountCents: 100000,
      schemeContributionCents: 0
    });
    assert.ok(!missing.includes('schemeContributionCents'));
  });

  test('a fully populated summary has no missing fields', () => {
    const missing = missingFieldsFor({
      treatmentDescription: 'implants',
      quotedAmountCents: 4800000,
      schemeContributionCents: 1660000
    });
    assert.deepEqual(missing, []);
  });
});

describe('nextQuestion — progressive disclosure', () => {
  test('asks for the quoted amount first when nothing is known', () => {
    const q = nextQuestion({});
    assert.match(q, /quote|amount/i);
  });

  test('asks about the treatment once an amount is known', () => {
    const q = nextQuestion({ quotedAmountCents: 4800000 });
    assert.match(q, /treatment|procedure/i);
  });

  test('asks about medical aid submission once amount and treatment are known', () => {
    const q = nextQuestion({ quotedAmountCents: 4800000, treatmentDescription: 'dental implants' });
    assert.match(q, /medical aid|scheme/i);
  });

  test('returns null (ready to confirm) once all required fields are present', () => {
    const q = nextQuestion({
      quotedAmountCents: 4800000,
      treatmentDescription: 'dental implants',
      schemeContributionCents: 1660000
    });
    assert.equal(q, null);
  });
});

describe('computeShortfallCents', () => {
  test('subtracts the scheme contribution from the quoted amount', () => {
    assert.equal(computeShortfallCents({ quotedAmountCents: 4800000, schemeContributionCents: 1660000 }), 3140000);
  });

  test('returns null when the quoted amount is not yet known', () => {
    assert.equal(computeShortfallCents({ schemeContributionCents: 0 }), null);
  });

  test('treats an unset scheme contribution as fully unknown, not zero', () => {
    assert.equal(computeShortfallCents({ quotedAmountCents: 4800000 }), null);
  });
});

describe('buildTermOptions — zero-interest term construction', () => {
  test('produces one option per configured term length', () => {
    const options = buildTermOptions({ shortfallCents: 3140000 });
    assert.equal(options.length, TERM_OPTIONS_MONTHS.length);
    assert.deepEqual(options.map(o => o.termMonths), TERM_OPTIONS_MONTHS);
  });

  test('splits the shortfall evenly and rounds up so the plan never under-collects', () => {
    const options = buildTermOptions({ shortfallCents: 10000 });
    const threeMonth = options.find(o => o.termMonths === 3);
    assert.equal(threeMonth.monthlyPaymentCents, 3334); // 10000/3 = 3333.33 -> rounds up
    assert.equal(threeMonth.totalCostCents, 3334 * 3);
  });

  test('charges zero interest — total cost is never more than the shortfall plus rounding', () => {
    const options = buildTermOptions({ shortfallCents: 3140000 });
    for (const opt of options) {
      const roundingCeiling = opt.termMonths; // at most 1 cent of rounding per instalment
      assert.ok(opt.totalCostCents - 3140000 < roundingCeiling);
    }
  });

  test('flags monthly pressure when the instalment exceeds the shared affordability comfort zone', () => {
    // monthlyIncomeCents chosen so the 3-month option clearly breaches rti_comfort_zone (15%)
    const options = buildTermOptions({ shortfallCents: 3140000, monthlyIncomeCents: 1000000 });
    const threeMonth = options.find(o => o.termMonths === 3);
    assert.ok(threeMonth.affordabilityRatio > AMBER_THRESHOLDS.rti_comfort_zone);
    assert.equal(threeMonth.pressureWarning, true);
  });

  test('does not flag pressure when the instalment is comfortably affordable', () => {
    const options = buildTermOptions({ shortfallCents: 3140000, monthlyIncomeCents: 30000000 });
    const twelveMonth = options.find(o => o.termMonths === 12);
    assert.equal(twelveMonth.pressureWarning, false);
  });

  test('affordabilityRatio and pressureWarning are null/false when income is unknown', () => {
    const options = buildTermOptions({ shortfallCents: 3140000 });
    for (const opt of options) {
      assert.equal(opt.affordabilityRatio, null);
      assert.equal(opt.pressureWarning, false);
    }
  });
});
