/**
 * Shield Framework — 5-gate underwriting decision engine.
 *
 * Pure function. Takes an in-memory context (already prepared by the route
 * layer from the DB) and returns the decision. Side effects — DB writes,
 * webhook firing, audit logging — happen in the caller.
 *
 * Order of evaluation matters: a failure at any gate stops processing
 * immediately and returns the first failure reason.
 *
 *   Gate 1: Provider Gate
 *   Gate 2: Patient Affordability Gate
 *   Gate 3: Urgency & Cooling-Off Gate
 *   Gate 4: Tariff Control Gate (Segment 1 only)
 *   Gate 5: Portfolio Circuit Breakers
 *
 * Language: prohibited terms (loan, lend, borrower, default, interest)
 * must never appear in any returned field, including reason strings.
 */

'use strict';

const { calculateMdr, affordabilityRatio } = require('../utils/money');

const PROVIDER_GATE = 'GATE_1_PROVIDER';
const AFFORDABILITY_GATE = 'GATE_2_AFFORDABILITY';
const URGENCY_GATE = 'GATE_3_URGENCY';
const TARIFF_GATE = 'GATE_4_TARIFF';
const CIRCUIT_GATE = 'GATE_5_CIRCUIT_BREAKER';

const COOLING_OFF_AMOUNT_CENTS = 1_500_000; // R15,000
const COOLING_OFF_DURATION_MS = 48 * 60 * 60 * 1000;
const INCOME_FRESHNESS_DAYS = 90;
const TARIFF_HOLD_MULTIPLE = 1.30;

function declined(gate, reason, extra = {}) {
  return { decision: 'DECLINED', gate, reason, ...extra };
}

function manualReview(gate, reason, extra = {}) {
  return { decision: 'MANUAL_REVIEW', gate, reason, ...extra };
}

/**
 * Compute facilitation amount and provisional terms before running gates.
 * For Segment 1: ceiling derived from benchmark × (1 - coverage).
 * For Segment 2: full provider invoice amount.
 */
function computeTerms(ctx) {
  const { application, segment1, feePercent = 5 } = ctx;
  const isSegment1 = application.segment === 'SEGMENT_1_GAP';

  let facilitationAmount;
  let tariffMultipleApplied = null;

  if (isSegment1) {
    const benchmark = segment1?.benchmarkProcedureCost || 0;
    const coverage = segment1?.patientPlanCoveragePercent ?? 0;
    facilitationAmount = Math.max(0, Math.round(benchmark * (1 - coverage)));
    if (benchmark > 0) {
      tariffMultipleApplied = application.providerInvoiceAmount / benchmark;
    }
  } else {
    facilitationAmount = application.providerInvoiceAmount;
  }

  const monthlyInstalment = Math.ceil(facilitationAmount / application.termMonths);
  const facilitationFeeTotal = calculateMdr(facilitationAmount, feePercent);
  const mdrAmount = calculateMdr(facilitationAmount, feePercent);

  return {
    facilitationAmount,
    monthlyInstalment,
    facilitationFeeTotal,
    mdrAmount,
    disbursementAmount: facilitationAmount,
    tariffMultipleApplied
  };
}

function gate1Provider(ctx, terms) {
  const p = ctx.provider || {};
  const isSegment1 = ctx.application.segment === 'SEGMENT_1_GAP';

  if (p.status !== 'ACTIVE' && p.status !== 'DEVELOPING') {
    return declined(PROVIDER_GATE, `Provider status is ${p.status || 'UNKNOWN'}`);
  }
  if (isSegment1 && !p.billingAgreementSigned) {
    return declined(PROVIDER_GATE, 'Provider has not signed billing agreement');
  }
  if ((p.bookSharePercent ?? 0) >= 0.05) {
    return declined(PROVIDER_GATE, 'Provider share of book exceeds 5% concentration limit');
  }
  if ((p.procedureTypeSharePercent ?? 0) >= 0.20) {
    return declined(PROVIDER_GATE, 'Procedure type concentration above 20% threshold');
  }
  if (isSegment1) {
    const benchmark = ctx.segment1?.benchmarkProcedureCost || 0;
    if (benchmark > 0 && ctx.application.providerInvoiceAmount > benchmark * TARIFF_HOLD_MULTIPLE) {
      // Note: tariff over-30% manual review is enforced in Gate 4, not here.
      // Gate 1 only catches provider-level concentration failures.
    }
  }
  return null;
}

function gate2Affordability(ctx, terms, options) {
  const patient = ctx.patient || {};
  if (!patient.verifiedMonthlyIncome) {
    return declined(AFFORDABILITY_GATE, 'No verified income on file');
  }
  if (!patient.verifiedAt) {
    return declined(AFFORDABILITY_GATE, 'Income verification missing timestamp');
  }
  const ageMs = Date.now() - new Date(patient.verifiedAt).getTime();
  if (ageMs > INCOME_FRESHNESS_DAYS * 24 * 60 * 60 * 1000) {
    return declined(AFFORDABILITY_GATE, 'Income verification is older than 90 days');
  }

  let ceiling = 0.20;
  if (patient.incomeVerificationMethod === 'MANUAL_REVIEW') ceiling = 0.15;
  if (options.urgent) ceiling = Math.min(ceiling, 0.15);
  if (options.tightenedByCircuitBreaker) ceiling = Math.min(ceiling, 0.15);

  const ratio = affordabilityRatio(terms.monthlyInstalment, patient.verifiedMonthlyIncome);
  if (ratio > ceiling) {
    return declined(
      AFFORDABILITY_GATE,
      'Instalment exceeds verified monthly income ceiling',
      { affordabilityRatio: ratio, affordabilityCeiling: ceiling }
    );
  }
  return { affordabilityRatio: ratio, affordabilityCeiling: ceiling };
}

