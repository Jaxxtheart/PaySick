/**
 * PaySick Medical Risk Score — Model Registry and lifecycle.
 *
 * Day one the champion is an EXPERT_PRIOR scorecard: a transparent logistic
 * model whose coefficients are documented underwriting judgement, not
 * estimates. It is explicitly uncalibrated. The lifecycle that turns it into
 * a data-trained proprietary model is encoded here:
 *
 *   EXPERT_PRIOR             launch; decisions + outcomes logged from day one
 *   INTERCEPT_RECALIBRATION  ≥100 bads / ≥1,000 matured — base rate re-fitted
 *   CHALLENGER_TRAINABLE     ≥300 bads / ≥3,000 matured — train challengers
 *                            on the logged feature vectors, run in shadow
 *   CHAMPION (promotion)     independent validation, Gini, PSI, fairness review
 *
 * Models may only reference DECISIONING features from the registry.
 */

'use strict';

const { POLICY, deepFreeze } = require('../policy');
const { getFeature } = require('./feature-registry');

const logit = (p) => Math.log(p / (1 - p));

// Numeric terms: the first band whose `lt` exceeds the value applies.
const MRS_EXPERT_0_1_0 = {
  modelId: 'MRS-EXPERT-0.1.0',
  version: '0.1.0',
  stage: 'EXPERT_PRIOR',
  calibrated: false,
  effectiveFrom: '2026-10-17',
  outcomeDefinition: POLICY.mrs.outcomeDefinition,
  basePd: 0.035,
  intercept: logit(0.035),
  notes: 'Expert-prior coefficients. Not estimated from PaySick outcomes. '
    + 'Recalibrate the intercept at 100 matured bads; retrain at 300.',
  terms: [
    // Credit foundation
    { feature: 'bureauScore', type: 'numeric', missing: 0, bands: [
      { lt: 550, logit: 1.0 }, { lt: 600, logit: 0.6 }, { lt: 650, logit: 0.25 },
      { lt: 700, logit: 0 }, { lt: 750, logit: -0.35 }, { lt: Infinity, logit: -0.7 }] },
    { feature: 'bureauThinFile', type: 'categorical', missing: 0, map: { true: 0.4, false: 0 }, otherwise: 0 },
    { feature: 'bureauEnquiries90d', type: 'numeric', missing: 0, bands: [
      { lt: 3, logit: 0 }, { lt: 6, logit: 0.25 }, { lt: Infinity, logit: 0.6 }] },
    { feature: 'bureauWorstArrears12m', type: 'numeric', missing: 0, bands: [
      { lt: 1, logit: 0 }, { lt: 2, logit: 0.5 }, { lt: Infinity, logit: 1.0 }] },
    { feature: 'bureauRevolvingUtilisation', type: 'numeric', missing: 0, bands: [
      { lt: 0.7, logit: 0 }, { lt: 0.9, logit: 0.15 }, { lt: Infinity, logit: 0.3 }] },

    // Affordability capacity
    { feature: 'discretionaryCover', type: 'numeric', missing: 0, bands: [
      { lt: 1.5, logit: 0.4 }, { lt: 2, logit: 0 }, { lt: 3, logit: -0.2 }, { lt: Infinity, logit: -0.4 }] },
    { feature: 'rti', type: 'numeric', missing: 0, bands: [
      { lt: 0.08, logit: -0.2 }, { lt: 0.12, logit: 0 }, { lt: 0.15, logit: 0.15 }, { lt: Infinity, logit: 0.35 }] },
    { feature: 'incomeCv', type: 'numeric', missing: 0, bands: [
      { lt: 0.10, logit: -0.1 }, { lt: 0.25, logit: 0 }, { lt: Infinity, logit: 0.3 }] },
    { feature: 'incomeVerificationMethod', type: 'categorical', missing: 0,
      map: { OPEN_BANKING: -0.1, BANK_STATEMENT: 0, PAYSLIP_AND_BANK_STATEMENT: 0, MANUAL_REVIEW: 0.3 }, otherwise: 0.3 },

    // Pillar 1 — clinical risk signal
    { feature: 'procedureCategory', type: 'categorical', missing: 0,
      map: { DENTISTRY: 0, OPHTHALMOLOGY: -0.15, AESTHETICS: 0.2, FERTILITY: 0.3 }, otherwise: 0.3 },
    { feature: 'urgency', type: 'categorical', missing: 0,
      map: { ELECTIVE: 0, SEMI_URGENT: 0.15, URGENT: 0.4 }, otherwise: 0.2 },
    { feature: 'bookingLeadDays', type: 'numeric', missing: 0, bands: [
      { lt: 3, logit: 0.2 }, { lt: 14, logit: 0 }, { lt: Infinity, logit: -0.1 }] },

    // Pillar 2 — insurance coordination
    { feature: 'segment', type: 'categorical', missing: 0, map: { SEGMENT_2_OOP: 0, SEGMENT_1_GAP: 0.1 }, otherwise: 0.1 },
    { feature: 'schemeMembershipVerified', type: 'categorical', missing: 0, map: { true: -0.1, false: 0 }, otherwise: 0 },
    { feature: 'tariffRatio', type: 'numeric', missing: 0, bands: [
      { lt: 1.1, logit: 0 }, { lt: 1.3, logit: 0.15 }, { lt: Infinity, logit: 0.4 }] },

    // Pillar 3 — healthcare payment behaviour
    { feature: 'internalCompletedArrangements', type: 'numeric', missing: 0, bands: [
      { lt: 1, logit: 0 }, { lt: Infinity, logit: -0.2 }] },
    { feature: 'internalOnTimeRatio', type: 'numeric', missing: 0, bands: [
      { lt: 0.8, logit: 0.8 }, { lt: 0.95, logit: 0.2 }, { lt: Infinity, logit: -0.3 }] },

    // Provider quality
    { feature: 'providerGrade', type: 'categorical', missing: 0, map: { P1: -0.2, P2: 0, P3: 0.2, P4: 0.5 }, otherwise: 0.3 },
    { feature: 'providerMissedRateCredible', type: 'linear', missing: 0, reference: 0.03, slope: 8, min: -0.3, max: 0.8 },
    { feature: 'providerDisputeRate', type: 'numeric', missing: 0, bands: [
      { lt: 0.03, logit: 0 }, { lt: 0.05, logit: 0.15 }, { lt: Infinity, logit: 0.3 }] },

    // Arrangement structure
    { feature: 'termMonths', type: 'numeric', missing: 0, bands: [
      { lt: 12.5, logit: 0 }, { lt: 24.5, logit: 0.15 }, { lt: Infinity, logit: 0.3 }] }
  ]
};

