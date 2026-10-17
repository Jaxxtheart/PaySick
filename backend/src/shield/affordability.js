/**
 * Shield Underwriting — Patient Affordability.
 *
 * A regulatory pass/fail gate modelled on the NCA affordability assessment:
 *
 *   assessed income   verified gross + net income over ≥3 months
 *                     (lowest month used when income is volatile)
 *   obligations       the HIGHEST of bureau, declared and observed debit orders
 *   expenses          the HIGHER of declared expenses and the NCA norm
 *   discretionary     net − expenses − obligations
 *
 * The all-in instalment must fit within discretionary income, the RTI ceiling
 * (on NET income) and the DTI ceiling (on GROSS income) — for every segment.
 *
 * Affordability is never overridden by the Medical Risk Score. Its capacity
 * measures are passed on to the MRS as PD features (pdFeatures).
 */

'use strict';

const { expenseNorm } = require('./policy');
const { maxAmountForInstalment } = require('./terms');
const { ageDays, provenanceIssues, worstStatus } = require('./provenance');

function assessedIncome(months, threshold) {
  const gross = months.map((m) => Number(m.grossCents) || 0);
  const net = months.map((m) => Number(m.netCents) || 0);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const grossMean = mean(gross);
  const sd = Math.sqrt(mean(gross.map((x) => (x - grossMean) ** 2)));
  const cv = grossMean > 0 ? sd / grossMean : Infinity;
  const volatile = cv > threshold;
  return {
    grossAssessedCents: Math.round(volatile ? Math.min(...gross) : grossMean),
    netAssessedCents: Math.round(volatile ? Math.min(...net) : mean(net)),
    incomeCv: Math.round(cv * 10000) / 10000,
    volatile
  };
}

function emptyResult(status, reasonCodes, method) {
  return {
    status,
    reasonCodes,
    measures: null,
    maxAffordable: { instalmentCents: 0, amountCents: 0 },
    pdFeatures: {
      discretionaryCover: null,
      rti: null,
      dtiPost: null,
      incomeCv: null,
      incomeVerificationMethod: method || null
    }
  };
}

function assessAffordability({ income, bureau, declared, terms, flags = {} }, policy, opts = {}) {
  const { now, allowMockSources = false } = opts;
  const reasons = [];
  const statuses = [];
  const add = (status, code) => { statuses.push(status); reasons.push(code); };

  if (!income) return emptyResult('DECLINE', ['INCOME_NOT_VERIFIED'], null);

  provenanceIssues('income', income, { allowMockSources }).forEach((c) => add('REFER', c));

  const ip = policy.income;
  const method = income.method;
  let tight = !!flags.urgent || !!flags.tightened;
  if (ip.unverifiedMethods.includes(method)) {
    add('REFER', 'INCOME_SELF_DECLARED');
  } else if (ip.humanConfirmedMethods.includes(method)) {
    add('REFER', 'INCOME_MANUAL_CONFIRMATION_REQUIRED');
    tight = true;
  } else if (!ip.verifiedMethods.includes(method)) {
    add('REFER', 'INCOME_METHOD_UNRECOGNISED');
  }

  if (ageDays(income.verifiedAt, now) > policy.dataFreshnessDays.income) {
    add('DECLINE', 'INCOME_VERIFICATION_STALE');
  }

  const months = Array.isArray(income.months) ? income.months.filter(Boolean) : [];
  if (months.length < ip.minMonthsEvidence) add('REFER', 'INCOME_EVIDENCE_INSUFFICIENT');
  if (months.length === 0) return emptyResult(worstStatus(statuses), reasons, method);

  const assessed = assessedIncome(months, ip.volatilityCvThreshold);
  if (assessed.volatile) reasons.push('INCOME_VOLATILE_LOWEST_MONTH_USED');
  const { grossAssessedCents, netAssessedCents } = assessed;

  if (netAssessedCents < ip.floorNetCents) add('DECLINE', 'INCOME_BELOW_FLOOR');

  const obligationsCents = Math.max(
    Number(bureau?.monthlyObligationsCents) || 0,
    Number(declared?.obligationsCents) || 0,
    Number(income.observedDebitOrdersCents) || 0
  );
  if (!bureau) reasons.push('OBLIGATIONS_NOT_BUREAU_VERIFIED');

  const expenseNormCents = expenseNorm(grossAssessedCents, policy);
  const minimumExpensesCents = Math.max(expenseNormCents, Number(declared?.expensesCents) || 0);
  const discretionaryIncomeCents = netAssessedCents - minimumExpensesCents - obligationsCents;

  const ap = policy.affordability;
  const instalmentCents = terms.instalmentCents;
  const rti = netAssessedCents > 0 ? instalmentCents / netAssessedCents : Infinity;
  const dtiPost = grossAssessedCents > 0 ? (obligationsCents + instalmentCents) / grossAssessedCents : Infinity;
  const discretionaryCover = instalmentCents > 0
    ? Math.max(0, discretionaryIncomeCents) / instalmentCents
    : Infinity;
  const rtiCeiling = tight ? ap.rtiTightCeiling : ap.rtiCeiling;

  if (discretionaryCover < ap.minDiscretionaryCover) add('DECLINE', 'DISCRETIONARY_INCOME_INSUFFICIENT');
  if (rti > rtiCeiling) add('DECLINE', 'RTI_ABOVE_CEILING');
  if (dtiPost > ap.dtiCeiling) add('DECLINE', 'DTI_ABOVE_CEILING');

  if (rti <= rtiCeiling && rti > ap.rtiAmber) add('AMBER', 'RTI_AMBER');
  if (dtiPost <= ap.dtiCeiling && dtiPost > ap.dtiAmber) add('AMBER', 'DTI_AMBER');
  if (discretionaryCover >= ap.minDiscretionaryCover && discretionaryCover < ap.amberDiscretionaryCover) {
    add('AMBER', 'DISCRETIONARY_COVER_AMBER');
  }

  const instalmentCap = Math.max(0, Math.floor(Math.min(
    discretionaryIncomeCents / ap.minDiscretionaryCover,
    netAssessedCents * rtiCeiling,
    grossAssessedCents * ap.dtiCeiling - obligationsCents
  ) * ap.alternativeHeadroom));

  const round4 = (x) => (Number.isFinite(x) ? Math.round(x * 10000) / 10000 : x);

  return {
    status: worstStatus(statuses),
    reasonCodes: reasons,
    measures: {
      grossAssessedCents,
      netAssessedCents,
      incomeCv: assessed.incomeCv,
      expenseNormCents,
      minimumExpensesCents,
      obligationsCents,
      discretionaryIncomeCents,
      instalmentCents,
      rti,
      dtiPost,
      discretionaryCover: round4(discretionaryCover),
      rtiCeiling,
      dtiCeiling: ap.dtiCeiling
    },
    maxAffordable: {
      instalmentCents: instalmentCap,
      amountCents: maxAmountForInstalment(instalmentCap, terms.termMonths, policy, terms.pricing)
    },
    pdFeatures: {
      discretionaryCover: round4(discretionaryCover),
      rti: round4(rti),
      dtiPost: round4(dtiPost),
      incomeCv: assessed.incomeCv,
      incomeVerificationMethod: method
    }
  };
}

module.exports = { assessAffordability };
