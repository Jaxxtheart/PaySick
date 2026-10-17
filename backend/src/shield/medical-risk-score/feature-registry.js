/**
 * PaySick Medical Risk Score — Feature Registry.
 *
 * The registry is the governance backbone of the MRS. Every signal PaySick
 * collects is declared here with its pillar, data source and status:
 *
 *   DECISIONING  may be used by a champion or challenger PD model
 *   SHADOW       captured on every decision for research and future models,
 *                but never used in a decision until promoted through review
 *   PROHIBITED   may never be captured into the feature vector or used —
 *                health-condition data and protected attributes
 *
 * Promoting a SHADOW feature to DECISIONING is a policy change: it needs a
 * fairness review and a new registry version. PROHIBITED is permanent.
 */

'use strict';

const REGISTRY_VERSION = 'MRS-FR-2026.10.0';

const STATUSES = Object.freeze(['DECISIONING', 'SHADOW', 'PROHIBITED']);

const PILLARS = Object.freeze([
  'CREDIT_FOUNDATION',            // bureau behaviour — the anchor
  'AFFORDABILITY_CAPACITY',       // headroom from the affordability assessment
  'CLINICAL_RISK',                // MRS Pillar 1 — procedure, urgency, planning
  'INSURANCE_COORDINATION',       // MRS Pillar 2 — scheme benefit certainty, tariff
  'HEALTHCARE_PAYMENT_BEHAVIOUR', // MRS Pillar 3 — PaySick repayment history
  'PROVIDER_QUALITY',             // provider performance (from provider risk)
  'ARRANGEMENT_STRUCTURE',        // term
  'BEHAVIOURAL',                  // application telemetry — shadow only
  'PROTECTED'                     // prohibited
]);

const D = (key, pillar, source, description) =>
  ({ key, pillar, source, description, status: 'DECISIONING', feedsPd: true });
const S = (key, pillar, source, description) =>
  ({ key, pillar, source, description, status: 'SHADOW', feedsPd: false });
const P = (key, description) =>
  ({ key, pillar: 'PROTECTED', source: 'NOT_COLLECTED', description, status: 'PROHIBITED', feedsPd: false });

