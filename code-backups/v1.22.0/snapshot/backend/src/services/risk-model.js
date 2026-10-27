'use strict';

/**
 * SHIELD RISK MODEL — PD, LGD AND EXPECTED LOSS (pure)
 *
 * The healthcare-specific Probability of Default and Loss Given Default
 * models, extracted from healthcare-risk.service.js in v1.21.0 so that the
 * existing service and the Kehr harness's pre-approval engine share one
 * implementation. Pure: no database, no network, no randomness.
 *
 * Versions
 *   v1.0  the model exactly as it was. Proven identical to the original
 *         service by tests/fixtures/risk-model-v1.0-golden.json.
 *   v1.1  harness applications. Both changes need risk-owner sign-off
 *         before production (PRELAUNCH_COMPLIANCE_CHECKLIST.md):
 *         1. Behavioural signals scored form-filling (completion time,
 *            edits, hour of day, device, location). A harness has no form,
 *            so the component is frozen at HARNESS_BEHAVIOURAL_NEUTRAL until
 *            replacement signals are validated (blueprint: model v2).
 *         2. Affordability is scored on the real instalment for the term.
 *            v1.0 assumed loanAmount / 3, which understates affordability
 *            for the 6 and 12 month terms pre-approval searches.
 *
 * The language model never calls this module. Scores come from here only.
 */

const MODEL_VERSIONS = Object.freeze({ LEGACY: 'v1.0', HARNESS: 'v1.1' });
const KNOWN_VERSIONS = Object.values(MODEL_VERSIONS);

const PD_WEIGHTS = Object.freeze({
  healthScore: 0.25,
  procedureRisk: 0.20,
  affordability: 0.25,
  providerPerformance: 0.15,
  behavioralSignals: 0.15,
});

const LGD_WEIGHTS = Object.freeze({
  medicalAidRecovery: 0.30,
  familySupport: 0.20,
  procedureValue: 0.25,
  providerRecovery: 0.25,
});

/**
 * The midpoint, and calculatePD's own default when no behavioural score is
 * given. For a typical form applicant (score ~85) this raises PD by about
 * 0.8 percentage points: deliberately conservative until v2 is validated.
 */
const HARNESS_BEHAVIOURAL_NEUTRAL = 50;

/**
 * Documented neutral values for inputs the patient chose not to share or a
 * partner couldn't supply. The same fallbacks healthcare-risk.service.js
 * already uses when its tables are unavailable: missing data is neutral,
 * never punitive.
 */
const MODEL_DEFAULTS = Object.freeze({
  healthScore: 60,
  familySupportIndicator: 0.5,
  procedureRisk: Object.freeze({ base_pd_risk: 40, base_lgd_risk: 45, necessity_score: 0.6 }),
  providerScore: 50,
});

function assertVersion(modelVersion) {
  if (!KNOWN_VERSIONS.includes(modelVersion)) throw new Error(`Unknown model version: ${modelVersion}`);
}

const round4 = (n) => Math.round(n * 10000) / 10000;

// ─── v1.0 maths, unchanged ──────────────────────────────────────────────────

function getPDBand(pdScore) {
  if (pdScore <= 0.02) return 'very_low';
  if (pdScore <= 0.05) return 'low';
  if (pdScore <= 0.10) return 'medium';
  if (pdScore <= 0.20) return 'high';
  return 'very_high';
}

function getLGDBand(lgdScore) {
  if (lgdScore <= 0.20) return 'very_low';
  if (lgdScore <= 0.35) return 'low';
  if (lgdScore <= 0.50) return 'medium';
  if (lgdScore <= 0.70) return 'high';
  return 'very_high';
}

function calculatePD(scores) {
  const {
    healthScore = 50,
    procedureRisk = 50,
    affordabilityScore = 50,
    providerScore = 50,
    behavioralScore = 50,
  } = scores;

  // Normalised to 0-1, inverted: a higher score means lower risk
  const healthComponent = (100 - healthScore) / 100 * PD_WEIGHTS.healthScore;
  const procedureComponent = procedureRisk / 100 * PD_WEIGHTS.procedureRisk;
  const affordabilityComponent = (100 - affordabilityScore) / 100 * PD_WEIGHTS.affordability;
  const providerComponent = (100 - providerScore) / 100 * PD_WEIGHTS.providerPerformance;
  const behavioralComponent = (100 - behavioralScore) / 100 * PD_WEIGHTS.behavioralSignals;

  const pdRaw = healthComponent + procedureComponent + affordabilityComponent + providerComponent + behavioralComponent;

  // Calibrated to the 0.5% - 15% target range
  const pdScore = Math.max(0.005, Math.min(0.15, pdRaw * 0.15));

  return {
    pd_score: round4(pdScore),
    pd_band: getPDBand(pdScore),
    components: {
      healthScore: round4(healthComponent),
      procedureRisk: round4(procedureComponent),
      affordability: round4(affordabilityComponent),
      provider: round4(providerComponent),
      behavioral: round4(behavioralComponent),
    },
  };
}

