'use strict';

/**
 * Unit Tests — dashboard.html demo-data isolation
 *
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Background:
 *   dashboard.html hardcodes a fabricated financial dataset (loadDemoData:
 *   fake balances, a fake provider name, a fake payment plan) directly in
 *   the same production file that renders real users' account data. This
 *   pins that the demo fixture lives in its own file (js/demo-data.js),
 *   loaded conditionally, so the file that renders real balances doesn't
 *   also carry fabricated ones inline.
 *
 * Run: node --test tests/unit/dashboard-demo-data-isolation.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const DEMO_DATA_FILE = path.join(REPO_ROOT, 'js', 'demo-data.js');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

describe('dashboard.html no longer inlines fabricated demo data', () => {
  test('js/demo-data.js exists', () => {
    assert.ok(fs.existsSync(DEMO_DATA_FILE), 'js/demo-data.js should hold the demo fixture, separate from dashboard.html');
  });

  test('js/demo-data.js contains the demo provider/plan fixture', () => {
    const demoData = fs.readFileSync(DEMO_DATA_FILE, 'utf8');
    assert.ok(demoData.includes('Netcare Dental Centre'), 'demo fixture (provider name) missing from js/demo-data.js');
  });

  test('dashboard.html no longer hardcodes the fabricated provider name inline', () => {
    const html = read('dashboard.html');
    assert.ok(
      !html.includes('Netcare Dental Centre'),
      'dashboard.html still hardcodes fabricated demo data inline instead of loading it from js/demo-data.js'
    );
  });

  test('dashboard.html loads the demo data file as a script', () => {
    const html = read('dashboard.html');
    assert.ok(
      html.includes('js/demo-data.js'),
      'dashboard.html should include <script src="js/demo-data.js"> so demo mode still works'
    );
  });
});
