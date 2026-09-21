/**
 * Unit tests — mock adapters for external integrations.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const incomeAdapter = require('../../backend/src/adapters/income-verification.adapter');
const dspAdapter = require('../../backend/src/adapters/dsp-check.adapter');
const debiCheckAdapter = require('../../backend/src/adapters/debicheck.adapter');

describe('IncomeVerificationAdapter (mock)', () => {
  test('verifyIncome returns the documented shape', async () => {
    const r = await incomeAdapter.verifyIncome('pat-1', 'consent-token');
    assert.equal(typeof r.verifiedMonthlyIncome, 'number');
    assert.ok(['STITCH_OPEN_BANKING', 'PDF_BANK_STATEMENT', 'MANUAL_REVIEW'].includes(r.method));
    assert.equal(typeof r.existingObligations, 'number');
    assert.ok(r.verifiedAt instanceof Date);
  });

  test('verifiedMonthlyIncome is a non-negative integer (cents)', async () => {
    const r = await incomeAdapter.verifyIncome('pat-1', 'consent-token');
    assert.ok(Number.isInteger(r.verifiedMonthlyIncome));
    assert.ok(r.verifiedMonthlyIncome >= 0);
  });
});

describe('DspCheckAdapter (mock)', () => {
  test('checkDspStatus returns documented shape', async () => {
    const r = await dspAdapter.checkDspStatus('SCHEME01', 'PLAN_A', 'prov-1');
    assert.equal(typeof r.isDsp, 'boolean');
    assert.ok(['FULL_PMB', 'FUND_RATE', 'PARTIAL', 'NONE'].includes(r.coverageType));
    assert.equal(typeof r.schemeRateMultiple, 'number');
  });
});

describe('DebiCheckAdapter (mock)', () => {
  test('createMandate returns mandateId + status', async () => {
    const r = await debiCheckAdapter.createMandate({
      patientId: 'pat-1',
      bankAccountNumber: '1234567890',
      branchCode: '250655',
      monthlyAmount: 100000,
      firstCollectionDate: new Date('2026-07-01'),
      referenceNumber: 'PSK-1'
    });
    assert.equal(typeof r.mandateId, 'string');
    assert.ok(['PENDING_AUTHENTICATION', 'AUTHENTICATED', 'REJECTED'].includes(r.status));
  });

  test('collectInstalment returns collectionId + status', async () => {
    const r = await debiCheckAdapter.collectInstalment('mandate-1', 100000);
    assert.equal(typeof r.collectionId, 'string');
    assert.ok(['SUBMITTED', 'COLLECTED', 'RETURNED'].includes(r.status));
  });
});