const FEATURES = [
  // ── Credit foundation ──
  D('bureauScore', 'CREDIT_FOUNDATION', 'credit bureau', 'Bureau risk score normalised to 0–999'),
  D('bureauThinFile', 'CREDIT_FOUNDATION', 'credit bureau', 'Insufficient bureau history to score reliably'),
  D('bureauEnquiries90d', 'CREDIT_FOUNDATION', 'credit bureau', 'Credit enquiries in the last 90 days'),
  D('bureauWorstArrears12m', 'CREDIT_FOUNDATION', 'credit bureau', 'Worst arrears cycles on any account in 12 months'),
  D('bureauRevolvingUtilisation', 'CREDIT_FOUNDATION', 'credit bureau', 'Revolving balance ÷ revolving limit'),

  // ── Affordability capacity (computed by the affordability stage) ──
  D('discretionaryCover', 'AFFORDABILITY_CAPACITY', 'affordability assessment', 'Discretionary income ÷ all-in instalment'),
  D('rti', 'AFFORDABILITY_CAPACITY', 'affordability assessment', 'All-in instalment ÷ assessed net income'),
  D('incomeCv', 'AFFORDABILITY_CAPACITY', 'affordability assessment', 'Coefficient of variation of monthly gross income'),
  D('incomeVerificationMethod', 'AFFORDABILITY_CAPACITY', 'affordability assessment', 'Strength of income evidence'),
  S('dtiPost', 'AFFORDABILITY_CAPACITY', 'affordability assessment', 'Post-arrangement DTI — regulatory gate; captured, not double-counted in PD'),

  // ── Pillar 1: clinical risk signal ──
  D('procedureCategory', 'CLINICAL_RISK', 'application', 'Procedure category (Elective Four + others) — outcome-dispute and repudiation risk prior'),
  D('urgency', 'CLINICAL_RISK', 'application', 'Clinical urgency classification'),
  D('bookingLeadDays', 'CLINICAL_RISK', 'application', 'Days between booking and procedure — planning signal'),

  // ── Pillar 2: insurance coordination ──
  D('segment', 'INSURANCE_COORDINATION', 'application', 'Self-pay or gap arrangement'),
  D('schemeMembershipVerified', 'INSURANCE_COORDINATION', 'scheme verification', 'Scheme membership and benefit verified with the scheme'),
  D('tariffRatio', 'INSURANCE_COORDINATION', 'benchmark table', 'Provider invoice ÷ procedure benchmark (gap certainty)'),

  // ── Pillar 3: healthcare payment behaviour ──
  D('internalCompletedArrangements', 'HEALTHCARE_PAYMENT_BEHAVIOUR', 'PaySick ledger', 'Arrangements completed with PaySick'),
  D('internalOnTimeRatio', 'HEALTHCARE_PAYMENT_BEHAVIOUR', 'PaySick ledger', 'Share of PaySick instalments collected on time'),

  // ── Provider quality (computed by the provider risk stage) ──
  D('providerGrade', 'PROVIDER_QUALITY', 'provider risk management', 'Provider risk grade P1–P4'),
  D('providerMissedRateCredible', 'PROVIDER_QUALITY', 'provider risk management', 'Credibility-weighted provider missed-payment rate'),
  D('providerDisputeRate', 'PROVIDER_QUALITY', 'provider risk management', 'Share of provider arrangements disputed'),

  // ── Arrangement structure ──
  D('termMonths', 'ARRANGEMENT_STRUCTURE', 'application', 'Arrangement term in months'),

  // ── Behavioural telemetry — shadow only (fraud lens, fairness review pending) ──
  S('applicationHour', 'BEHAVIOURAL', 'application telemetry', 'Hour of day the application was submitted'),
  S('deviceType', 'BEHAVIOURAL', 'application telemetry', 'Device class used to apply'),
  S('completionSeconds', 'BEHAVIOURAL', 'application telemetry', 'Time taken to complete the application'),

  // ── Prohibited — health-condition data and protected attributes ──
  P('chronicMedicationAdherence', 'Health-condition data (POPIA special personal information); unfair discrimination risk'),
  P('medicalAidClaimsHistory', 'Scheme claims data — health information, not obtainable for credit purposes'),
  P('diagnosisCodes', 'Diagnosis data — health information'),
  P('icd10Diagnosis', 'Diagnosis data — health information'),
  P('schemeBrand', 'Scheme brand is not a lawful or meaningful risk driver'),
  P('hivStatus', 'Health-condition data'),
  P('pregnancyStatus', 'Protected attribute'),
  P('disabilityStatus', 'Protected attribute'),
  P('race', 'Protected attribute'),
  P('gender', 'Protected attribute'),
  P('sex', 'Protected attribute'),
  P('religion', 'Protected attribute'),
  P('maritalStatus', 'Protected attribute'),
  P('age', 'Protected attribute — excluded from scoring'),
  P('dateOfBirth', 'Protected attribute proxy'),
  P('language', 'Protected attribute proxy')
].map((f) => Object.freeze(f));

Object.freeze(FEATURES);

const BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));

const PROHIBITED_KEYS = Object.freeze(FEATURES.filter((f) => f.status === 'PROHIBITED').map((f) => f.key));

function getFeature(key) {
  return BY_KEY.get(key) || null;
}

function featuresByStatus(status) {
  return FEATURES.filter((f) => f.status === status);
}

function featuresFeedingPd() {
  return FEATURES.filter((f) => f.feedsPd);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Deep-remove prohibited keys. Returns the cleaned copy and dotted paths removed. */
function stripProhibited(obj, prefix = '') {
  const removed = [];
  if (!isPlainObject(obj)) return { clean: obj, removed };
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (PROHIBITED_KEYS.includes(k)) {
      removed.push(path);
      continue;
    }
    if (isPlainObject(v)) {
      const inner = stripProhibited(v, path);
      clean[k] = inner.clean;
      removed.push(...inner.removed);
    } else {
      clean[k] = v;
    }
  }
  return { clean, removed };
}

module.exports = {
  REGISTRY_VERSION,
  STATUSES,
  PILLARS,
  FEATURES,
  PROHIBITED_KEYS,
  getFeature,
  featuresByStatus,
  featuresFeedingPd,
  stripProhibited
};
