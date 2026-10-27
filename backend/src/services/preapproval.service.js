'use strict';

/**
 * KEHR PRE-APPROVAL ENGINE (Journey A, v1.21.0)
 *
 * Before treatment, a patient is assessed once and leaves with a PASS: a
 * ceiling, a maximum term, a code and an expiry. The pass converts into a
 * plan when the bill arrives. Pure: no database, no network.
 *
 * Nothing here is a shortcut. Every decision is made by the same engines
 * the rest of the platform uses:
 *   - Shield gates (shield-gates.service.js). Gates 5, 3 and 2 run now;
 *     Gates 1 and 4 need a provider and an invoice, are recorded as
 *     pending, and run in full at conversion (runShieldDecision).
 *   - Hard floors (utils/affordability-policy.js): R4,000 minimum income,
 *     55% DTI for full-procedure financing, R2,000 minimum gap. The 20%
 *     repayment-to-income ceiling (15% when urgent, manually verified, or a
 *     circuit breaker has fired) is Gate 2's own.
 *   - PD / LGD / expected loss (risk-model.js, v1.1).
 *
 * Mismatched documents send a case to a person; they never decline it.
 * Amounts are integer cents.
 */

const { runPatientGates } = require('./shield-gates.service');
const { assessRisk, MODEL_VERSIONS } = require('./risk-model');
const { HARD_FLOORS, AMBER_THRESHOLDS } = require('../utils/affordability-policy');
const { toCents } = require('../utils/money');

const TERM_LADDER = Object.freeze([12, 6, 3]);
const PASS_VALIDITY_DAYS = 90;
const REFRESH_AFTER_DAYS = 30;
const COOLING_OFF_HOURS = 48;
/** Room for a final bill a little above the estimate. */
const CEILING_HEADROOM = 0.05;
const CEILING_STEP_CENTS = 50_000; // R500
/** Marketplace limits (routes/marketplace.js): R1,000 to R500,000. */
const MIN_PLAN_CENTS = toCents(1000);
const MAX_PLAN_CENTS = toCents(500000);
/** Smaller amounts tried, in order, when the full candidate isn't approved. */
const STEP_DOWNS = Object.freeze([1, 0.75, 0.5]);

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const URGENCY_TO_GATE = { elective: 'ELECTIVE', planned: 'PLANNED', urgent: 'URGENT' };

function ceilingTarget(shortfallCents) {
  const padded = Math.floor((shortfallCents * (1 + CEILING_HEADROOM)) / CEILING_STEP_CENTS) * CEILING_STEP_CENTS;
  return Math.min(MAX_PLAN_CENTS, Math.max(shortfallCents, padded));
}

function roundDown(cents) {
  return Math.floor(cents / CEILING_STEP_CENTS) * CEILING_STEP_CENTS;
}

function gateContext(app, amountCents, termMonths) {
  return {
    application: {
      applicationId: 'preapproval',
      providerInvoiceAmount: amountCents,
      termMonths,
      segment: 'SEGMENT_2_FULL',
      procedureUrgency: URGENCY_TO_GATE[app.urgency] || 'PLANNED',
    },
    patient: {
      verifiedMonthlyIncome: app.monthlyIncomeCents,
      verifiedAt: app.incomeVerifiedAt,
      incomeVerificationMethod: app.incomeVerificationMethod,
    },
    portfolio: app.portfolio || {},
  };
}

/** Largest instalment allowed by the 55% DTI floor (full procedure only). */
function dtiInstalmentCap(app, isGap) {
  if (isGap) return Infinity;
  return Math.floor(HARD_FLOORS.maximum_dti_full_procedure * app.monthlyIncomeCents) - (app.obligationsCents || 0);
}

