'use strict';

/**
 * Unit Tests — payment-success.html dashboard-lag claim
 *
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Background:
 *   payment-success.html's "What's Next?" list tells every user "Your
 *   payment will reflect on your dashboard within 24 hours". But
 *   dashboard.html calls PaySickAPI.payments.getPlans()/getUpcoming() live
 *   on every load, and payments.js marks a payment 'paid' synchronously in
 *   the same request that processes it — there is no such lag. This pins
 *   that the claim is corrected to match reality.
 *
 * Run: node --test tests/unit/payment-success-accuracy.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('payment-success.html does not claim a 24-hour dashboard lag', () => {
  test('the file exists', () => {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'payment-success.html')), 'payment-success.html missing');
  });

  test('does not claim the payment reflects "within 24 hours"', () => {
    const html = read('payment-success.html');
    assert.ok(
      !/within 24 hours/i.test(html),
      'payment-success.html still claims a 24-hour reflection delay that dashboard.html does not actually have'
    );
  });

  test('tells the user the dashboard already reflects the payment', () => {
    const html = read('payment-success.html');
    assert.match(
      html,
      /dashboard[\s\S]{0,40}(already|immediately|right away|now)/i,
      'payment-success.html should tell the user the dashboard already reflects this payment'
    );
  });
});