function gate3Urgency(ctx, terms) {
  const urgency = ctx.application.procedureUrgency;
  if (urgency === 'ELECTIVE' && terms.facilitationAmount > COOLING_OFF_AMOUNT_CENTS) {
    const expiresAt = new Date(Date.now() + COOLING_OFF_DURATION_MS).toISOString();
    return { coolingOffRequired: true, coolingOffExpiresAt: expiresAt };
  }
  return { coolingOffRequired: false };
}

function gate4Tariff(ctx, terms) {
  if (ctx.application.segment !== 'SEGMENT_1_GAP') return null;
  const seg = ctx.segment1 || {};
  const benchmark = seg.benchmarkProcedureCost || 0;
  const invoice = ctx.application.providerInvoiceAmount;

  const result = {
    dspWarningRequired: !seg.dspIsOnList,
    tariffDisclosureRequired: true
  };

  if (benchmark > 0 && invoice > benchmark * TARIFF_HOLD_MULTIPLE) {
    return manualReview(
      TARIFF_GATE,
      'Provider invoice exceeds benchmark tariff by more than 30%',
      result
    );
  }
  return result;
}

function gate5CircuitBreakers(ctx) {
  const pf = ctx.portfolio || {};
  const provider = ctx.provider || {};
  const fired = [];

  if ((provider.patientPdRate ?? 0) > 0.08) {
    return declined(
      CIRCUIT_GATE,
      'Provider 90-day missed-payment rate exceeds 8%',
      { circuitBreaker: 'PROVIDER_PD_RATE', circuitBreakersFired: ['PROVIDER_PD_RATE'] }
    );
  }
  if ((pf.balanceSheetPercent ?? 0) > 0.40) {
    return declined(
      CIRCUIT_GATE,
      'Balance sheet exposure exceeds 40% — new originations routed to marketplace only',
      { circuitBreaker: 'BALANCE_SHEET', circuitBreakersFired: ['BALANCE_SHEET'] }
    );
  }

  let tightenedByCircuitBreaker = false;
  if ((pf.arrearsRate ?? 0) > 0.06) {
    fired.push('PORTFOLIO_ARREARS');
    tightenedByCircuitBreaker = true;
  }
  if ((pf.segment1TariffFlaggedRate ?? 0) > 0.10) {
    fired.push('TARIFF_INFLATION');
  }
  if ((pf.reserveFundBalance ?? 0) < (pf.monthlyFeeIncome ?? 0) * 0.15) {
    fired.push('RESERVE_FUND');
  }

  return { circuitBreakersFired: fired, tightenedByCircuitBreaker };
}

function runShieldDecision(ctx) {
  const terms = computeTerms(ctx);

  // Gate 5 partial — short-circuit declines must run first to catch
  // provider-PD and balance-sheet hard stops.
  const cb = gate5CircuitBreakers(ctx);
  if (cb.decision === 'DECLINED') {
    return { ...cb, ...termsForResponse(ctx, terms) };
  }

  // Gate 1
  const g1 = gate1Provider(ctx, terms);
  if (g1) return { ...g1, ...termsForResponse(ctx, terms) };

  // Gate 3 first so URGENT applies its tighter ceiling to Gate 2
  const g3 = gate3Urgency(ctx, terms);

  // Gate 2
  const g2 = gate2Affordability(ctx, terms, {
    urgent: ctx.application.procedureUrgency === 'URGENT',
    tightenedByCircuitBreaker: cb.tightenedByCircuitBreaker
  });
  if (g2.decision === 'DECLINED') {
    return { ...g2, ...termsForResponse(ctx, terms), circuitBreakersFired: cb.circuitBreakersFired };
  }

  // Gate 4
  const g4 = gate4Tariff(ctx, terms);
  if (g4 && g4.decision === 'MANUAL_REVIEW') {
    return {
      ...g4,
      ...termsForResponse(ctx, terms),
      affordabilityRatio: g2.affordabilityRatio,
      affordabilityCeiling: g2.affordabilityCeiling,
      circuitBreakersFired: cb.circuitBreakersFired
    };
  }

  // Final assembly
  const out = {
    decision: g3.coolingOffRequired ? 'COOLING_OFF' : 'APPROVED',
    ...termsForResponse(ctx, terms),
    affordabilityRatio: g2.affordabilityRatio,
    affordabilityCeiling: g2.affordabilityCeiling,
    coolingOffRequired: g3.coolingOffRequired,
    coolingOffExpiresAt: g3.coolingOffExpiresAt,
    circuitBreakersFired: cb.circuitBreakersFired
  };
  if (g4) {
    out.dspWarningRequired = g4.dspWarningRequired;
    out.tariffDisclosureRequired = g4.tariffDisclosureRequired;
  }
  return out;
}

function termsForResponse(ctx, terms) {
  return {
    applicationId: ctx.application.applicationId,
    monthlyInstalment: terms.monthlyInstalment,
    termMonths: ctx.application.termMonths,
    facilitationFeeTotal: terms.facilitationFeeTotal,
    disbursementAmount: terms.disbursementAmount,
    mdrAmount: terms.mdrAmount,
    tariffMultipleApplied: terms.tariffMultipleApplied
  };
}

module.exports = {
  runShieldDecision,
  computeTerms,
  // exposed for unit testing
  _gates: {
    gate1Provider,
    gate2Affordability,
    gate3Urgency,
    gate4Tariff,
    gate5CircuitBreakers
  }
};
