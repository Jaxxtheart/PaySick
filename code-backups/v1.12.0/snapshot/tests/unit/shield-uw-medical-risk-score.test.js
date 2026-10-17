/**
 * Shield Underwriting — PaySick Medical Risk Score (MRS).
 *
 * The MRS is PaySick's proprietary PD engine. Day one it runs an expert-prior
 * scorecard (transparent, deterministic, uncalibrated) on lawful data; it is
 * built so the same feature registry, decision log and model registry carry
 * it to a calibrated, data-trained model as outcomes mature.
 *
 * Governance is enforced in code: every feature declares its pillar, source
 * and status. Only DECISIONING features may enter a model. PROHIBITED
 * features (health-condition data, protected attributes) can never be used.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { POLICY } = require('../../backend/src/shield/policy');
const registry = require('../../backend/src/shield/medical-risk-score/feature-registry');
const models = require('../../backend/src/shield/medical-risk-score/models');
const mrs = require('../../backend/src/shield/medical-risk-score');

const NEUTRAL = {
  bureauScore: 670,
  bureauThinFile: false,
  bureauEnquiries90d: 1,
  bureauWorstArrears12m: 0,
  bureauRevolvingUtilisation: 0.4,
  discretionaryCover: 1.8,
  rti: 0.10,
  incomeCv: 0.15,
  incomeVerificationMethod: 'BANK_STATEMENT',
  procedureCategory: 'DENTISTRY',
  urgency: 'ELECTIVE',
  bookingLeadDays: 7,
  segment: 'SEGMENT_2_OOP',
  schemeMembershipVerified: false,
  tariffRatio: null,
  internalCompletedArrangements: 0,
  internalOnTimeRatio: null,
  providerGrade: 'P2',
  providerMissedRateCredible: POLICY.mrs.providerPriorMissedRate,
  providerDisputeRate: 0,
  termMonths: 12
};

function score(overrides = {}, ctx = {}) {
  return mrs.scoreMedicalRisk({ ...NEUTRAL, ...overrides }, models.getChampion(), {
    termMonths: overrides.termMonths ?? 12,
    exposureCents: 1_200_000,
    revenueCents: 60_000,
    ...ctx
  }, POLICY);
}

describe('MRS feature registry — governance in code', () => {
  test('every feature declares key, pillar, source, status and feedsPd', () => {
    assert.ok(registry.FEATURES.length >= 15);
    for (const f of registry.FEATURES) {
      for (const k of ['key', 'pillar', 'source', 'status', 'description']) {
        assert.ok(f[k], `${f.key} missing ${k}`);
      }
      assert.equal(typeof f.feedsPd, 'boolean');
      assert.ok(registry.STATUSES.includes(f.status));
      assert.ok(registry.PILLARS.includes(f.pillar));
    }
  });

  test('registry is frozen', () => {
    assert.ok(Object.isFrozen(registry.FEATURES));
    assert.ok(Object.isFrozen(registry.FEATURES[0]));
  });

  test('covers the proprietary healthcare pillars, not just the bureau', () => {
    const pillars = new Set(registry.featuresFeedingPd().map((f) => f.pillar));
    for (const p of ['CREDIT_FOUNDATION', 'AFFORDABILITY_CAPACITY', 'CLINICAL_RISK',
                     'INSURANCE_COORDINATION', 'HEALTHCARE_PAYMENT_BEHAVIOUR', 'PROVIDER_QUALITY']) {
      assert.ok(pillars.has(p), `no PD feature in pillar ${p}`);
    }
  });

  test('health-condition data and protected attributes are PROHIBITED', () => {
    for (const k of ['chronicMedicationAdherence', 'medicalAidClaimsHistory', 'diagnosisCodes',
                     'schemeBrand', 'race', 'gender', 'age', 'disabilityStatus', 'pregnancyStatus']) {
      assert.ok(registry.PROHIBITED_KEYS.includes(k), k);
    }
  });

  test('behavioural signals are SHADOW only (captured, never in PD)', () => {
    for (const k of ['applicationHour', 'deviceType', 'completionSeconds']) {
      const f = registry.getFeature(k);
      assert.equal(f.status, 'SHADOW', k);
      assert.equal(f.feedsPd, false, k);
    }
  });

  test('stripProhibited removes prohibited keys at any depth and reports them', () => {
    const { clean, removed } = registry.stripProhibited({ a: 1, race: 'x', nested: { chronicMedicationAdherence: 0.9, ok: 2 } });
    assert.deepEqual(clean, { a: 1, nested: { ok: 2 } });
    assert.deepEqual(removed.sort(), ['nested.chronicMedicationAdherence', 'race']);
  });
});

describe('MRS model registry and validation', () => {
  test('champion is the expert-prior model, explicitly uncalibrated', () => {
    const m = models.getChampion();
    assert.equal(m.stage, 'EXPERT_PRIOR');
    assert.equal(m.calibrated, false);
    assert.match(m.modelId, /^MRS-/);
  });

  test('a model may only reference DECISIONING features', () => {
    assert.doesNotThrow(() => models.validateModel(models.getChampion()));
    const bad = { ...models.getChampion(), modelId: 'MRS-BAD', terms: [{ feature: 'deviceType', bands: [] }] };
    assert.throws(() => models.validateModel(bad), /deviceType/);
    const worse = { ...models.getChampion(), modelId: 'MRS-WORSE', terms: [{ feature: 'race', bands: [] }] };
    assert.throws(() => models.validateModel(worse), /race/);
  });

  test('readiness stages advance with matured outcomes', () => {
    assert.equal(models.modelReadiness({ maturedOutcomes: 200, bads: 10 }).stage, 'EXPERT_PRIOR');
    assert.equal(models.modelReadiness({ maturedOutcomes: 1500, bads: 120 }).stage, 'INTERCEPT_RECALIBRATION');
    assert.equal(models.modelReadiness({ maturedOutcomes: 4000, bads: 350 }).stage, 'CHALLENGER_TRAINABLE');
  });

  test('promotion to champion needs independent validation, discrimination, stability and fairness', () => {
    const fail = models.canPromote({ independentValidation: false, gini: 0.2, psi: 0.3, fairnessReviewPassed: false, developmentBads: 50 });
    assert.equal(fail.allowed, false);
    assert.ok(fail.failures.length >= 5);
    const pass = models.canPromote({ independentValidation: true, gini: 0.42, psi: 0.05, fairnessReviewPassed: true, developmentBads: 400 });
    assert.equal(pass.allowed, true);
  });

  test('recalibrateIntercept moves the base rate to the observed bad rate', () => {
    const m = models.recalibrateIntercept(models.getChampion(), { observedBadRate: 0.05, meanPredictedPd: 0.03 });
    assert.ok(m.intercept > models.getChampion().intercept);
    assert.equal(m.stage, 'INTERCEPT_RECALIBRATION');
    assert.notEqual(m.modelId, models.getChampion().modelId);
  });
});

describe('MRS scoring — PD, score, grade, expected loss', () => {
  test('neutral applicant sits at the model base rate', () => {
    const r = score();
    const base = 1 / (1 + Math.exp(-models.getChampion().intercept));
    assert.ok(Math.abs(r.pd12m - base) < 1e-6, `${r.pd12m} vs ${base}`);
  });

  test('outputs probability, 300–900 score, grade, contributions and reasons', () => {
    const r = score();
    assert.ok(r.pd12m > 0 && r.pd12m < 1);
    assert.ok(r.score >= 300 && r.score <= 900);
    assert.ok(['A', 'B', 'C', 'D', 'E', 'F'].includes(r.grade));
    assert.ok(Array.isArray(r.contributions));
    assert.ok(Array.isArray(r.adverseReasons));
  });

  test('worse bureau behaviour raises PD monotonically', () => {
    const a = score({ bureauScore: 760 }).pd12m;
    const b = score({ bureauScore: 670 }).pd12m;
    const c = score({ bureauScore: 540 }).pd12m;
    assert.ok(a < b && b < c);
  });

  test('healthcare pillars move PD: provider, procedure, internal history', () => {
    assert.ok(score({ providerGrade: 'P4' }).pd12m > score({ providerGrade: 'P1' }).pd12m);
    assert.ok(score({ procedureCategory: 'FERTILITY' }).pd12m > score({ procedureCategory: 'OPHTHALMOLOGY' }).pd12m);
    assert.ok(score({ internalCompletedArrangements: 2, internalOnTimeRatio: 1 }).pd12m < score().pd12m);
  });

  test('lifetime PD compounds over the term', () => {
    const r = score({ termMonths: 24 }, { termMonths: 24 });
    assert.ok(Math.abs(r.pdLifetime - (1 - Math.pow(1 - r.pd12m, 2))) < 1e-9);
  });

  test('expected loss = lifetime PD × policy LGD × EAD factor × exposure', () => {
    const r = score();
    const expected = Math.round(r.pdLifetime * POLICY.mrs.lgd * POLICY.mrs.eadFactor * 1_200_000);
    assert.equal(r.expectedLossCents, expected);
    assert.equal(r.lgd, POLICY.mrs.lgd);
  });

  test('adverse reasons name the largest PD-increasing features', () => {
    const r = score({ bureauScore: 540, bureauEnquiries90d: 7 });
    assert.equal(r.adverseReasons[0].feature, 'bureauScore');
    assert.ok(r.adverseReasons.some((x) => x.feature === 'bureauEnquiries90d'));
  });

  test('pdInputs lists exactly the features the model used, all DECISIONING', () => {
    const r = score();
    assert.ok(r.pdInputs.length >= 10);
    for (const k of r.pdInputs) {
      assert.equal(registry.getFeature(k).status, 'DECISIONING', k);
    }
  });

  test('missing feature values are neutral and flagged, not invented', () => {
    const r = score({ bureauScore: null });
    assert.ok(r.missingFeatures.includes('bureauScore'));
  });

  test('deterministic: identical inputs → identical outputs', () => {
    assert.deepEqual(score(), score());
  });

  test('challenger models are scored for comparison only', () => {
    const challenger = { ...models.getChampion(), modelId: 'MRS-TEST-CHALLENGER', intercept: -2.0 };
    const r = mrs.scoreChallengers({ ...NEUTRAL }, [challenger], { termMonths: 12, exposureCents: 1_200_000, revenueCents: 60_000 }, POLICY);
    assert.equal(r[0].modelId, 'MRS-TEST-CHALLENGER');
    assert.ok(r[0].pd12m > score().pd12m);
  });
});

describe('MRS feature extraction', () => {
  test('extractFeatures builds the vector from stage outputs, never from prohibited data', () => {
    const v = mrs.extractFeatures({
      application: { procedureCategory: 'DENTISTRY', urgency: 'ELECTIVE', bookingLeadDays: 21, segment: 'SEGMENT_2_OOP', termMonths: 12 },
      bureau: { score: 700, thinFile: false, enquiries90d: 1, worstArrearsCycles12m: 0, revolvingUtilisation: 0.3 },
      affordabilityPd: { discretionaryCover: 3, rti: 0.05, dtiPost: 0.2, incomeCv: 0.05, incomeVerificationMethod: 'OPEN_BANKING' },
      providerPd: { providerGrade: 'P2', providerMissedRateCredible: 0.02, providerDisputeRate: 0 },
      internalHistory: { completedArrangements: 0, instalmentsDue: 0, instalmentsOnTime: 0 },
      segment1: null,
      behaviour: { applicationHour: 2, deviceType: 'mobile', completionSeconds: 40 },
      chronicMedicationAdherence: 0.2
    });
    assert.equal(v.decisioning.bureauScore, 700);
    assert.equal(v.decisioning.discretionaryCover, 3);
    assert.equal(v.shadow.applicationHour, 2);
    assert.ok(!('chronicMedicationAdherence' in v.decisioning));
    assert.ok(!('chronicMedicationAdherence' in v.shadow));
    assert.ok(!('applicationHour' in v.decisioning));
  });
});
