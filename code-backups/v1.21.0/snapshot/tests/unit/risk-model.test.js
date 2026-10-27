/**
 * Unit Tests — Shield risk model, extracted and versioned (risk-model.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The PD / LGD / expected-loss maths lived only inside
 * healthcare-risk.service.js, which needs a database to load. v1.21.0
 * (the Kehr harness) extracts the pure maths into risk-model.js so the
 * pre-approval engine and the existing service share ONE implementation.
 *
 *   v1.0  the model exactly as it was. Proven against a golden fixture
 *         captured from the original service before the extraction
 *         (tests/fixtures/risk-model-v1.0-golden.json).
 *   v1.1  harness applications. Two changes, both pending risk-owner
 *         sign-off (PRELAUNCH_COMPLIANCE_CHECKLIST.md):
 *           1. Behavioural signals measured form-filling (completion time,
 *              edits, hour, device, location). A harness has no forms, so
 *              the component is frozen at a documented neutral value.
 *           2. Affordability uses the real instalment for the term, not a
 *              3-month assumption, because pre-approval searches terms up
 *              to 12 months.
 *
 * Run: node --test tests/unit/risk-model.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const golden = require('../fixtures/risk-model-v1.0-golden.json');
const model = require('../../backend/src/services/risk-model');

function loadLegacyService() {
  const original = Module._load;
  Module._load = function (request) {
    if (request === '../config/database') return { query: async () => ({ rows: [] }), transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }) };
    return original.apply(this, arguments);
  };
  try {
    const file = path.join(__dirname, '../../backend/src/services/healthcare-risk.service.js');
    delete require.cache[require.resolve(file)];
    return new (require(file).HealthcareRiskService)();
  } finally {
    Module._load = original;
  }
}

describe('model v1.0 is unchanged (golden fixture)', () => {
  test('the fixture is v1.0', () => {
    assert.equal(golden.modelVersion, 'v1.0');
    assert.equal(model.MODEL_VERSIONS.LEGACY, 'v1.0');
  });

  test(`calculatePD matches all ${golden.pd.length} cases`, () => {
    for (const c of golden.pd) assert.deepEqual(model.calculatePD(c.input), c.output, JSON.stringify(c.input));
  });

  test(`calculateLGD matches all ${golden.lgd.length} cases`, () => {
    for (const c of golden.lgd) assert.deepEqual(model.calculateLGD(c.input), c.output, JSON.stringify(c.input));
  });

  test(`behavioural signals (v1.0) match all ${golden.beh.length} cases`, () => {
    for (const c of golden.beh) {
      assert.equal(model.analyzeBehavioralSignals(c.input === null ? undefined : c.input, { modelVersion: 'v1.0' }), c.output, JSON.stringify(c.input));
    }
  });

  test('decision bands, medical-aid tiers, terms and max amounts match', () => {
    for (const c of golden.dec) assert.deepEqual(model.makeRiskDecision(0, 0, c.input), c.output);
    for (const c of golden.tier) assert.equal(model.getMedicalAidTier(...c.input), c.output);
    for (const c of golden.term) assert.equal(model.getRecommendedTerm(...c.input), c.output);
    for (const c of golden.maxAmt) assert.equal(model.calculateMaxApprovedAmount(...c.input), c.output);
  });

  test('the existing healthcare-risk.service gives the same answers (it now delegates)', () => {
    const legacy = loadLegacyService();
    for (const c of golden.pd.slice(0, 60)) assert.deepEqual(legacy.calculatePD(c.input), c.output);
    for (const c of golden.lgd.slice(0, 60)) assert.deepEqual(legacy.calculateLGD(c.input), c.output);
    for (const c of golden.beh.slice(0, 60)) assert.equal(legacy.analyzeBehavioralSignals(c.input === null ? undefined : c.input), c.output);
    assert.equal(legacy.MODEL_VERSION, 'v1.0');
  });
});

describe('model v1.1 (harness)', () => {
  test('behavioural signals are frozen at the documented neutral value', () => {
    assert.equal(model.MODEL_VERSIONS.HARNESS, 'v1.1');
    for (const behavior of [undefined, { applicationHour: 2 }, { completionTimeSeconds: 10, formEditsCount: 40 }, { deviceType: 'mobile', applicationHour: 12 }]) {
      assert.equal(model.analyzeBehavioralSignals(behavior, { modelVersion: 'v1.1' }), model.HARNESS_BEHAVIOURAL_NEUTRAL);
    }
    assert.equal(model.HARNESS_BEHAVIOURAL_NEUTRAL, 50);
  });

  test('someone applying at 2am is not penalised under v1.1', () => {
    const night = model.analyzeBehavioralSignals({ applicationHour: 2 }, { modelVersion: 'v1.1' });
    const day = model.analyzeBehavioralSignals({ applicationHour: 11 }, { modelVersion: 'v1.1' });
    assert.equal(night, day);
  });

  test('an unknown model version is refused', () => {
    assert.throws(() => model.analyzeBehavioralSignals({}, { modelVersion: 'v9' }), /Unknown model version/);
  });
});

describe('affordabilityScore', () => {
  const base = { monthlyIncomeCents: 2_200_000, obligationsCents: 400_000, premiumCents: 0 };

  test('uses the real instalment for the term', () => {
    const three = model.affordabilityScore({ ...base, instalmentCents: Math.ceil(4_700_000 / 3) });
    const twelve = model.affordabilityScore({ ...base, instalmentCents: Math.ceil(4_700_000 / 12) });
    assert.ok(twelve.score > three.score, `${twelve.score} should beat ${three.score}`);
  });

  test('bands against 30% of disposable income, as v1.0 does', () => {
    // disposable R18,000, capacity R5,400
    assert.deepEqual(model.affordabilityScore({ ...base, instalmentCents: 200_000 }), { score: 85, band: 'high', capacityCents: 540_000 });
    assert.equal(model.affordabilityScore({ ...base, instalmentCents: 400_000 }).band, 'medium');
    assert.equal(model.affordabilityScore({ ...base, instalmentCents: 540_000 }).band, 'low');
    assert.equal(model.affordabilityScore({ ...base, instalmentCents: 600_000 }).band, 'insufficient');
  });

  test('no income is insufficient, never a divide-by-zero', () => {
    assert.equal(model.affordabilityScore({ monthlyIncomeCents: 0, obligationsCents: 0, premiumCents: 0, instalmentCents: 100 }).band, 'insufficient');
  });
});

describe('assessRisk (harness entry point)', () => {
  const inputs = {
    modelVersion: 'v1.1',
    amountCents: 4_700_000,
    termMonths: 12,
    monthlyIncomeCents: 2_200_000,
    obligationsCents: 400_000,
    hasMedicalAid: true,
    medicalAidTier: 'classic',
    procedureRisk: { base_pd_risk: 35, base_lgd_risk: 40, necessity_score: 0.8 },
    providerScore: 70,
    isNetworkPartner: true,
  };

  test('returns PD, LGD, expected loss and the decision band, tagged with the model version', () => {
    const r = model.assessRisk(inputs);
    assert.equal(r.modelVersion, 'v1.1');
    assert.ok(r.pd.score >= 0.005 && r.pd.score <= 0.15);
    assert.ok(r.lgd.score >= 0.2 && r.lgd.score <= 0.7);
    assert.equal(r.expectedLossRate, Math.round(r.pd.score * r.lgd.score * 1e6) / 1e6);
    assert.equal(r.expectedLossCents, Math.round(r.pd.score * r.lgd.score * inputs.amountCents));
    assert.ok(['approve', 'review', 'decline'].includes(r.decision.decision));
  });

  test('is deterministic', () => {
    assert.deepEqual(model.assessRisk(inputs), model.assessRisk(inputs));
  });

  test('missing optional health history uses the neutral default (60), never a worst case', () => {
    const r = model.assessRisk(inputs);
    assert.equal(r.inputsUsed.healthScore, model.MODEL_DEFAULTS.healthScore);
    assert.equal(model.MODEL_DEFAULTS.healthScore, 60);
    assert.deepEqual(r.inputsUsed.defaulted.sort(), ['familySupportIndicator', 'healthScore']);
  });

  test('a better health payment score lowers PD', () => {
    const neutral = model.assessRisk(inputs);
    const strong = model.assessRisk({ ...inputs, healthScore: 85 });
    assert.ok(strong.pd.score < neutral.pd.score);
  });

  test('records what drove the result, for a person to explain a decline', () => {
    const r = model.assessRisk(inputs);
    assert.deepEqual(Object.keys(r.pd.components).sort(), ['affordability', 'behavioral', 'healthScore', 'procedureRisk', 'provider']);
    assert.ok(Array.isArray(r.topFactors) && r.topFactors.length === 3);
  });

  test('rejects a version other than v1.0 or v1.1', () => {
    assert.throws(() => model.assessRisk({ ...inputs, modelVersion: 'v2' }), /Unknown model version/);
  });
});
