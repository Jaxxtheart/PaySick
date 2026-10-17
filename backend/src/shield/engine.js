/**
 * Shield Underwriting — orchestration engine.
 *
 *   underwrite(input, { now, allowMockSources?, policy?, model?, challengerModels? })
 *
 * Pure and deterministic: no clock reads, no randomness, no I/O. The caller
 * supplies the evaluation time and assembles the input (see context-builder).
 *
 * Every stage is evaluated, even after a decline, so each application yields
 * a complete feature vector for the Medical Risk Score data flywheel (reject
 * inference included). The decision is the most severe stage result:
 *
 *   DECLINED  >  REFER  >  APPROVED / APPROVED_COOLING_OFF
 *
 * decisiveStage is the first stage, in evaluation order, at that severity.
 *
 * Three outcomes are reported separately, and outcomeMap states the wiring:
 *   patientAffordability     regulatory pass/fail — never overridden by PD
 *   providerRisk             limits, concentration, performance, payout plan
 *   medicalRiskScore         the PD engine — consumes capacity measures from
 *                            affordability and the provider grade as features
 */

'use strict';

const { POLICY } = require('./policy');
const { computeTerms } = require('./terms');
const { provenanceIssues, worstStatus } = require('./provenance');
const { evaluateKnockouts } = require('./knockouts');
const { assessAffordability } = require('./affordability');
const { assessProviderRisk } = require('./provider-risk');
const registry = require('./medical-risk-score/feature-registry');
const { getChampion } = require('./medical-risk-score/models');
const { extractFeatures, scoreMedicalRisk, scoreChallengers } = require('./medical-risk-score');

const STAGE_ORDER = ['APPLICATION', 'PORTFOLIO', 'KNOCKOUT', 'SEGMENT', 'PROVIDER', 'AFFORDABILITY', 'MEDICAL_RISK_SCORE'];
const HARD_STAGES = new Set(['APPLICATION', 'KNOCKOUT', 'SEGMENT', 'AFFORDABILITY']);

// Declines that do not depend on the arrangement amount. When the gap amount
// is provisional, only amount-dependent declines are softened to REFER.
const AMOUNT_INDEPENDENT_DECLINES = new Set([
  'PROVIDER_STATUS', 'PROVIDER_PERFORMANCE_SUSPENSION', 'PROVIDER_FIRST_INSTALMENT_FAILURE',
  'PROVIDER_NO_BILLING_AGREEMENT', 'TARIFF_ABOVE_HARD_LIMIT',
  'INCOME_NOT_VERIFIED', 'INCOME_VERIFICATION_STALE', 'INCOME_BELOW_FLOOR'
]);

const AFFORDABILITY_MEASURES = [
  'grossAssessedCents', 'netAssessedCents', 'incomeCv', 'expenseNormCents', 'minimumExpensesCents',
  'obligationsCents', 'discretionaryIncomeCents', 'instalmentCents', 'rti', 'dtiPost', 'discretionaryCover'
];
const PROVIDER_CONTROLS = [
  'verification', 'tier', 'perPatientCapCents', 'monthlyVolumeCap', 'concentration',
  'performanceBreakers', 'tariffControl', 'payoutPlan'
];

function evaluateApplication(app, policy) {
  const ap = policy.application;
  const codes = [];
  if (!(app.amountCents >= ap.minAmountCents)) codes.push('APPLICATION_AMOUNT_BELOW_MINIMUM');
  if (!(app.termMonths >= ap.minTermMonths && app.termMonths <= ap.maxTermMonths)) codes.push('APPLICATION_TERM_OUT_OF_POLICY');
  return { status: codes.length ? 'DECLINE' : 'PASS', reasonCodes: codes };
}