function calculateLGD(params) {
  const {
    hasMedicalAid = false,
    medicalAidTier = 'none',
    procedureNecessity = 0.5,
    providerNetwork = false,
    familySupportIndicator = 0.5,
  } = params;

  // Medical aid recovery potential
  let medicalAidRecovery;
  if (!hasMedicalAid) medicalAidRecovery = 0.8;
  else if (medicalAidTier === 'comprehensive') medicalAidRecovery = 0.2;
  else if (medicalAidTier === 'classic') medicalAidRecovery = 0.35;
  else medicalAidRecovery = 0.5;

  // Family support: medical costs attract family payment, more so when necessary
  const familySupportLGD = 1 - (familySupportIndicator * procedureNecessity);
  // Essential procedures retain value
  const procedureValueLGD = 1 - procedureNecessity;
  // Network partners assist with recovery
  const providerRecoveryLGD = providerNetwork ? 0.3 : 0.6;

  const lgdRaw =
    medicalAidRecovery * LGD_WEIGHTS.medicalAidRecovery +
    familySupportLGD * LGD_WEIGHTS.familySupport +
    procedureValueLGD * LGD_WEIGHTS.procedureValue +
    providerRecoveryLGD * LGD_WEIGHTS.providerRecovery;

  // Calibrated to the 20% - 70% target range
  const lgdScore = Math.max(0.20, Math.min(0.70, lgdRaw));

  return {
    lgd_score: round4(lgdScore),
    lgd_band: getLGDBand(lgdScore),
    components: {
      medicalAidRecovery: round4(medicalAidRecovery * LGD_WEIGHTS.medicalAidRecovery),
      familySupport: round4(familySupportLGD * LGD_WEIGHTS.familySupport),
      procedureValue: round4(procedureValueLGD * LGD_WEIGHTS.procedureValue),
      providerRecovery: round4(providerRecoveryLGD * LGD_WEIGHTS.providerRecovery),
    },
  };
}

