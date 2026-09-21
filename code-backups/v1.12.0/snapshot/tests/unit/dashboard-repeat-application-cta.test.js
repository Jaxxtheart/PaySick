'use strict';

/**
 * Unit Tests — dashboard.html repeat-application CTA
 *
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Background:
 *   dashboard.html's only path to a new/repeat application ("Apply for
 *   Funding") sits in the side menu at the same visual tier as "Support".
 *   For a good-standing customer (no active plan, or one nearly paid off)
 *   this is the single highest-LTV action on the whole platform, and it is
 *   currently invisible unless the user happens to open the hamburger menu.
 *   This pins a prominent, main-content banner that:
 *     - links to marketplace-apply.html
 *     - shows when the user has zero active plans
 *     - shows when an active plan is nearly paid off (>=66% of payments made)
 *
 * Run: node --test tests/unit/dashboard-repeat-application-cta.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('dashboard.html surfaces a prominent repeat-application CTA', () => {
  test('the file exists', () => {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, 'dashboard.html')), 'dashboard.html missing');
  });

  test('has a repeatApplyBanner element in the main content, linking to marketplace-apply.html', () => {
    const html = read('dashboard.html');
    const idIdx = html.indexOf('id="repeatApplyBanner"');
    assert.ok(idIdx > -1, 'dashboard.html has no #repeatApplyBanner element');
    const context = html.slice(Math.max(0, idIdx - 200), idIdx + 600);
    assert.ok(
      context.includes('marketplace-apply.html'),
      'repeatApplyBanner should link to marketplace-apply.html'
    );
  });

  test('shows the banner when the user has zero active plans', () => {
    const html = read('dashboard.html');
    assert.match(
      html,
      /active_plans\s*===\s*0[\s\S]{0,300}repeatApplyBanner/,
      'dashboard.html should show repeatApplyBanner when data.active_plans === 0'
    );
  });

  test('shows the banner when a plan is nearly paid off', () => {
    const html = read('dashboard.html');
    assert.match(
      html,
      /payments_made\s*\/\s*plan\.number_of_payments[\s\S]{0,400}repeatApplyBanner/,
      'dashboard.html should show repeatApplyBanner when an active plan is nearly complete'
    );
  });
});
