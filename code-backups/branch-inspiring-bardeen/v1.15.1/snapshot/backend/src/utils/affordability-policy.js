'use strict';

/**
 * Shared affordability policy — single source of truth for
 * PatientGateService (Shield Gate 2 underwriting, patient-gate.service.js)
 * and the Care Agent (care-agent.service.js). Pure constants, no side
 * effects, no database dependency — safe to import from anywhere,
 * including plain `node --test` unit tests that don't have a database
 * driver installed.
 *
 * Extracted out of patient-gate.service.js so callers that only need the
 * thresholds (not the underwriting engine itself) don't have to pull in
 * config/database.js, mirroring the existing utils/restructure-policy.js
 * pattern shared between outcome-gate.service.js and
 * restructure-offer.service.js.
 */

const HARD_FLOORS = {
  minimum_income: 4000,              // R4,000 — protects vulnerable populations
  maximum_rti: 0.20,                 // 20% repayment-to-income ceiling
  maximum_dti_full_procedure: 0.55,  // 55% DTI for full-procedure financing
  minimum_gap_amount: 2000,          // R2,000 minimum gap financing (below = suggest cash)
  maximum_restructure_cost_increase: 0.25  // 25% max cost increase on restructuring
};

const AMBER_THRESHOLDS = {
  rti_comfort_zone: 0.15,            // 15% — above this is amber
  dti_review_threshold: 0.45,        // 45% — above this is amber
  elective_cooling_off_amount: 15000 // R15,000 — above this triggers 48hr cooling off
};

module.exports = {
  HARD_FLOORS,
  AMBER_THRESHOLDS
};
