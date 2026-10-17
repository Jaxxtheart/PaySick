/**
 * Identity, Fraud Register and Bank Account Verification Adapter (mock).
 *
 * Interface:
 *   verifyIdentity({ saIdNumber, patientId })     -> { saIdValid, homeAffairsVerified, deceased, source }
 *   checkFraudRegister({ saIdNumber, patientId }) -> { safpsListed, source }
 *   verifyBankAccount({ patientId })              -> { avsVerified, holderMatch, source }
 *
 * Production swap points: Department of Home Affairs identity verification,
 * the SAFPS fraud register, and bank account verification (AVS). Every mock
 * response carries source.isMock = true so the Shield engine refuses it in
 * production mode.
 */

'use strict';

const { validateSAID } = require('../utils/sa-id');

function mockSource(name) {
  const retrievedAt = new Date().toISOString();
  return { name, isMock: true, retrievedAt };
}

async function verifyIdentity({ saIdNumber } = {}) {
  if (!saIdNumber) throw new Error('verifyIdentity requires saIdNumber');
  const valid = validateSAID(saIdNumber).valid === true;
  return { saIdValid: valid, homeAffairsVerified: valid, deceased: false, source: mockSource('home-affairs-mock') };
}

async function checkFraudRegister({ saIdNumber } = {}) {
  if (!saIdNumber) throw new Error('checkFraudRegister requires saIdNumber');
  return { safpsListed: false, source: mockSource('safps-mock') };
}

async function verifyBankAccount({ patientId } = {}) {
  if (!patientId) throw new Error('verifyBankAccount requires patientId');
  return { avsVerified: true, holderMatch: true, source: mockSource('avs-mock') };
}

module.exports = { verifyIdentity, checkFraudRegister, verifyBankAccount };