function tryTerm(app, termMonths, targetCents, isGap) {
  let ceilingRate = HARD_FLOORS.maximum_rti;
  let lastGate = null;
  let lastRisk = null;
  let attempts = 0;

  for (let pass = 0; pass < 2; pass += 1) {
    const byRti = Math.floor(ceilingRate * app.monthlyIncomeCents) * termMonths;
    const byDti = dtiInstalmentCap(app, isGap) * termMonths;
    const maxCandidate = Math.min(targetCents, byRti, byDti);

    for (const factor of STEP_DOWNS) {
      const amountCents = factor === 1 ? maxCandidate : roundDown(maxCandidate * factor);
      if (amountCents < MIN_PLAN_CENTS || (isGap && amountCents < toCents(HARD_FLOORS.minimum_gap_amount))) break;
      attempts += 1;

      const gate = runPatientGates(gateContext(app, amountCents, termMonths));
      lastGate = gate;
      if (gate.decision === 'DECLINED') {
        // Gate 2 may apply a tighter ceiling (urgent, manual verification,
        // circuit breaker). Re-plan once at that ceiling.
        if (gate.gate === 'GATE_2_AFFORDABILITY' && gate.affordabilityCeiling && gate.affordabilityCeiling < ceilingRate) {
          ceilingRate = gate.affordabilityCeiling;
          break;
        }
        return { termMonths, amountCents, attempts, gate, risk: null, outcome: 'declined' };
      }

      const risk = assessRisk({
        modelVersion: MODEL_VERSIONS.HARNESS,
        amountCents,
        termMonths,
        monthlyIncomeCents: app.monthlyIncomeCents,
        obligationsCents: app.obligationsCents || 0,
        ...(app.risk || {}),
      });
      lastRisk = risk;
      if (risk.decision.decision === 'approve') return { termMonths, amountCents, attempts, gate, risk, outcome: 'approve' };
      if (risk.decision.decision === 'review') return { termMonths, amountCents, attempts, gate, risk, outcome: 'review' };
      // decline: try a smaller amount
    }
    if (ceilingRate === HARD_FLOORS.maximum_rti || (lastGate && lastGate.decision !== 'DECLINED')) break;
  }

  return { termMonths, amountCents: null, attempts, gate: lastGate, risk: lastRisk, outcome: 'declined' };
}

function summariseTrace(t) {
  return {
    termMonths: t.termMonths,
    amountCents: t.amountCents,
    attempts: t.attempts,
    outcome: t.outcome,
    gate: t.gate ? { decision: t.gate.decision, gate: t.gate.gate || null, reason: t.gate.reason || null, affordabilityRatio: t.gate.affordabilityRatio ?? null, affordabilityCeiling: t.gate.affordabilityCeiling ?? null } : null,
    risk: t.risk ? { modelVersion: t.risk.modelVersion, pd: t.risk.pd.score, lgd: t.risk.lgd.score, expectedLossRate: t.risk.expectedLossRate, decision: t.risk.decision.decision, topFactors: t.risk.topFactors, defaulted: t.risk.inputsUsed.defaulted } : null,
  };
}

/**
 * @param {object} app  verified inputs (cents): monthlyIncomeCents, obligationsCents,
 *   incomeVerificationMethod, incomeVerifiedAt, estimateCents, schemeCoverCents,
 *   urgency ('elective'|'planned'|'urgent'), risk (risk-model inputs), crossCheck, portfolio
 * @param {{ now: Date }} opts
 */
function assessPreApproval(app, { now = new Date() } = {}) {
  const shortfallCents = Math.max(0, (app.estimateCents || 0) - (app.schemeCoverCents || 0));
  const isGap = (app.schemeCoverCents || 0) > 0;
  const base = { shortfallCents, modelVersion: MODEL_VERSIONS.HARNESS, gatesPending: ['GATE_1_PROVIDER', 'GATE_4_TARIFF'], assessedAt: now.toISOString() };

  if (shortfallCents === 0) return { ...base, status: 'not_needed', reasonCode: 'COVERED_IN_FULL', trace: [] };
  if (isGap && shortfallCents < toCents(HARD_FLOORS.minimum_gap_amount)) return { ...base, status: 'below_minimum', reasonCode: 'BELOW_MINIMUM_GAP', trace: [] };
  if (!(app.monthlyIncomeCents >= toCents(HARD_FLOORS.minimum_income))) return { ...base, status: 'declined', reasonCode: 'MIN_INCOME', trace: [] };
  if (app.crossCheck && app.crossCheck.consistent === false) {
    return { ...base, status: 'review', reasonCode: 'DOCUMENT_MISMATCH', flags: app.crossCheck.flags || [], trace: [] };
  }

  const target = ceilingTarget(shortfallCents);
  const tries = TERM_LADDER.map((term) => tryTerm(app, term, target, isGap));
  const trace = tries.map(summariseTrace);

  const approved = tries.filter((t) => t.outcome === 'approve').sort((a, b) => (b.amountCents - a.amountCents) || (b.termMonths - a.termMonths));
  if (approved.length > 0) {
    const best = approved[0];
    const electiveCoolingOff = app.urgency === 'elective' && best.amountCents > toCents(AMBER_THRESHOLDS.elective_cooling_off_amount);
    return {
      ...base,
      status: 'pre_approved',
      ceilingCents: best.amountCents,
      maxTermMonths: best.termMonths,
      indicativeMonthlyCents: Math.ceil(best.amountCents / best.termMonths),
      coversShortfall: best.amountCents >= shortfallCents,
      coolingOffEndsAt: electiveCoolingOff ? new Date(now.getTime() + COOLING_OFF_HOURS * 60 * 60 * 1000).toISOString() : null,
      trace,
    };
  }

  if (tries.some((t) => t.outcome === 'review')) return { ...base, status: 'review', reasonCode: 'RISK_REVIEW', trace };

  const gateDecline = tries.find((t) => t.gate && t.gate.decision === 'DECLINED');
  return { ...base, status: 'declined', reasonCode: gateDecline ? gateDecline.gate.gate : 'EXPECTED_LOSS', trace };
}