function analyzeBehavioralSignals(behavior = {}, { modelVersion = MODEL_VERSIONS.LEGACY } = {}) {
  assertVersion(modelVersion);
  if (modelVersion === MODEL_VERSIONS.HARNESS) return HARNESS_BEHAVIOURAL_NEUTRAL;

  const {
    completionTimeSeconds = 180,
    applicationHour = 12,
    deviceType = 'desktop',
    locationConsistent = true,
    formEditsCount = 2,
  } = behavior || {};

  let score = 60;
  if (completionTimeSeconds < 60) score -= 15;
  else if (completionTimeSeconds > 600) score -= 10;
  else if (completionTimeSeconds >= 120 && completionTimeSeconds <= 300) score += 10;

  if (applicationHour >= 9 && applicationHour <= 17) score += 5;
  else if (applicationHour >= 0 && applicationHour <= 5) score -= 10;

  if (deviceType === 'mobile') score += 5;

  if (locationConsistent) score += 5;
  else score -= 10;

  if (formEditsCount >= 1 && formEditsCount <= 4) score += 5;
  else if (formEditsCount > 10) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function getMedicalAidTier(scheme, option) {
  if (!scheme) return 'none';
  const optionLower = (option || '').toLowerCase();
  if (optionLower.includes('comprehensive') || optionLower.includes('executive')) return 'comprehensive';
  if (optionLower.includes('classic') || optionLower.includes('priority')) return 'classic';
  if (optionLower.includes('essential') || optionLower.includes('smart')) return 'essential';
  return 'basic';
}

function makeRiskDecision(pdScore, lgdScore, expectedLossRate) {
  if (expectedLossRate <= 0.01) return { decision: 'approve', reason: 'Low expected loss rate', confidence: 0.95 };
  if (expectedLossRate <= 0.025) return { decision: 'approve', reason: 'Acceptable expected loss within risk appetite', confidence: 0.85 };
  if (expectedLossRate <= 0.05) return { decision: 'review', reason: 'Elevated risk - manual review recommended', confidence: 0.70 };
  return { decision: 'decline', reason: 'Expected loss exceeds risk appetite', confidence: 0.90 };
}

function getRecommendedTerm(pdScore, loanAmount) {
  if (pdScore <= 0.03) return loanAmount > 10000 ? 6 : 3;
  if (pdScore <= 0.05) return loanAmount > 15000 ? 4 : 3;
  return 3;
}

function calculateMaxApprovedAmount(affordabilityMax, pdScore) {
  let riskMultiplier = 1;
  if (pdScore <= 0.03) riskMultiplier = 1.0;
  else if (pdScore <= 0.05) riskMultiplier = 0.85;
  else if (pdScore <= 0.08) riskMultiplier = 0.70;
  else riskMultiplier = 0.50;
  return Math.round(affordabilityMax * riskMultiplier);
}

// ─── v1.1 additions ─────────────────────────────────────────────────────────

/**
 * Affordability band against healthcare capacity (30% of disposable
 * income), the v1.0 rule, but scored on the instalment actually proposed.
 * All amounts in cents.
 */
function affordabilityScore({ monthlyIncomeCents, obligationsCents = 0, premiumCents = 0, instalmentCents }) {
  const disposable = monthlyIncomeCents - obligationsCents - premiumCents;
  const capacityCents = Math.max(0, Math.round(disposable * 0.30));
  if (!monthlyIncomeCents || monthlyIncomeCents <= 0 || capacityCents === 0) {
    return { score: 20, band: 'insufficient', capacityCents };
  }
  if (instalmentCents <= capacityCents * 0.5) return { score: 85, band: 'high', capacityCents };
  if (instalmentCents <= capacityCents * 0.75) return { score: 65, band: 'medium', capacityCents };
  if (instalmentCents <= capacityCents) return { score: 45, band: 'low', capacityCents };
  return { score: 20, band: 'insufficient', capacityCents };
}

/**
 * Full assessment for one amount and term. Inputs in cents. Anything the
 * patient didn't share or a partner couldn't supply falls back to
 * MODEL_DEFAULTS, and is listed in inputsUsed.defaulted for the audit log.
 */
function assessRisk(inputs) {
  const modelVersion = inputs.modelVersion || MODEL_VERSIONS.HARNESS;
  assertVersion(modelVersion);

  const defaulted = [];
  const pick = (key) => {
    if (inputs[key] === undefined || inputs[key] === null) { defaulted.push(key); return MODEL_DEFAULTS[key]; }
    return inputs[key];
  };
  const healthScore = pick('healthScore');
  const familySupportIndicator = pick('familySupportIndicator');
  const providerScore = pick('providerScore');
  const procedureRisk = inputs.procedureRisk || (defaulted.push('procedureRisk'), MODEL_DEFAULTS.procedureRisk);

  const instalmentCents = Math.ceil(inputs.amountCents / inputs.termMonths);
  const afford = modelVersion === MODEL_VERSIONS.HARNESS
    ? affordabilityScore({ monthlyIncomeCents: inputs.monthlyIncomeCents, obligationsCents: inputs.obligationsCents, premiumCents: inputs.premiumCents, instalmentCents })
    : affordabilityScore({ monthlyIncomeCents: inputs.monthlyIncomeCents, obligationsCents: inputs.obligationsCents, premiumCents: inputs.premiumCents, instalmentCents: Math.ceil(inputs.amountCents / 3) });

  const behavioralScore = analyzeBehavioralSignals(inputs.behavior, { modelVersion });

  const pd = calculatePD({
    healthScore,
    procedureRisk: procedureRisk.base_pd_risk,
    affordabilityScore: afford.score,
    providerScore,
    behavioralScore,
  });
  const lgd = calculateLGD({
    hasMedicalAid: !!inputs.hasMedicalAid,
    medicalAidTier: inputs.medicalAidTier || 'none',
    procedureNecessity: procedureRisk.necessity_score,
    providerNetwork: !!inputs.isNetworkPartner,
    familySupportIndicator,
  });

  const expectedLossRate = Math.round(pd.pd_score * lgd.lgd_score * 1e6) / 1e6;
  const expectedLossCents = Math.round(pd.pd_score * lgd.lgd_score * inputs.amountCents);
  const decision = makeRiskDecision(pd.pd_score, lgd.lgd_score, expectedLossRate);

  const topFactors = Object.entries(pd.components)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([factor, contribution]) => ({ factor, contribution }));

  return {
    modelVersion,
    pd: { score: pd.pd_score, band: pd.pd_band, components: pd.components },
    lgd: { score: lgd.lgd_score, band: lgd.lgd_band, components: lgd.components },
    expectedLossRate,
    expectedLossCents,
    decision,
    affordability: afford,
    instalmentCents,
    topFactors,
    inputsUsed: {
      healthScore,
      familySupportIndicator,
      providerScore,
      procedureRisk: { ...procedureRisk },
      behavioralScore,
      defaulted,
    },
  };
}

module.exports = {
  MODEL_VERSIONS,
  PD_WEIGHTS,
  LGD_WEIGHTS,
  HARNESS_BEHAVIOURAL_NEUTRAL,
  MODEL_DEFAULTS,
  getPDBand,
  getLGDBand,
  calculatePD,
  calculateLGD,
  analyzeBehavioralSignals,
  getMedicalAidTier,
  makeRiskDecision,
  getRecommendedTerm,
  calculateMaxApprovedAmount,
  affordabilityScore,
  assessRisk,
};
