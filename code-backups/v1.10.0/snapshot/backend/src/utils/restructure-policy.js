'use strict';

/**
 * Shared restructuring policy — single source of truth for both
 * OutcomeGateService (post-disbursement outcome monitoring, outcome-gate.service.js)
 * and RestructureOfferService (Recovery Engine collections restructuring,
 * restructure-offer.service.js). Pure constant, no side effects, no
 * database dependency — safe to import from anywhere.
 *
 * Hard rule: no restructuring may increase total cost to the patient by
 * more than 25%, at any stage of the loan lifecycle.
 */

const MAX_RESTRUCTURE_COST_INCREASE = 0.25;

module.exports = {
  MAX_RESTRUCTURE_COST_INCREASE
};
