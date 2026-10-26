'use strict';

/**
 * RESTRUCTURE OFFER SERVICE
 *
 * Builds a restructured payment schedule for a delinquent case in Mid or
 * Late Collections. Shares the hard cost-increase cap already enforced
 * post-disbursement by OutcomeGateService — one rule, one source of
 * truth, applied at both stages of the loan lifecycle.
 */

const { MAX_RESTRUCTURE_COST_INCREASE } = require('../utils/restructure-policy');

/**
 * @param {{originalOutstandingCents:number, remainingBalanceCents:number, newTermMonths:number}} params
 * @returns {{newTermMonths:number, newMonthlyAmountCents:number, costIncreaseCents:number, costIncreasePct:number, withinCap:boolean, approvable:boolean}}
 */
function buildRestructureOffer({ originalOutstandingCents, remainingBalanceCents, newTermMonths }) {
  if (!Number.isInteger(remainingBalanceCents) || remainingBalanceCents <= 0) {
    throw new Error('buildRestructureOffer requires a positive integer remainingBalanceCents');
  }
  if (!Number.isInteger(newTermMonths) || newTermMonths <= 0) {
    throw new Error('buildRestructureOffer requires a positive integer newTermMonths');
  }
  if (!Number.isInteger(originalOutstandingCents) || originalOutstandingCents <= 0) {
    throw new Error('buildRestructureOffer requires a positive integer originalOutstandingCents');
  }

  const newMonthlyAmountCents = Math.ceil(remainingBalanceCents / newTermMonths);
  const costIncreaseCents = remainingBalanceCents - originalOutstandingCents;
  const costIncreasePct = costIncreaseCents / originalOutstandingCents;
  const withinCap = costIncreasePct <= MAX_RESTRUCTURE_COST_INCREASE;

  return {
    newTermMonths,
    newMonthlyAmountCents,
    costIncreaseCents,
    costIncreasePct,
    withinCap,
    approvable: withinCap
  };
}

module.exports = {
  buildRestructureOffer,
  MAX_RESTRUCTURE_COST_INCREASE
};