function evaluatePortfolio(portfolio, app, policy, allowMockSources) {
  const pp = policy.portfolio;
  const reasons = [];
  const statuses = [];
  const breakers = [];
  let tightened = false;
  let marketplaceOnly = false;

  const issues = provenanceIssues('portfolio', portfolio, { allowMockSources });
  issues.forEach((c) => { statuses.push('REFER'); reasons.push(c); });

  if (portfolio) {
    const arrears = Number(portfolio.arrears30Rate) || 0;
    if (arrears > pp.arrearsHaltRate) {
      statuses.push('REFER'); reasons.push('PORTFOLIO_ORIGINATION_HALT'); breakers.push('PORTFOLIO_ARREARS_HALT');
    } else if (arrears > pp.arrearsTightenRate) {
      tightened = true; reasons.push('PORTFOLIO_ARREARS_TIGHTEN'); breakers.push('PORTFOLIO_ARREARS_TIGHTEN');
    }
    if ((Number(portfolio.balanceSheetShare) || 0) > pp.balanceSheetMaxShare) {
      marketplaceOnly = true; reasons.push('BALANCE_SHEET_LIMIT'); breakers.push('BALANCE_SHEET_LIMIT');
    }
    const floor = (Number(portfolio.monthlyFeeIncomeCents) || 0) * pp.reserveFloorShareOfMonthlyFees;
    if ((Number(portfolio.reserveFundCents) || 0) < floor) {
      statuses.push('REFER'); reasons.push('RESERVE_FUND_BELOW_FLOOR'); breakers.push('RESERVE_FUND');
    }
    if (app.segment === 'SEGMENT_1_GAP' && (Number(portfolio.gapTariffFlaggedRate) || 0) > pp.gapTariffFlaggedMaxRate) {
      statuses.push('REFER'); reasons.push('GAP_TARIFF_INFLATION'); breakers.push('TARIFF_INFLATION');
    }
  }
  return { status: worstStatus(statuses), reasonCodes: reasons, breakers, tightened, marketplaceOnly };
}

function evaluateSegment(input, policy, allowMockSources) {
  const app = input.application;
  const seg = policy.segments[app.segment];
  const reasons = [];
  const statuses = [];
  if (!seg) return { status: 'DECLINE', reasonCodes: ['SEGMENT_UNKNOWN'], facilitationAmountCents: app.amountCents };
  if (!seg.enabled) { statuses.push('DECLINE'); reasons.push('SEGMENT_NOT_ENABLED'); }

  let facilitationAmountCents = app.amountCents;
  let amountProvisional = false;
  if (app.segment === 'SEGMENT_1_GAP') {
    const s1 = input.segment1;
    provenanceIssues('scheme', s1, { allowMockSources }).forEach((c) => { statuses.push('REFER'); reasons.push(c); });
    const benefit = s1 ? s1.schemeBenefitCents : null;
    if (benefit === null || benefit === undefined) {
      // The gap is unknown: size on the full invoice, but treat every
      // sizing-dependent decline as provisional (REFER) — missing data must
      // never decline a patient.
      statuses.push('REFER'); reasons.push('GAP_SCHEME_BENEFIT_UNAVAILABLE');
      amountProvisional = true;
    } else {
      facilitationAmountCents = Math.max(0, app.amountCents - Math.round(benefit));
    }
    if (s1 && !s1.schemeMembershipVerified) { statuses.push('REFER'); reasons.push('GAP_SCHEME_MEMBERSHIP_NOT_VERIFIED'); }
  }
  return { status: worstStatus(statuses), reasonCodes: reasons, facilitationAmountCents, amountProvisional };
}

function evaluateMrs(mrs, policy) {
  const m = policy.mrs;
  const reasons = [];
  const statuses = [];
  if (mrs.pd12m > m.pdDeclineAbove) { statuses.push('DECLINE'); reasons.push('PD_ABOVE_DECLINE_THRESHOLD'); }
  else if (mrs.pd12m > m.pdReferAbove) { statuses.push('REFER'); reasons.push('PD_REFER_BAND'); }

  const elr = mrs.expectedLossToRevenue;
  if (elr === null) { statuses.push('REFER'); reasons.push('EXPECTED_LOSS_UNPRICED'); }
  else if (elr > m.elDeclineAboveRevenueShare) { statuses.push('DECLINE'); reasons.push('EXPECTED_LOSS_EXCEEDS_REVENUE'); }
  else if (elr > m.elReferAboveRevenueShare) { statuses.push('REFER'); reasons.push('EXPECTED_LOSS_MARGIN_THIN'); }
  return { status: worstStatus(statuses), reasonCodes: reasons };
}

