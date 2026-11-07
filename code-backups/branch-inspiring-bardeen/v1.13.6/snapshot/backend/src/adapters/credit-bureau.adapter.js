/**
 * Credit Bureau Adapter — arrears reporting rails (mock).
 *
 * Interface:
 *   submitArrearsReport(params) -> { submissionId, status }
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

module.exports = {
  submitArrearsReport
};
