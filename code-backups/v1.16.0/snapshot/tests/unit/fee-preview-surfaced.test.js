'use strict';

/**
 * Unit Tests — late-fee preview surfaced before payment
 *
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Background:
 *   backend/src/routes/payments.js already exposes
 *   GET /payments/:payment_id/fee-preview, which returns the late fee that
 *   will be charged on an overdue payment (5% per overdue month, per
 *   fee.service.js). Nothing in the frontend calls it: make-payment.html
 *   only shows the original scheduled amount, and the user only learns a
 *   late fee was added after paying, on the receipt. This pins:
 *     - api-client.js exposes a getFeePreview() wrapper for the endpoint
 *     - make-payment.html calls it while loading payment details and shows
 *       the late fee to the user before they click Pay Now
 *
 * Run: node --test tests/unit/fee-preview-surfaced.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('api-client.js exposes a fee-preview wrapper', () => {
  test('PaySickAPI.payments.getFeePreview calls the fee-preview endpoint', () => {
    const client = read('api-client.js');
    assert.match(
      client,
      /getFeePreview\s*\([^)]*\)\s*{[\s\S]{0,200}fee-preview/,
      'api-client.js is missing a getFeePreview() wrapper for GET /payments/:payment_id/fee-preview'
    );
  });
});

describe('make-payment.html surfaces the late fee before the user pays', () => {
  test('the file exists', () => {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'make-payment.html')), 'make-payment.html missing');
  });

  test('calls PaySickAPI.payments.getFeePreview while loading payment details', () => {
    const html = read('make-payment.html');
    assert.ok(
      html.includes('PaySickAPI.payments.getFeePreview'),
      'make-payment.html never calls getFeePreview — the user has no way to see a late fee before paying'
    );
  });

  test('has a dedicated element to display the late fee amount', () => {
    const html = read('make-payment.html');
    assert.match(
      html,
      /id="lateFeeNotice"/,
      'make-payment.html has no lateFeeNotice element to show the fee before Pay Now'
    );
  });

  test('the getFeePreview call happens inside loadPaymentDetails, not after payment', () => {
    const html = read('make-payment.html');
    const start = html.indexOf('async function loadPaymentDetails');
    const end = html.indexOf('function selectPaymentMethod');
    assert.ok(start > -1 && end > start, 'could not locate loadPaymentDetails() to check its body');
    const fnBody = html.slice(start, end);
    assert.ok(
      fnBody.includes('getFeePreview'),
      'getFeePreview should be called while loading payment details, before the user can click Pay Now'
    );
  });
});
