'use strict';

/**
 * Unit Tests — onboarding.html identity integrity
 *
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Background:
 *   onboarding.html has two submission paths. The "post-registration" path
 *   (fromRegister) uses real data captured at register.html. The other
 *   ("legacy direct-onboarding") path is reached by any authenticated user
 *   who lands on onboarding.html without registration data, and it
 *   fabricates identity fields before POSTing to /api/users/register:
 *     - email:        `${firstName}.${lastName}@example.com` if none exists
 *     - sa_id_number: the user's typed 4-digit suffix, or otherwise the
 *                     phone number's digits, right-padded to 13 with zeros
 *   This corrupts FICA/POPIA-regulated identity data with fabricated values
 *   instead of collecting real ones. This pins that onboarding.html no
 *   longer fabricates identity data, and instead sends anyone without real
 *   registration data back to register.html.
 *
 * Run: node --test tests/unit/onboarding-identity-integrity.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const ONBOARDING = path.join(REPO_ROOT, 'onboarding.html');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('onboarding.html never fabricates identity data', () => {
  test('the file exists', () => {
    assert.ok(fs.existsSync(ONBOARDING), 'onboarding.html missing');
  });

  test('does not synthesize a placeholder @example.com email', () => {
    const html = read('onboarding.html');
    assert.ok(
      !html.includes('@example.com'),
      'onboarding.html still fabricates a placeholder email address'
    );
  });

  test('does not pad the phone number into a fake SA ID number', () => {
    const html = read('onboarding.html');
    assert.ok(
      !/padStart\(13,\s*['"]0['"]\)/.test(html),
      'onboarding.html still fabricates a 13-digit SA ID number from the phone digits'
    );
  });

  test('does not re-POST to /api/users/register from onboarding', () => {
    const html = read('onboarding.html');
    assert.ok(
      !html.includes("fetch('/api/users/register'"),
      'onboarding.html should never re-register a user — registration happens on register.html only'
    );
  });

  test('sends a user with no registration data back to register.html instead', () => {
    const html = read('onboarding.html');
    assert.match(
      html,
      /fromRegister[\s\S]{0,400}window\.location\.href\s*=\s*['"]register\.html['"]/,
      'onboarding.html should redirect to register.html when arriving without real registration data'
    );
  });
});