function buildOutcomeMap(mrs, featureVector) {
  const pillarOf = (k) => registry.getFeature(k).pillar;
  const byPillar = {};
  for (const k of mrs.pdInputs) (byPillar[pillarOf(k)] = byPillar[pillarOf(k)] || []).push(k);
  return {
    probabilityOfNonRepayment: {
      engine: 'PaySick Medical Risk Score',
      modelId: mrs.modelId,
      modelStage: mrs.modelStage,
      outcomeDefinition: mrs.outcomeDefinition,
      inputs: mrs.pdInputs,
      byPillar,
      fromPatientAffordability: mrs.pdInputs.filter((k) => pillarOf(k) === 'AFFORDABILITY_CAPACITY'),
      fromProviderRisk: mrs.pdInputs.filter((k) => pillarOf(k) === 'PROVIDER_QUALITY'),
      shadowCaptured: Object.keys(featureVector.shadow),
      drives: ['risk grade', 'refer and decline thresholds', 'expected loss against arrangement revenue']
    },
    patientAffordability: {
      rule: 'Regulatory pass/fail gate. Never overridden by the Medical Risk Score or a reviewer.',
      measures: AFFORDABILITY_MEASURES,
      checks: ['verified income (3 months, 90-day freshness)', 'net income floor', 'discretionary income covers instalment',
               'RTI ceiling on net income', 'DTI ceiling on gross income']
    },
    providerRiskManagement: {
      rule: 'Controls exposure to the provider. The provider grade is also one PD input.',
      controls: PROVIDER_CONTROLS
    }
  };
}

