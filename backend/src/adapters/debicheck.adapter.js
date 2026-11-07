/**
 * DebiCheck Adapter — debit order rails (mock).
 *
 * Interface:
 *   createMandate(params)        -> { mandateId, status, authType, creditor }
 *   collectInstalment(id, amount) -> { collectionId, status }
 *   nextStepForResult({ authType, result }) -> { status, next }
 *
 * Creditor: every mandate is administered through the Kehr platform, so the
 * creditor on the mandate is Tech & Artery (Pty) Ltd, shown in the patient's
 * banking app as KEHR*PLAN. Sponsor bank: Standard Bank (to be confirmed).
 *
 * Approval: real-time TT1 (the patient approves in their banking app within
 * the bank's window); on a TT1 timeout the mandate is re-issued as batch TT2.
 *
 * Production swap point: replace with the live DebiCheck SDK calls.
 */

'use strict';

const crypto = require('crypto');

const CREDITOR = Object.freeze({
  legalName: 'Tech & Artery (Pty) Ltd',
  shortName: 'KEHR*PLAN',
  sponsorBank: 'Standard Bank',
});

// Abbreviated creditor name limit on the mandate. Confirm with Standard Bank.
const SHORT_NAME_MAX_LENGTH = 10;

async function createMandate(params) {
  const required = [
    'patientId',
    'bankAccountNumber',
    'branchCode',
    'monthlyAmount',
    'firstCollectionDate',
    'referenceNumber'
  ];
  for (const k of required) {
    if (params[k] === undefined || params[k] === null) {
      throw new Error(`createMandate missing required param: ${k}`);
    }
  }

  // Mocked auth flow — most mandates land PENDING_AUTHENTICATION pending USSD/app push.
  const mandateId = `dc-mandate-${crypto.randomBytes(6).toString('hex')}`;
  const authType = params.authType === 'TT2' ? 'TT2' : 'TT1';
  return { mandateId, status: 'PENDING_AUTHENTICATION', authType, creditor: { ...CREDITOR } };
}

/**
 * Maps the bank's authentication result to the mandate status and what the
 * platform does next.
 */
function nextStepForResult({ authType, result }) {
  if (result === 'AUTHENTICATED') return { status: 'ACTIVE', next: 'create_plan' };
  if (result === 'REJECTED') return { status: 'REJECTED', next: 'tell_patient' };
  if (result === 'TIMEOUT') {
    return authType === 'TT1'
      ? { status: 'PENDING_AUTHENTICATION', next: 'reissue_as_TT2' }
      : { status: 'EXPIRED', next: 'offer_secure_form' };
  }
  throw new Error(`Unknown DebiCheck result: ${result}`);
}

async function collectInstalment(mandateId, amount) {
  if (!mandateId) throw new Error('collectInstalment requires mandateId');
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('collectInstalment requires positive amount in cents');
  }

  const collectionId = `dc-coll-${crypto.randomBytes(6).toString('hex')}`;
  // In the mock, collections start SUBMITTED — settlement comes later via webhook.
  return { collectionId, status: 'SUBMITTED' };
}

module.exports = {
  CREDITOR,
  SHORT_NAME_MAX_LENGTH,
  createMandate,
  collectInstalment,
  nextStepForResult
};