function validateModel(model) {
  if (!model || !model.modelId || !Array.isArray(model.terms)) {
    throw new Error('Invalid MRS model definition');
  }
  for (const term of model.terms) {
    const f = getFeature(term.feature);
    if (!f) throw new Error(`Model ${model.modelId} references unknown feature "${term.feature}"`);
    if (f.status !== 'DECISIONING') {
      throw new Error(`Model ${model.modelId} references ${f.status} feature "${term.feature}"`);
    }
  }
  return true;
}

const REGISTRY = new Map();
function register(model) {
  validateModel(model);
  REGISTRY.set(model.modelId, deepFreeze(model));
}
register(MRS_EXPERT_0_1_0);

function getModel(modelId) {
  return REGISTRY.get(modelId) || null;
}

function getChampion(policy = POLICY) {
  const m = getModel(policy.mrs.championModelId);
  if (!m) throw new Error(`Champion model ${policy.mrs.championModelId} is not registered`);
  return m;
}

function modelReadiness({ maturedOutcomes = 0, bads = 0 } = {}, policy = POLICY) {
  const g = policy.modelGovernance;
  if (bads >= g.minBadsForChallengerTraining && maturedOutcomes >= g.minMaturedForChallengerTraining) {
    return { stage: 'CHALLENGER_TRAINABLE', nextMilestone: 'Independent validation and promotion review' };
  }
  if (bads >= g.minBadsForInterceptRecalibration && maturedOutcomes >= g.minMaturedForInterceptRecalibration) {
    return {
      stage: 'INTERCEPT_RECALIBRATION',
      nextMilestone: `${g.minBadsForChallengerTraining} bads and ${g.minMaturedForChallengerTraining} matured outcomes to train challengers`
    };
  }
  return {
    stage: 'EXPERT_PRIOR',
    nextMilestone: `${g.minBadsForInterceptRecalibration} bads and ${g.minMaturedForInterceptRecalibration} matured outcomes to recalibrate`
  };
}

function canPromote(evidence = {}, policy = POLICY) {
  const p = policy.modelGovernance.promotion;
  const failures = [];
  if (!evidence.independentValidation) failures.push('INDEPENDENT_VALIDATION_MISSING');
  if (!(evidence.gini >= p.minGini)) failures.push('GINI_BELOW_MINIMUM');
  if (!(evidence.psi <= p.maxPsi)) failures.push('POPULATION_STABILITY_BREACH');
  if (!evidence.fairnessReviewPassed) failures.push('FAIRNESS_REVIEW_NOT_PASSED');
  if (!(evidence.developmentBads >= p.minDevelopmentBads)) failures.push('INSUFFICIENT_DEVELOPMENT_BADS');
  return { allowed: failures.length === 0, failures };
}

/** Shift the intercept so the model's average PD matches the observed bad rate. */
function recalibrateIntercept(model, { observedBadRate, meanPredictedPd }) {
  const shift = logit(observedBadRate) - logit(meanPredictedPd);
  const next = structuredClone(model);
  next.modelId = `${model.modelId}+ICAL`;
  next.stage = 'INTERCEPT_RECALIBRATION';
  next.intercept = model.intercept + shift;
  next.basePd = 1 / (1 + Math.exp(-next.intercept));
  validateModel(next);
  return deepFreeze(next);
}

module.exports = {
  getModel,
  getChampion,
  validateModel,
  modelReadiness,
  canPromote,
  recalibrateIntercept,
  register
};