function underwrite(rawInput, options = {}) {
  const now = options.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('underwrite requires options.now (a valid Date) for deterministic evaluation');
  }
  const policy = options.policy || POLICY;
  const allowMockSources = !!options.allowMockSources;
  const model = options.model || getChampion(policy);

  const { clean: input, removed } = registry.stripProhibited(rawInput);
  const app = input.application;
  if (!app) throw new Error('underwrite requires input.application');
  const ctxOpts = { now, allowMockSources };

  // ── Stages ──
  const application = evaluateApplication(app, policy);
  const portfolio = evaluatePortfolio(input.portfolio, app, policy, allowMockSources);
  const knockouts = evaluateKnockouts(input, policy, ctxOpts);
  const segment = evaluateSegment(input, policy, allowMockSources);
  const terms = computeTerms({ amountCents: segment.facilitationAmountCents, termMonths: app.termMonths }, policy);
  const provider = assessProviderRisk({ ...input, facilitationAmountCents: terms.facilitationAmountCents }, policy, ctxOpts);
  const affordability = assessAffordability({
    income: input.income,
    bureau: input.bureau,
    declared: input.declared,
    terms,
    flags: { urgent: app.urgency === 'URGENT', tightened: portfolio.tightened, segment: app.segment }
  }, policy, ctxOpts);

  const featureVector = extractFeatures({
    application: { ...app, termMonths: terms.termMonths },
    bureau: input.bureau,
    affordabilityPd: affordability.pdFeatures,
    providerPd: provider.pdFeatures,
    internalHistory: input.internalHistory,
    segment1: input.segment1,
    behaviour: input.behaviour
  });
  const scoreCtx = { termMonths: terms.termMonths, exposureCents: terms.facilitationAmountCents, revenueCents: terms.revenueCents };
  const mrs = scoreMedicalRisk(featureVector.decisioning, model, scoreCtx, policy);
  const mrsStage = evaluateMrs(mrs, policy);
  const challengerScores = scoreChallengers(featureVector.decisioning, options.challengerModels, scoreCtx, policy);

  // AMBER affordability needs a human: it becomes REFER at engine level.
  // With a provisional (unknown) gap amount, sizing-dependent declines refer.
  const sized = (status, codes) => (
    segment.amountProvisional && status === 'DECLINE' && !codes.some((c) => AMOUNT_INDEPENDENT_DECLINES.has(c))
      ? 'REFER' : status
  );
  const affordabilityStatus = affordability.status === 'AMBER' ? 'REFER' : affordability.status;
  const stageResults = {
    APPLICATION: application,
    PORTFOLIO: portfolio,
    KNOCKOUT: knockouts,
    SEGMENT: segment,
    PROVIDER: { ...provider, status: sized(provider.status, provider.reasonCodes) },
    AFFORDABILITY: { ...affordability, status: sized(affordabilityStatus, affordability.reasonCodes) },
    MEDICAL_RISK_SCORE: { ...mrsStage, status: sized(mrsStage.status, mrsStage.reasonCodes) }
  };

  // ── Decision ──
  const worst = worstStatus(STAGE_ORDER.map((s) => stageResults[s].status));
  const decisiveStage = worst === 'PASS' ? null : STAGE_ORDER.find((s) => stageResults[s].status === worst);
  const hardDecline = worst === 'DECLINE'
    && STAGE_ORDER.some((s) => stageResults[s].status === 'DECLINE' && HARD_STAGES.has(s));

  const isGap = app.segment === 'SEGMENT_1_GAP';
  const coolingOffRequired = app.urgency === 'ELECTIVE' && terms.facilitationAmountCents > policy.coolingOff.electiveAboveCents;
  const decision = worst === 'DECLINE' ? 'DECLINED'
    : worst === 'REFER' ? 'REFER'
    : coolingOffRequired ? 'APPROVED_COOLING_OFF' : 'APPROVED';

  const reasonCodes = [...new Set(STAGE_ORDER.flatMap((s) => stageResults[s].reasonCodes))];

  const disbursementConditions = [];
  if (decision !== 'DECLINED') {
    if (!input.mandate?.debiCheckAuthorised) disbursementConditions.push('DEBICHECK_MANDATE_AUTHORISED');
    disbursementConditions.push('PATIENT_PROCEDURE_CONFIRMATION', 'PROVIDER_PROCEDURE_CONFIRMATION');
    if (coolingOffRequired) disbursementConditions.push('COOLING_OFF_ELAPSED');
    if (isGap) disbursementConditions.push('GAP_DISCLOSURE_ACKNOWLEDGED');
    if (isGap && input.segment1 && input.segment1.dspIsOnList === false) disbursementConditions.push('DSP_WARNING_ACKNOWLEDGED');
    if (decision === 'REFER') disbursementConditions.push('HUMAN_REVIEW_SIGN_OFF');
  }

  let alternative = null;
  const sizingDecline = reasonCodes.some((c) => ['PROVIDER_TIER_PATIENT_CAP', 'RTI_ABOVE_CEILING',
    'DISCRETIONARY_INCOME_INSUFFICIENT', 'DTI_ABOVE_CEILING'].includes(c));
  if (decision === 'DECLINED' && sizingDecline && knockouts.status !== 'DECLINE' && affordability.measures) {
    const caps = [affordability.maxAffordable.amountCents];
    if (provider.limits) caps.push(provider.limits.perPatientCapCents);
    const maxAmountCents = Math.min(...caps);
    if (maxAmountCents >= policy.application.minAmountCents) {
      alternative = { maxAmountCents, termMonths: terms.termMonths };
    }
  }

  return {
    decision,
    decisiveStage,
    hardDecline,
    reasonCodes,
    humanReviewRequired: decision === 'REFER',
    marketplaceEligible: decision === 'APPROVED' || decision === 'APPROVED_COOLING_OFF',
    fundingRoute: decision === 'DECLINED' ? null : portfolio.marketplaceOnly ? 'MARKETPLACE_ONLY' : 'MARKETPLACE_OR_BALANCE_SHEET',
    disbursementConditions,
    coolingOff: {
      required: coolingOffRequired,
      expiresAt: coolingOffRequired ? new Date(now.getTime() + policy.coolingOff.hours * 3600 * 1000).toISOString() : null
    },
    alternative,
    terms: {
      facilitationAmountCents: terms.facilitationAmountCents,
      termMonths: terms.termMonths,
      instalmentCents: terms.instalmentCents,
      totalRepayableCents: terms.totalRepayableCents,
      costOfCreditCents: terms.costOfCreditCents,
      mdrCents: terms.mdrCents,
      revenueCents: terms.revenueCents
    },
    stages: STAGE_ORDER.map((s) => ({ stage: s, status: stageResults[s].status, reasonCodes: stageResults[s].reasonCodes })),
    knockouts: { status: knockouts.status, reasonCodes: knockouts.reasonCodes },
    patientAffordability: {
      status: affordability.status,
      reasonCodes: affordability.reasonCodes,
      measures: affordability.measures,
      maxAffordable: affordability.maxAffordable,
      handedToPd: affordability.pdFeatures
    },
    providerRisk: {
      status: provider.status,
      grade: provider.grade,
      reasonCodes: provider.reasonCodes,
      limits: provider.limits,
      measures: provider.measures,
      payoutPlan: provider.payoutPlan,
      handedToPd: provider.pdFeatures
    },
    medicalRiskScore: { ...mrs, status: mrsStage.status, reasonCodes: mrsStage.reasonCodes, challengerScores },
    circuitBreakers: portfolio.breakers,
    outcomeMap: buildOutcomeMap(mrs, featureVector),
    featureVector,
    governance: {
      prohibitedInputsRemoved: removed,
      registryVersion: registry.REGISTRY_VERSION,
      allowMockSources
    },
    policyVersion: policy.version,
    modelId: mrs.modelId,
    evaluatedAt: now.toISOString()
  };
}

module.exports = { underwrite, STAGE_ORDER };
