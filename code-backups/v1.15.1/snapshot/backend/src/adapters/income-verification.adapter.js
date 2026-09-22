/**
 * Income Verification Adapter — Stitch / Gathr (mock).
 *
 * Interface:
 *   verifyIncome(patientId, consentToken) -> Promise<{
 *     verifiedMonthlyIncome: number   // cents (integer)
 *     method: 'STITCH_OPEN_BANKING' | 'PDF_BANK_STATEMENT' | 'MANUAL_REVIEW'
 *     existingObligations: number     // cents/month
 *     verifiedAt: Date
 *   }>
 *
 * The mock seeds deterministic-by-patientId values so tests are repeatable.
 * Production swap point: replace `verifyIncome` with the live Stitch call.
 */

'use strict';

function hashSeed(input) {
  let h = 0;
  const s = String(input || '');
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

async function verifyIncome(patientId, consentToken) {
  if (!patientId || !consentToken) {
    throw new Error('verifyIncome requires patientId and consentToken');
  }

  const seed = hashSeed(patientId);

  // Deterministic income between R12,000 and R72,000 (in cents).
  const verifiedMonthlyIncome = 1_200_000 + (seed % 6_000_000);

  // Existing monthly obligations: 0–25% of income.
  const existingObligations = Math.round(verifiedMonthlyIncome * ((seed % 26) / 100));

  // Method picker — most go through open banking.
  const methods = ['STITCH_OPEN_BANKING', 'STITCH_OPEN_BANKING', 'STITCH_OPEN_BANKING',
                   'PDF_BANK_STATEMENT', 'MANUAL_REVIEW'];
  const method = methods[seed % methods.length];

  return {
    verifiedMonthlyIncome,
    method,
    existingObligations,
    verifiedAt: new Date()
  };
}

module.exports = {
  verifyIncome
};
