/**
 * CARE AGENT — ORCHESTRATION SERVICE
 *
 * Pure, DB-free logic for the Care Agent's "Understand" and "Construct"
 * stages: merging what's been extracted/confirmed into a running summary,
 * deciding what's still missing, choosing the next progressive question,
 * and building payment-term options.
 *
 * Architecture principle: "AI reasons, PaySick controls." This module never
 * invents an affordability threshold or an interest rate of its own — the
 * zero-interest policy comes from fee.service.js (patients pay 0% interest;
 * PaySick charges providers a service fee) and the "would create monthly
 * pressure" comfort-zone threshold is imported directly from
 * utils/affordability-policy.js's AMBER_THRESHOLDS, the same constant
 * patient-gate.service.js's Shield Gate 2 uses to flag affordability risk.
 * Final APPROVE/DECLINE/REFER_TO_HUMAN recommendations remain
 * patientGateService's job (see routes/care-agent.js) — this module only
 * decides which term options are worth presenting and whether to caption
 * them with a pressure warning. Deliberately imports the pure policy
 * constants module rather than patient-gate.service.js itself, so this
 * file stays free of a database dependency (see restructure-policy.js for
 * the same pattern elsewhere in this codebase).
 */

'use strict';

const { AMBER_THRESHOLDS } = require('../utils/affordability-policy');

/** Required before a care summary can be confirmed and moved to Construct. */
const REQUIRED_SUMMARY_FIELDS = ['treatmentDescription', 'quotedAmountCents', 'schemeContributionCents'];

/** Term lengths (months) the Care Agent offers — all zero-interest, per fee.service.js policy. */
const TERM_OPTIONS_MONTHS = [3, 6, 12];

/**
 * Same order nextQuestion() asks in (amount, then treatment, then scheme
 * contribution). Used to work out which single field the just-asked
 * question was actually about, from the set missingFieldsFor() returns.
 */
const MISSING_FIELD_PRIORITY = ['quotedAmountCents', 'treatmentDescription', 'schemeContributionCents'];

/** treatmentDescription renders in an editable summary-card field — cap a
 * raw-text fallback so a long ramble doesn't become an unreadable value. */
const MAX_TREATMENT_FALLBACK_LENGTH = 200;

/**
 * Merges newly extracted/edited fields into the running care summary.
 * A field already present in the summary (patient-confirmed or previously
 * filled) always wins — extraction only ever fills blanks, never overwrites.
 * `null`/`undefined` extracted values ("not found") are never recorded, so
 * a later extraction attempt can still fill that field in.
 *
 * @param {object} existing
 * @param {object} extracted
 * @param {string} [rawMessage] The patient's raw message text for this turn.
 * @returns {object}
 */
function mergeCareSummary(existing, extracted, rawMessage) {
  const merged = { ...existing };
  for (const key of Object.keys(extracted || {})) {
    const value = extracted[key];
    if (value === null || value === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(merged, key)) continue;
    merged[key] = value;
  }

  // BUG FIX: the finite keyword dictionary in care-agent-nlp.service.js
  // can't recognize everything a patient types ("nose job", "aesthetic",
  // etc.), so extraction legitimately finds nothing sometimes. Before this
  // fallback, that meant treatmentDescription stayed missing forever and
  // nextQuestion() re-asked the identical question every turn, with no way
  // for the patient to escape. Falling back to their raw text guarantees
  // forward progress, but only for the field the just-asked question was
  // actually about (computed from missingFieldsFor(existing), in the same
  // priority nextQuestion() uses) — otherwise an unrecognized reply to the
  // amount or scheme question would get misfiled as the treatment
  // description. It never invents a procedureTypeGuess; that stays
  // whatever extraction actually found.
  if (rawMessage && !Object.prototype.hasOwnProperty.call(merged, 'treatmentDescription')) {
    const missingBefore = missingFieldsFor(existing);
    const topPriorityField = MISSING_FIELD_PRIORITY.find((field) => missingBefore.includes(field));
    if (topPriorityField === 'treatmentDescription') {
      const trimmed = String(rawMessage).trim();
      if (trimmed) {
        merged.treatmentDescription =
          trimmed.length > MAX_TREATMENT_FALLBACK_LENGTH
            ? `${trimmed.slice(0, MAX_TREATMENT_FALLBACK_LENGTH).trim()}...`
            : trimmed;
      }
    }
  }

  return merged;
}

