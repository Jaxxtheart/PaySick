/**
 * DebiCheck Adapter — debit order rails (mock).
 *
 * Interface:
 *   createMandate(params)        -> { mandateId, status }
 *   collectInstalment(id, amount) -> { collectionId, status }
 *
 * Production swap point: replace with the live DebiCheck SDK calls.
 */

'use strict';

const crypto = require('crypto');

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
  return { mandateId, status: 'PENDING_AUTHENTICATION' };
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
  createMandate,
  collectInstalment
};
