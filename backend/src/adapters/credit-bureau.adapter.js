/**
 * Credit Bureau Adapter — arrears reporting rails (mock).
 *
 * Interface:
 *   submitArrearsReport(params) -> { submissionId, status }
 *   fetchConsumerReport({ saIdNumber, patientId }) -> consumer report used by
 *     Shield knock-outs, affordability (obligations) and the Medical Risk Score
 *
 * The mock report is deterministic by SA ID and is marked source.isMock so
 * the Shield engine refuses it in production mode.
 *
 * Production swap point: replace with the live NCR-registered bureau
 * submission API (e.g. Compuscan, XDS, TransUnion).
 */

'use strict';

const crypto = require('crypto');

async function submitArrearsReport(params) {
  const required = ['caseId', 'saIdNumber', 'daysOverdue', 'outstandingAmountCents'];
  for (const k of required) {
    if (params[k] === undefined || params[k] === null) {
      throw new Error(`submitArrearsReport missing required param: ${k}`);
    }
  }

  const submissionId = `bureau-sub-${crypto.randomBytes(6).toString('hex')}`;
  return { submissionId, status: 'SUBMITTED' };
}

function hashSeed(input) {
  let h = 0;
  const s = String(input || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function fetchConsumerReport({ saIdNumber, patientId } = {}) {
  if (!saIdNumber) throw new Error('fetchConsumerReport requires saIdNumber');
  const seed = hashSeed(saIdNumber);
  const retrievedAt = new Date().toISOString();
  return {
    score: 560 + (seed % 240),
    thinFile: seed % 17 === 0,
    underDebtReview: false,
    sequestrationOrAdministration: false,
    judgmentsCount: 0,
    adverseListingsCount: 0,
    worstArrearsCycles12m: seed % 7 === 0 ? 1 : 0,
    enquiries90d: seed % 5,
    revolvingUtilisation: (seed % 90) / 100,
    monthlyObligationsCents: 100_000 + (seed % 900_000),
    retrievedAt,
    patientId: patientId || null,
    source: { name: 'credit-bureau-mock', isMock: true, retrievedAt }
  };
}

module.exports = {
  submitArrearsReport,
  fetchConsumerReport
};