/**
 * A field counts as "known" once it has been extracted, stated, or
 * explicitly confirmed as zero/none — not merely guessed. For
 * schemeContributionCents in particular, 0 is a valid, confirmed answer
 * ("not covered") and must not be treated as missing.
 *
 * @param {object} summary
 * @returns {string[]}
 */
function missingFieldsFor(summary) {
  const missing = [];
  if (!summary.treatmentDescription) missing.push('treatmentDescription');
  if (summary.quotedAmountCents === undefined || summary.quotedAmountCents === null) {
    missing.push('quotedAmountCents');
  }
  if (!('schemeContributionCents' in summary)) missing.push('schemeContributionCents');
  return missing;
}

/**
 * Picks the single next question to ask, in the same order the product
 * spec's example conversation follows: amount, then treatment, then
 * medical-aid submission status. Returns null once nothing is missing —
 * the caller should then present the editable summary for Confirm/Edit.
 *
 * @param {object} summary
 * @returns {string|null}
 */
function nextQuestion(summary) {
  const missing = missingFieldsFor(summary);

  if (missing.includes('quotedAmountCents')) {
    return "Upload the quote if you have it, or tell me the quoted amount, and I'll use it to work out the likely shortfall.";
  }
  if (missing.includes('treatmentDescription')) {
    return 'What treatment or procedure is this for?';
  }
  if (missing.includes('schemeContributionCents')) {
    return "Do you know whether this has already been submitted to your medical aid or scheme, and if so, what they said they'll cover?";
  }
  return null;
}

/**
 * Shortfall is only ever computed from confirmed figures — never
 * estimated. Both the quoted amount and the scheme contribution (which may
 * be legitimately 0) must be known.
 *
 * @param {object} summary
 * @returns {number|null} shortfall in cents, or null if not yet computable
 */
function computeShortfallCents(summary) {
  if (summary.quotedAmountCents === undefined || summary.quotedAmountCents === null) return null;
  if (!('schemeContributionCents' in summary)) return null;
  return summary.quotedAmountCents - summary.schemeContributionCents;
}

/**
 * Builds zero-interest payment-term options for the given shortfall.
 * Each instalment is rounded UP so the plan never under-collects (same
 * rounding rule as restructure-offer.service.js's buildRestructureOffer).
 *
 * When monthlyIncomeCents is known, each option is captioned with whether
 * it would breach patient-gate.service's affordability comfort zone — the
 * same threshold Shield Gate 2 itself uses — so the patient sees the same
 * "this would create monthly pressure" signal a human underwriter would.
 * This is advisory only: it never blocks an option, and the authoritative
 * approve/decline/refer decision still comes from patientGateService at
 * Construct/Approve time.
 *
 * @param {{ shortfallCents: number, monthlyIncomeCents?: number }} params
 * @returns {Array<{ termMonths: number, monthlyPaymentCents: number, totalCostCents: number, affordabilityRatio: number|null, pressureWarning: boolean }>}
 */
function buildTermOptions({ shortfallCents, monthlyIncomeCents }) {
  return TERM_OPTIONS_MONTHS.map((termMonths) => {
    const monthlyPaymentCents = Math.ceil(shortfallCents / termMonths);
    const totalCostCents = monthlyPaymentCents * termMonths;
    const affordabilityRatio = monthlyIncomeCents
      ? monthlyPaymentCents / monthlyIncomeCents
      : null;
    const pressureWarning = affordabilityRatio !== null && affordabilityRatio > AMBER_THRESHOLDS.rti_comfort_zone;

    return { termMonths, monthlyPaymentCents, totalCostCents, affordabilityRatio, pressureWarning };
  });
}

module.exports = {
  REQUIRED_SUMMARY_FIELDS,
  TERM_OPTIONS_MONTHS,
  mergeCareSummary,
  missingFieldsFor,
  nextQuestion,
  computeShortfallCents,
  buildTermOptions,
};