function makeCode(random) {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    if (i === 2) out += '-';
  }
  return out;
}

/**
 * @param {{ assessment, patientId, now, random? }} params  random defaults to a CSPRNG
 */
function createPass({ assessment, patientId, now = new Date(), random }) {
  if (!assessment || assessment.status !== 'pre_approved') throw new Error('A pass can only be issued for a pre-approval');
  const rnd = random || (() => require('crypto').randomInt(0, 1_000_000) / 1_000_000);
  return {
    code: makeCode(rnd),
    patientId,
    status: 'active',
    ceilingCents: assessment.ceilingCents,
    maxTermMonths: assessment.maxTermMonths,
    indicativeMonthlyCents: assessment.indicativeMonthlyCents,
    coversShortfall: assessment.coversShortfall,
    shortfallCents: assessment.shortfallCents,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PASS_VALIDITY_DAYS * DAY_MS).toISOString(),
    coolingOffEndsAt: assessment.coolingOffEndsAt || null,
    modelVersion: assessment.modelVersion,
    gatesPending: assessment.gatesPending,
  };
}

/**
 * What happens when the bill arrives. The route then runs the full Shield
 * decision (Gates 1 to 5) on the real bill before anything is agreed.
 */
function evaluateConversion({ pass, bill, now = new Date() }) {
  if (!pass || pass.status !== 'active') return { outcome: 'not_active' };
  if (now.getTime() > new Date(pass.expiresAt).getTime()) return { outcome: 'expired' };
  if (pass.coolingOffEndsAt && now.getTime() < new Date(pass.coolingOffEndsAt).getTime()) return { outcome: 'cooling_off', until: pass.coolingOffEndsAt };
  if (!bill || !bill.procedureMatches) return { outcome: 'reassess' };
  if (bill.amountCents > pass.ceilingCents) return { outcome: 'reassess_difference', deltaCents: bill.amountCents - pass.ceilingCents };
  return {
    outcome: 'convert',
    amountCents: bill.amountCents,
    requiresRefresh: now.getTime() - new Date(pass.issuedAt).getTime() > REFRESH_AFTER_DAYS * DAY_MS,
    termOptions: [3, 6, 12].filter((t) => t <= pass.maxTermMonths),
  };
}

/** The patient sees the outcome only (v1.19): no scores, gates or reasons. */
function patientPreapprovalView({ assessment, pass }) {
  switch (assessment && assessment.status) {
    case 'pre_approved':
      return {
        status: 'pre_approved',
        ceilingCents: assessment.ceilingCents,
        maxTermMonths: assessment.maxTermMonths,
        indicativeMonthlyCents: assessment.indicativeMonthlyCents,
        coversShortfall: assessment.coversShortfall,
        code: pass ? pass.code : null,
        expiresAt: pass ? pass.expiresAt : null,
        coolingOffEndsAt: assessment.coolingOffEndsAt || null,
        message: "You're pre-approved.",
      };
    case 'review':
      return { status: 'checking', message: "We're checking a few details. We'll let you know here." };
    case 'not_needed':
      return { status: 'not_needed', message: 'Your medical aid covers this in full.' };
    case 'below_minimum':
      return { status: 'below_minimum', message: 'The amount left to pay is small enough to settle with your provider directly.' };
    default:
      return { status: 'not_available', message: "We can't pre-approve this right now.", canRequestReview: true };
  }
}

/** The provider sees only what it needs to book. */
function providerPassView(pass) {
  return { code: pass.code, status: pass.status, ceilingCents: pass.ceilingCents, expiresAt: pass.expiresAt };
}

module.exports = {
  TERM_LADDER,
  PASS_VALIDITY_DAYS,
  REFRESH_AFTER_DAYS,
  CEILING_HEADROOM,
  ceilingTarget,
  assessPreApproval,
  createPass,
  evaluateConversion,
  patientPreapprovalView,
  providerPassView,
};
