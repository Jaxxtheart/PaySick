/**
 * Identity Verification Adapter — SA ID + liveness via a KYC partner (mock).
 *
 * Interface:
 *   verifyIdentity({ idNumber, selfieToken, consentToken })
 *     -> { verified, method, dateOfBirth, reason? }
 *
 * The selfie is passed to the partner as a short-lived token and is never
 * returned or stored by Kehr.
 *
 * Production swap point: replace with the KYC partner's DHA + liveness call.
 */

'use strict';

const { validateSAID } = require('../utils/sa-id');

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function verifyIdentity(params = {}) {
  const { idNumber, selfieToken, consentToken } = params;
  if (!consentToken) throw new Error('verifyIdentity requires a consentToken');

  const check = validateSAID(idNumber);
  if (!check.valid) {
    return { verified: false, method: 'DHA_LIVENESS', dateOfBirth: null, reason: 'ID_INVALID' };
  }
  if (!selfieToken) {
    return { verified: false, method: 'DHA_LIVENESS', dateOfBirth: null, reason: 'LIVENESS_REQUIRED' };
  }

  return { verified: true, method: 'DHA_LIVENESS', dateOfBirth: isoDate(check.dateOfBirth) };
}

module.exports = { verifyIdentity };
