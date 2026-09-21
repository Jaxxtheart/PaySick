/**
 * Unit Tests — Outreach terminology linter (§6.3)
 * Node.js built-in test runner (node:test + node:assert). No DB, no network.
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md). The compliance
 * gate is load-bearing for PaySick's CPA/POPIA positioning: any draft containing
 * a denied term must be flagged so it is routed to `compliance_hold`, not queued.
 *
 * Run: node --test tests/unit/outreach-compliance.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  complianceScan,
  isCompliant,
} = require('../../backend/src/services/outreach/compliance.service');

describe('complianceScan — denied terminology', () => {
  test('flags each prohibited term (case-insensitive, de-duplicated)', () => {
    const denied = [
      'credit', 'loan', 'loans', 'lend', 'lending', 'borrow', 'borrower',
      'interest', 'apr', 'debt', 'debtor', 'default', 'defaults',
      'repayment', 'repayments', 'financing',
    ];
    for (const term of denied) {
      const flags = complianceScan(`Please review the ${term.toUpperCase()} terms.`);
      assert.ok(flags.length >= 1, `expected "${term}" to be flagged`);
      assert.ok(flags.includes(term.toLowerCase()), `expected flag list to include "${term.toLowerCase()}"`);
    }
  });

  test('de-duplicates repeated terms and lowercases them', () => {
    const flags = complianceScan('Credit credit CREDIT and more credit.');
    assert.deepEqual(flags, ['credit']);
  });

  test('returns multiple distinct flags in one pass', () => {
    const flags = complianceScan('This loan has interest and creates debt.');
    assert.ok(flags.includes('loan'));
    assert.ok(flags.includes('interest'));
    assert.ok(flags.includes('debt'));
  });

  test('does not flag compliant instalment / paid-in-full framing', () => {
    const compliant =
      'Your patients pay in affordable monthly instalments while you are paid in full, upfront. ' +
      'PaySick is a payment facilitator — no collections, no risk to your practice.';
    assert.deepEqual(complianceScan(compliant), []);
  });

  test('respects word boundaries — "creditworthy-free" copy is not falsely flagged', () => {
    // "accreditation" contains "credit" as a substring but is a different word.
    assert.deepEqual(complianceScan('Our accreditation is current.'), []);
  });

  test('empty / non-string input yields no flags', () => {
    assert.deepEqual(complianceScan(''), []);
    assert.deepEqual(complianceScan(null), []);
    assert.deepEqual(complianceScan(undefined), []);
  });
});

describe('isCompliant', () => {
  test('true for clean copy, false when a denied term is present', () => {
    assert.equal(isCompliant('Paid in full within 24 hours.'), true);
    assert.equal(isCompliant('Low interest repayment plan.'), false);
  });
});
