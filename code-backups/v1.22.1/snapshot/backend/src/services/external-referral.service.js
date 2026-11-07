'use strict';

/**
 * EXTERNAL REFERRAL SERVICE
 *
 * The rarest, most expensive lever in the recovery ladder — handing a
 * case to a registered debt collector or attorney. Reserved for the
 * small tail of cases where the outstanding balance justifies external
 * cost, and always requires an explicit human approval; it is never
 * triggered automatically by the engine.
 */

const { referCase } = require('../adapters/debt-collector.adapter');

// Below this balance, an external agency or attorney's fee is assumed to
// exceed the recoverable value — proportionality for a book with a
// ≤R850 average facility. (R500 floor, in cents.)
const MIN_REFERRAL_BALANCE_CENTS = 50000;

// Matches the Recovery Engine's resolution threshold (recovery-engine.service.js).
const MIN_DAYS_OVERDUE_FOR_REFERRAL = 90;

/**
 * @param {{daysOverdue:number, outstandingAmountCents:number, humanApproved:boolean}} params
 * @returns {{eligible:boolean, reason:string|null}}
 */
function isEligibleForReferral({ daysOverdue, outstandingAmountCents, humanApproved }) {
  if (!humanApproved) {
    return { eligible: false, reason: 'requires_human_approval' };
  }
  if (daysOverdue < MIN_DAYS_OVERDUE_FOR_REFERRAL) {
    return { eligible: false, reason: 'not_yet_late_stage' };
  }
  if (outstandingAmountCents < MIN_REFERRAL_BALANCE_CENTS) {
    return { eligible: false, reason: 'balance_too_small_to_justify_cost' };
  }
  return { eligible: true, reason: null };
}

/**
 * @param {{caseId:string, partnerType:string, daysOverdue:number, outstandingAmountCents:number, humanApprovedBy:string|null}} params
 */
async function referIfEligible({ caseId, partnerType, daysOverdue, outstandingAmountCents, humanApprovedBy }) {
  const eligibility = isEligibleForReferral({
    daysOverdue,
    outstandingAmountCents,
    humanApproved: Boolean(humanApprovedBy)
  });

  if (!eligibility.eligible) {
    return { referred: false, ...eligibility };
  }

  const result = await referCase({ caseId, partnerType, outstandingAmountCents, humanApprovedBy });
  return { referred: true, ...result };
}

module.exports = {
  isEligibleForReferral,
  referIfEligible,
  MIN_REFERRAL_BALANCE_CENTS,
  MIN_DAYS_OVERDUE_FOR_REFERRAL
};
