/**
 * Shield Underwriting — Knock-out rules.
 *
 * Run before scoring. An adverse hit is a hard DECLINE that neither the
 * Medical Risk Score nor a human reviewer can override. Missing, mock or
 * stale data is REFER — the gate never passes on absent evidence.
 */

'use strict';

const { ageDays, provenanceIssues, worstStatus } = require('./provenance');

function evaluateKnockouts({ identity, fraud, bureau, bankAccount }, policy, opts = {}) {
  const { now, allowMockSources = false } = opts;
  const reasons = [];
  const statuses = [];
  let hard = false;
  const decline = (code) => { statuses.push('DECLINE'); reasons.push(code); hard = true; };
  const refer = (code) => { statuses.push('REFER'); reasons.push(code); };

  const blocks = { identity, fraud, bureau, bankAccount };
  for (const [name, block] of Object.entries(blocks)) {
    provenanceIssues(name, block, { allowMockSources }).forEach(refer);
  }

  if (identity) {
    if (!identity.saIdValid || !identity.homeAffairsVerified) decline('IDENTITY_NOT_VERIFIED');
    if (identity.deceased) decline('IDENTITY_DECEASED');
  }

  if (fraud && fraud.safpsListed) decline('FRAUD_REGISTER_MATCH');

  if (bureau) {
    if (bureau.underDebtReview) decline('BUREAU_DEBT_REVIEW');
    if (bureau.sequestrationOrAdministration) decline('BUREAU_SEQUESTRATION_OR_ADMINISTRATION');
    if ((bureau.judgmentsCount || 0) > 0) decline('BUREAU_JUDGMENT');
    if ((bureau.adverseListingsCount || 0) > 0) decline('BUREAU_ADVERSE_LISTING');
    if ((bureau.worstArrearsCycles12m || 0) > policy.knockouts.maxWorstArrearsCycles12m) {
      decline('BUREAU_SEVERE_ARREARS');
    }
    if ((bureau.enquiries90d || 0) > policy.knockouts.maxEnquiries90d) refer('BUREAU_ENQUIRY_VELOCITY');
    if (ageDays(bureau.retrievedAt, now) > policy.dataFreshnessDays.bureau) refer('BUREAU_REPORT_STALE');
  }

  if (bankAccount && (!bankAccount.avsVerified || bankAccount.holderMatch === false)) {
    refer('BANK_ACCOUNT_NOT_VERIFIED');
  }

  return { status: worstStatus(statuses), hard, reasonCodes: reasons };
}

module.exports = { evaluateKnockouts };
