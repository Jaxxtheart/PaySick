'use strict';

/**
 * Unit Tests — care-agent.html renders the finite procedure list as
 * tappable choices
 *
 * Written to pin the frontend contract (test-first in spirit, though the
 * chip-rendering JS itself was implemented alongside these assertions
 * since no DOM/browser test runner is available in this sandbox — see
 * this repo's other *-ui.test.js / static-*.test.js files for the same
 * static-content-check pattern). Guards against regressing the fix for a
 * reported bug: a patient hit an infinite loop because the treatment
 * question was open-ended free text with no visible list of what the
 * agent could actually recognize.
 *
 * Run: node --test tests/unit/care-agent-procedure-chips-ui.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../care-agent.html'), 'utf8');

describe('care-agent.html — visible procedure-option chips', () => {
  test('has a dedicated container for the procedure-option chips', () => {
    assert.match(html, /id="procedure-options"/);
  });

  test('the free-text escape hatch is still advertised for anything not listed', () => {
    assert.match(html, /Not listed\? Just describe it below\./);
  });

  test('procedureOptions from the API response is stored in page state', () => {
    assert.match(html, /state\.procedureOptions\s*=\s*res\.procedureOptions/);
  });

  test('chips are only shown while the treatment question is actually pending', () => {
    assert.match(html, /missingFields\.includes\(['"]treatmentDescription['"]\)/);
  });

  test('clicking a chip sends the option label as an ordinary message (same path as typed text)', () => {
    assert.match(html, /chip\.addEventListener\('click',\s*\(\)\s*=>\s*sendMessage\(option\.label\)\)/);
  });

  test('chips are hidden again once the summary is ready to confirm', () => {
    // updateProcedureOptions()'s shouldShow check must factor in readyToConfirm.
    assert.match(html, /!state\.readyToConfirm\s*&&\s*state\.missingFields\.includes/);
  });
});
