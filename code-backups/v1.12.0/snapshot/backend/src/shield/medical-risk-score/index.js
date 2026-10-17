/**
 * PaySick Medical Risk Score — feature extraction and PD scoring.
 *
 * The MRS is the module's PD engine. It answers one question: how likely is
 * this patient to reach the outcome in policy.mrs.outcomeDefinition? It does
 * not decide affordability and does not set provider limits — it CONSUMES
 * their outputs as features alongside bureau, clinical, insurance and
 * PaySick payment-history signals.
 *
 * Outputs: 12-month PD, lifetime PD over the term, a 300–900 score
 * (600 ≈ 30:1 good:bad, 50 points doubles the odds), a grade, per-feature
 * contributions, adverse reasons, and expected loss at policy LGD.
 */

'use strict';

const registry = require('./feature-registry');
const { validateModel } = require('./models');

const SCORE_BASE = 600;
const SCORE_BASE_ODDS = 30;
const POINTS_TO_DOUBLE = 50;
const MAX_RATIO_FEATURE = 99;

function cap(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  if (x === Infinity) return MAX_RATIO_FEATURE;
  return x;
}

/**
 * Build the feature vector from stage outputs. Only registry DECISIONING and
 * SHADOW keys are ever written; anything else (including prohibited data)
 * cannot enter the vector.
 */
function extractFeatures({ application = {}, bureau, affordabilityPd = {}, providerPd = {}, internalHistory, segment1, behaviour = {} }) {
  const due = Number(internalHistory?.instalmentsDue) || 0;
  const benchmark = Number(segment1?.benchmarkCents) || 0;
  const raw = {
    bureauScore: bureau ? bureau.score ?? null : null,
    bureauThinFile: bureau ? !!bureau.thinFile : null,
    bureauEnquiries90d: bureau ? bureau.enquiries90d ?? null : null,
    bureauWorstArrears12m: bureau ? bureau.worstArrearsCycles12m ?? null : null,
    bureauRevolvingUtilisation: bureau ? bureau.revolvingUtilisation ?? null : null,
    discretionaryCover: cap(affordabilityPd.discretionaryCover),
    rti: cap(affordabilityPd.rti),
    incomeCv: cap(affordabilityPd.incomeCv),
    incomeVerificationMethod: affordabilityPd.incomeVerificationMethod ?? null,
    dtiPost: cap(affordabilityPd.dtiPost),
    procedureCategory: application.procedureCategory ?? null,
    urgency: application.urgency ?? null,
    bookingLeadDays: application.bookingLeadDays ?? null,
    segment: application.segment ?? null,
    schemeMembershipVerified: segment1 ? !!segment1.schemeMembershipVerified : false,
    tariffRatio: segment1 && benchmark ? Math.round((application.amountCents / benchmark) * 1000) / 1000 : null,
    internalCompletedArrangements: internalHistory ? Number(internalHistory.completedArrangements) || 0 : null,
    internalOnTimeRatio: due > 0 ? Math.round((Number(internalHistory.instalmentsOnTime) / due) * 10000) / 10000 : null,
    providerGrade: providerPd.providerGrade ?? null,
    providerMissedRateCredible: providerPd.providerMissedRateCredible ?? null,
    providerDisputeRate: providerPd.providerDisputeRate ?? null,
    termMonths: application.termMonths ?? null,
    applicationHour: behaviour.applicationHour ?? null,
    deviceType: behaviour.deviceType ?? null,
    completionSeconds: behaviour.completionSeconds ?? null
  };

  const decisioning = {};
  const shadow = {};
  for (const f of registry.FEATURES) {
    if (!(f.key in raw)) continue;
    if (f.status === 'DECISIONING') decisioning[f.key] = raw[f.key];
    else if (f.status === 'SHADOW') shadow[f.key] = raw[f.key];
  }
  return { registryVersion: registry.REGISTRY_VERSION, decisioning, shadow };
}

function termContribution(term, value) {
  if (value === null || value === undefined) return { contribution: term.missing || 0, missing: true };
  if (term.type === 'categorical') {
    const key = String(value);
    return { contribution: key in term.map ? term.map[key] : term.otherwise, missing: false };
  }
  if (term.type === 'linear') {
    const c = (Number(value) - term.reference) * term.slope;
    return { contribution: Math.max(term.min, Math.min(term.max, c)), missing: false };
  }
  const v = Number(value);
  const band = term.bands.find((b) => v < b.lt) || term.bands[term.bands.length - 1];
  return { contribution: band.logit, missing: false };
}

function gradeFor(pd, policy) {
  return (policy.mrs.grades.find((g) => pd <= g.maxPd) || policy.mrs.grades[policy.mrs.grades.length - 1]).grade;
}

function toReasonCode(feature) {
  return `MRS_${feature.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

function scoreMedicalRisk(features, model, ctx, policy) {
  validateModel(model);
  let logit = model.intercept;
  const contributions = [];
  const missingFeatures = [];

  for (const term of model.terms) {
    const value = features[term.feature];
    const { contribution, missing } = termContribution(term, value);
    if (missing) missingFeatures.push(term.feature);
    logit += contribution;
    contributions.push({
      feature: term.feature,
      pillar: registry.getFeature(term.feature).pillar,
      value: value === undefined ? null : value,
      logitContribution: Math.round(contribution * 10000) / 10000
    });
  }

  const rawPd = 1 / (1 + Math.exp(-logit));
  const pd12m = Math.round(Math.min(0.9999, Math.max(0.0001, rawPd)) * 1e6) / 1e6;
  const termMonths = ctx.termMonths || 12;
  const pdLifetime = 1 - Math.pow(1 - pd12m, termMonths / 12);
  const odds = (1 - pd12m) / pd12m;
  const score = Math.max(300, Math.min(900, Math.round(
    SCORE_BASE + (POINTS_TO_DOUBLE / Math.LN2) * (Math.log(odds) - Math.log(SCORE_BASE_ODDS))
  )));

  const { lgd, eadFactor } = policy.mrs;
  const expectedLossCents = Math.round(pdLifetime * lgd * eadFactor * (ctx.exposureCents || 0));
  const expectedLossToRevenue = ctx.revenueCents > 0
    ? Math.round((expectedLossCents / ctx.revenueCents) * 10000) / 10000
    : null;

  const adverseReasons = contributions
    .filter((c) => c.logitContribution > 0)
    .sort((a, b) => b.logitContribution - a.logitContribution)
    .slice(0, 4)
    .map((c) => ({ feature: c.feature, pillar: c.pillar, logitContribution: c.logitContribution, reasonCode: toReasonCode(c.feature) }));

  return {
    modelId: model.modelId,
    modelStage: model.stage,
    calibrated: model.calibrated,
    outcomeDefinition: model.outcomeDefinition,
    pd12m,
    pdLifetime,
    score,
    grade: gradeFor(pd12m, policy),
    logit: Math.round(logit * 10000) / 10000,
    contributions,
    adverseReasons,
    missingFeatures,
    pdInputs: [...new Set(model.terms.map((t) => t.feature))],
    lgd,
    eadFactor,
    expectedLossCents,
    expectedLossToRevenue
  };
}

/** Score challenger models for comparison only — never used in the decision. */
function scoreChallengers(features, challengerModels, ctx, policy) {
  return (challengerModels || []).map((m) => {
    const r = scoreMedicalRisk(features, m, ctx, policy);
    return { modelId: r.modelId, modelStage: r.modelStage, pd12m: r.pd12m, score: r.score, grade: r.grade };
  });
}

module.exports = { extractFeatures, scoreMedicalRisk, scoreChallengers };
