/**
 * Consent wallet — one revocable consent per data source.
 *
 * Kehr reads data instead of asking the patient to type it, so every read
 * needs its own consent: what is read, why, how long it is kept, and whether
 * it is special personal information (POPIA s26). A grant stores the exact
 * purpose text the patient agreed to, so a later wording change never
 * rewrites what they said yes to.
 *
 * Pure: no database access. Routes persist the records (kehr_consents).
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

const CONSENT_SOURCES = Object.freeze({
  bank_income_once: Object.freeze({
    label: 'Bank account: one-time income check',
    purpose: 'We read your salary credits and debit orders from the last 3 months once, to work out what you can comfortably afford. We keep the result, not your transactions.',
    specialPersonalInformation: false,
    optional: false,
    retentionDays: 90,
  }),
  bank_payday_sync: Object.freeze({
    label: 'Bank account: payday sync',
    purpose: 'We watch for your salary landing so we can move a payment date if your payday changes. You can switch this off at any time.',
    specialPersonalInformation: false,
    optional: true,
    ongoing: true,
  }),
  scheme_cover: Object.freeze({
    label: 'Medical aid: cover and pre-authorisation',
    purpose: 'We ask your medical aid what it covers for this procedure and whether it is pre-authorised, so your plan only funds the gap.',
    specialPersonalInformation: true,
    optional: false,
    retentionDays: 365,
  }),
  health_history: Object.freeze({
    label: 'Health history',
    purpose: 'Optional. Sharing your health history can improve your offer. Declining never counts against you.',
    specialPersonalInformation: true,
    optional: true,
    retentionDays: 365,
  }),
  bureau: Object.freeze({
    label: 'Credit bureau check',
    purpose: 'We check your credit record with a registered credit bureau, as the National Credit Act requires before offering a payment plan.',
    specialPersonalInformation: false,
    optional: false,
    retentionDays: 90,
  }),
  provider_share: Object.freeze({
    label: 'Share your pass with a provider',
    purpose: 'We tell the provider you choose that you are pre-approved and up to what amount. They never see your income, bank details or health information.',
    specialPersonalInformation: false,
    optional: true,
    retentionDays: 90,
  }),
  document_upload: Object.freeze({
    label: 'Uploaded documents',
    purpose: 'We read the payslip or bank statement you upload to confirm your income, then keep only the figures we used.',
    specialPersonalInformation: false,
    optional: true,
    retentionDays: 90,
  }),
});

// Each requirement is satisfied by any one of its sources.
const REQUIREMENTS = Object.freeze({
  preapproval: Object.freeze({
    bureau: ['bureau'],
    income: ['bank_income_once', 'document_upload'],
  }),
});

function grantConsent({ source, now = new Date() }) {
  const def = CONSENT_SOURCES[source];
  if (!def) throw new Error(`Unknown consent source: ${source}`);
  return {
    source,
    purposeAgreed: def.purpose,
    grantedAt: now.toISOString(),
    expiresAt: def.retentionDays ? new Date(now.getTime() + def.retentionDays * DAY_MS).toISOString() : null,
    withdrawnAt: null,
  };
}

function withdrawConsent(record, now = new Date()) {
  return { ...record, withdrawnAt: now.toISOString() };
}

function isActive(record, now = new Date()) {
  if (!record || record.withdrawnAt) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

function missingFor(purpose, records, now = new Date()) {
  const reqs = REQUIREMENTS[purpose];
  if (!reqs) throw new Error(`Unknown consent purpose: ${purpose}`);
  const active = new Set((records || []).filter((r) => isActive(r, now)).map((r) => r.source));
  return Object.entries(reqs)
    .filter(([, sources]) => !sources.some((s) => active.has(s)))
    .map(([name]) => name);
}

function patientConsentView(records, now = new Date()) {
  return (records || []).map((r) => ({
    source: r.source,
    label: CONSENT_SOURCES[r.source] ? CONSENT_SOURCES[r.source].label : r.source,
    purpose: r.purposeAgreed,
    grantedAt: r.grantedAt,
    expiresAt: r.expiresAt,
    active: isActive(r, now),
  }));
}

module.exports = {
  CONSENT_SOURCES,
  REQUIREMENTS,
  grantConsent,
  withdrawConsent,
  isActive,
  missingFor,
  patientConsentView,
};
