'use strict';

/**
 * Unit Tests — Credit Bureau Reporting
 *
 * For a book with an average facility of R850, credit bureau listing is the
 * strongest available recovery lever (litigation rarely clears its own
 * cost). This reports arrears once a case is 30+ days overdue.
 *
 * Written BEFORE implementation (test-first workflow, CLAUDE.md).
 * Run: node --test tests/unit/bureau-reporting.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  submitArrearsReport
} = require('../../backend/src/adapters/credit-bureau.adapter');

const {
  isReportable,
  reportIfDue,
  BUREAU_REPORTING_THRESHOLD_DAYS
} = require('../../backend/src/services/bureau-reporting.service');

describe('credit-bureau.adapter — submitArrearsReport (mock)', () => {
  test('returns a submissionId and SUBMITTED status', async () => {
    const result = await submitArrearsReport({
      caseId: 'case-1',
      saIdNumber: '9001015009087',
      daysOverdue: 30,
      outstandingAmountCents: 85000
    });
    assert.ok(typeof result.submissionId === 'string' && result.submissionId.startsWith('bureau-sub-'));
    assert.equal(result.status, 'SUBMITTED');
  });

  test('throws when a required param is missing', async () => {
    await assert.rejects(() => submitArrearsReport({ caseId: 'case-1' }));
  });
});

describe('bureau-reporting.service — isReportable threshold', () => {
  test('the threshold is 30 days overdue', () => {
    assert.equal(BUREAU_REPORTING_THRESHOLD_DAYS, 30);
  });

  test('is not reportable below the threshold', () => {
    assert.equal(isReportable(29), false);
    assert.equal(isReportable(1), false);
    assert.equal(isReportable(0), false);
  });

  test('is reportable at and above the threshold', () => {
    assert.equal(isReportable(30), true);
    assert.equal(isReportable(90), true);
  });
});

describe('bureau-reporting.service — reportIfDue', () => {
  test('does not submit when below threshold', async () => {
    const result = await reportIfDue({
      caseId: 'case-1',
      saIdNumber: '9001015009087',
      daysOverdue: 10,
      outstandingAmountCents: 85000
    });
    assert.equal(result.reported, false);
    assert.equal(result.reason, 'below_threshold');
  });

  test('submits and returns a submissionId once at threshold', async () => {
    const result = await reportIfDue({
      caseId: 'case-1',
      saIdNumber: '9001015009087',
      daysOverdue: 30,
      outstandingAmountCents: 85000
    });
    assert.equal(result.reported, true);
    assert.ok(typeof result.submissionId === 'string');
  });
});
