/**
 * Shield Underwriting — Knock-out rules.
 *
 * Knock-outs run before any scoring. An adverse hit is a hard DECLINE that
 * no score and no human can override. Missing data is never a pass: it is
 * REFER (system problem) — the gate fails closed.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { POLICY } = require('../../backend/src/shield/policy');
const { evaluateKnockouts } = require('../../backend/src/shield/knockouts');
const { NOW, daysAgo, baselineInput } = require('./fixtures/shield-input');

function ko(overrides = {}, opts = {}) {
  const input = baselineInput(overrides);
  return evaluateKnockouts(input, POLICY, { now: NOW, allowMockSources: false, ...opts });
}

describe('knock-outs', () => {
  test('clean applicant passes', () => {
    const r = ko();
    assert.equal(r.status, 'PASS');
    assert.deepEqual(r.reasonCodes, []);
  });

  const hardDeclines = [
    ['under debt review', { bureau: { underDebtReview: true } }, 'BUREAU_DEBT_REVIEW'],
    ['sequestration / administration', { bureau: { sequestrationOrAdministration: true } }, 'BUREAU_SEQUESTRATION_OR_ADMINISTRATION'],
    ['civil judgment', { bureau: { judgmentsCount: 1 } }, 'BUREAU_JUDGMENT'],
    ['adverse listing', { bureau: { adverseListingsCount: 2 } }, 'BUREAU_ADVERSE_LISTING'],
    ['3+ cycles in arrears in 12m', { bureau: { worstArrearsCycles12m: 3 } }, 'BUREAU_SEVERE_ARREARS'],
    ['SAFPS fraud register match', { fraud: { safpsListed: true } }, 'FRAUD_REGISTER_MATCH'],
    ['identity not verified at Home Affairs', { identity: { homeAffairsVerified: false } }, 'IDENTITY_NOT_VERIFIED'],
    ['invalid SA ID', { identity: { saIdValid: false } }, 'IDENTITY_NOT_VERIFIED'],
    ['deceased flag', { identity: { deceased: true } }, 'IDENTITY_DECEASED']
  ];

  for (const [label, override, code] of hardDeclines) {
    test(`${label} → hard DECLINE (${code})`, () => {
      const r = ko(override);
      assert.equal(r.status, 'DECLINE');
      assert.equal(r.hard, true);
      assert.ok(r.reasonCodes.includes(code), JSON.stringify(r.reasonCodes));
    });
  }

  test('enquiry velocity above policy → REFER (credit-hungry / fraud signal)', () => {
    const r = ko({ bureau: { enquiries90d: POLICY.knockouts.maxEnquiries90d + 1 } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('BUREAU_ENQUIRY_VELOCITY'));
  });

  test('bank account not verified (AVS) → REFER', () => {
    const r = ko({ bankAccount: { avsVerified: false } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('BANK_ACCOUNT_NOT_VERIFIED'));
  });

  for (const block of ['bureau', 'identity', 'fraud', 'bankAccount']) {
    test(`missing ${block} data → REFER, never PASS`, () => {
      const r = ko({ [block]: null });
      assert.equal(r.status, 'REFER');
      assert.ok(r.reasonCodes.includes(`DATA_UNAVAILABLE:${block}`));
    });

    test(`mock ${block} source refused in production mode → REFER`, () => {
      const r = ko({ [block]: { source: { isMock: true } } });
      assert.equal(r.status, 'REFER');
      assert.ok(r.reasonCodes.includes(`DATA_SOURCE_NOT_PRODUCTION:${block}`));
    });
  }

  test('mock sources accepted only when explicitly allowed (non-production)', () => {
    const r = ko({ bureau: { source: { isMock: true } } }, { allowMockSources: true });
    assert.equal(r.status, 'PASS');
  });

  test('bureau report older than 30 days → REFER (re-pull)', () => {
    const r = ko({ bureau: { retrievedAt: daysAgo(31) } });
    assert.equal(r.status, 'REFER');
    assert.ok(r.reasonCodes.includes('BUREAU_REPORT_STALE'));
  });

  test('adverse hit outranks missing data (DECLINE wins over REFER)', () => {
    const r = ko({ bureau: { underDebtReview: true }, bankAccount: null });
    assert.equal(r.status, 'DECLINE');
    assert.ok(r.reasonCodes.includes('BUREAU_DEBT_REVIEW'));
    assert.ok(r.reasonCodes.includes('DATA_UNAVAILABLE:bankAccount'));
  });
});
