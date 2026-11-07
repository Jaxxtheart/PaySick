/**
 * Debt Collector / Attorney Adapter — external recovery rails (mock).
 *
 * Interface:
 *   referCase(params) -> { referralId, status }
 *
 * Only NCR / Debt Collectors Act 114 of 1998–registered partners may be
 * configured behind this adapter. Production swap point: replace with
 * the live partner intake API.
 */

'use strict';

const crypto = require('crypto');

const ALLOWED_PARTNER_TYPES = ['registered_debt_collector', 'attorney'];

async function referCase(params) {
  const required = ['caseId', 'partnerType', 'outstandingAmountCents', 'humanApprovedBy'];
  for (const k of required) {
    if (params[k] === undefined || params[k] === null) {
      throw new Error(`referCase missing required param: ${k}`);
    }
  }
  if (!ALLOWED_PARTNER_TYPES.includes(params.partnerType)) {
    throw new Error(`referCase requires partnerType to be one of: ${ALLOWED_PARTNER_TYPES.join(', ')}`);
  }

  const referralId = `ext-ref-${crypto.randomBytes(6).toString('hex')}`;
  return { referralId, status: 'REFERRED' };
}

module.exports = {
  referCase,
  ALLOWED_PARTNER_TYPES
};
