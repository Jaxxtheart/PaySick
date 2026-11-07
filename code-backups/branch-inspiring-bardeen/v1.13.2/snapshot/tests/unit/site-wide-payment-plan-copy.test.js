'use strict';

/**
 * Unit Tests — Replace fixed "3 month" marketing copy with generic
 * "payment plan" language, site-wide
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Follow-up to v1.13.0, which reworded only the homepage hero paragraph.
 * This extends the same fix to every other marketing/informational
 * surface that hardcoded "3 months" / "three months": index.html's meta
 * description, its "3-Month Terms" feature card, its "Pay in 3 Months"
 * how-it-works step, its bottom CTA section, about.html's stats grid, and
 * the root README.md's project description. "Payment plan" is already the
 * platform's own established generic term (see index.html's existing
 * "Instant Setup" card: "Set up your payment plan in minutes").
 *
 * Deliberately OUT of scope, and asserted as untouched below:
 * terms-of-service.html section 4.1, which contractually specifies
 * "three equal monthly instalments" as the actual mechanics of the core
 * PaySick product (matches backend/src/services/fee.service.js's
 * documented policy). That is a legal document describing real contract
 * terms, not overclaiming marketing copy — rewording it needs a
 * deliberate legal review, not a drive-by copy pass, so this suite pins
 * it as unchanged rather than silently leaving it inconsistent with no
 * record of the decision.
 *
 * Run: node --test tests/unit/site-wide-payment-plan-copy.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');

describe('index.html — fixed "3 month" copy replaced with "payment plan"', () => {
  const html = read('index.html');

  test('meta description no longer promises a fixed "3 easy monthly payments"', () => {
    assert.ok(!/3 easy monthly payments/i.test(html), 'meta description must not hardcode "3 easy monthly payments"');
    const metaMatch = html.match(/<meta name="description"[^>]*>/i);
    assert.ok(metaMatch, 'index.html must have a meta description');
    assert.ok(/payment plan/i.test(metaMatch[0]), 'meta description should describe a payment plan instead');
  });

  test('the "3-Month Terms" feature card is reworded', () => {
    assert.ok(!html.includes('>3-Month Terms<'), 'the feature card must not be titled "3-Month Terms"');
    assert.ok(!/spread over three months/i.test(html), 'feature card copy must not hardcode "three months"');
  });

  test('the "Pay in 3 Months" how-it-works step is reworded', () => {
    assert.ok(!html.includes('>Pay in 3 Months<'), 'step 3 must not be titled "Pay in 3 Months"');
    assert.ok(
      !/split into three equal monthly payments/i.test(html),
      'step 3 copy must not hardcode "three equal monthly payments"'
    );
  });

  test('the bottom CTA section no longer hardcodes "three easy monthly payments"', () => {
    assert.ok(
      !/three easy monthly payments/i.test(html),
      'no remaining "three easy monthly payments" claim anywhere in index.html'
    );
  });
});

describe('about.html — stats grid reworded', () => {
  const html = read('about.html');

  test('the "3 Months" stat card no longer hardcodes a term length', () => {
    assert.ok(!html.includes('<h3>3 Months</h3>'), 'the stats grid must not claim a fixed "3 Months" term');
  });
});

describe('README.md — project description reworded', () => {
  const md = read('README.md');

  test('no longer hardcodes "3-month payment plans"', () => {
    assert.ok(!/3-month payment plans/i.test(md), 'README.md must not hardcode a fixed 3-month term');
    assert.ok(/payment plans?/i.test(md), 'README.md should still describe payment plans generically');
  });
});

describe('terms-of-service.html — legal contract terms deliberately left untouched', () => {
  const html = read('terms-of-service.html');

  test('still specifies three equal monthly instalments as the actual contractual mechanic', () => {
    assert.ok(
      html.includes('repayable in three equal monthly instalments'),
      'the legal terms describe the real, current product mechanics and must not be casually reworded alongside marketing copy'
    );
  });
});
