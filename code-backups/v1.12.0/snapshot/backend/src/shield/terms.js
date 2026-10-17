/**
 * Shield Underwriting — arrangement terms.
 *
 * The instalment used for affordability ALWAYS includes every patient-facing
 * charge: cost of credit, monthly service fee and any financed initiation fee.
 */

'use strict';

function amortisedPayment(principalCents, termMonths, annualRate) {
  if (!annualRate) return principalCents / termMonths;
  const r = annualRate / 12;
  const f = Math.pow(1 + r, termMonths);
  return (principalCents * r * f) / (f - 1);
}

function resolvePricing(pricing, policy) {
  return { ...policy.pricing, ...(pricing || {}) };
}

function computeTerms({ amountCents, termMonths, pricing }, policy) {
  const p = resolvePricing(pricing, policy);
  const amount = Math.max(0, Math.round(amountCents || 0));
  const term = Math.max(1, Math.round(termMonths || 1));
  const financedCents = amount + p.initiationFeeCents;
  const amortised = amortisedPayment(financedCents, term, p.patientAnnualRate);
  const instalmentCents = Math.ceil(amortised) + p.monthlyServiceFeeCents;
  const totalRepayableCents = instalmentCents * term;
  const costOfCreditCents = Math.max(0, totalRepayableCents - amount);
  const mdrCents = Math.round(amount * (p.mdrPercent / 100));

  return {
    facilitationAmountCents: amount,
    termMonths: term,
    financedCents,
    instalmentCents,
    totalRepayableCents,
    costOfCreditCents,
    mdrCents,
    revenueCents: mdrCents + costOfCreditCents,
    pricing: p
  };
}

/** Largest facilitation amount whose all-in instalment fits `instalmentCents`. */
function maxAmountForInstalment(instalmentCents, termMonths, policy, pricing) {
  const p = resolvePricing(pricing, policy);
  const available = instalmentCents - p.monthlyServiceFeeCents;
  if (available <= 0) return 0;
  let financed;
  if (!p.patientAnnualRate) {
    financed = available * termMonths;
  } else {
    const r = p.patientAnnualRate / 12;
    const f = Math.pow(1 + r, termMonths);
    financed = (available * (f - 1)) / (r * f);
  }
  return Math.max(0, Math.floor(financed - p.initiationFeeCents));
}

module.exports = { computeTerms, maxAmountForInstalment };
