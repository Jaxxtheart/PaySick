/**
 * Unit Tests — care-agent.html account screens
 *
 * v1.18.0 wrote this test-first for the value-chain screens. v1.19.0
 * (owner direction) rewrites it, again before the change: the agent's
 * decisions stay in the backend. The patient sees confirmed facts and
 * statuses only, with nothing that makes it feel like an agent is working
 * in the background.
 *
 * Static checks on the page, since it cannot be loaded here without a
 * browser (the Chromium run is recorded in the release notes).
 *
 * Run: node --test tests/unit/care-agent-account-ui.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '../../kehr.html'), 'utf8');

function fn(name) {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name}`);
  const next = page.slice(start + 10).search(/\n        (async )?function /);
  return next === -1 ? page.slice(start) : page.slice(start, start + 10 + next);
}

describe('no backend process on the patient screen', () => {
  for (const [what, pattern] of [
    ['journey bar', /journey-tracker|journeyStage|renderJourney/],
    ['decision boxes', /agent-decision|reasonCode|rationale/],
    ['authority badges', /badge-autonomous|badge-patient_consent|badge-human_review|badge-prohibited|authorityLabel|AUTHORITY_LABELS/],
    ['tier wording', /Agent does it|You approve|Team decides|Not in chat/],
    ['agent activity log', /decision-log|getDecisions|What the agent did/],
    ['"what will change" system description', /Will change|proposal\.effect/],
    ['Shield assessment note', /shield-note|shieldAssessment|affordability check:/],
    ['affordability pressure flag', /pressure-note|pressureWarning/],
    ['recommended-offer marker', /recommended|'Lowest'/],
  ]) {
    test(`no ${what}`, () => {
      assert.doesNotMatch(page, pattern);
    });
  }
});

describe('account card shows facts and plain options', () => {
  test('loads after the conversation starts and after submitting', () => {
    assert.match(fn('init'), /loadAccount\(\)/);
    assert.match(fn('approveAndExecute'), /loadAccount\(\)/);
  });

  test('renders the status line, outstanding and next payment, requests and offers', () => {
    const render = fn('renderAccount');
    for (const field of ['status', 'outstanding', 'nextPayment', 'requests', 'offers', 'options']) {
      assert.match(render, new RegExp(`account\\.${field}`), field);
    }
  });

  test('hides itself when there is nothing on the account', () => {
    assert.match(fn('renderAccount'), /hasAccount/);
  });
});

describe('confirmation card', () => {
  const render = fn('renderProposal');

  test('needs its own consent box ticked before confirming', () => {
    assert.match(render, /type = 'checkbox'/);
    const confirmAt = render.indexOf('confirmAction');
    const checkAt = render.indexOf('.checked');
    assert.ok(checkAt !== -1 && confirmAt !== -1 && checkAt < confirmAt);
  });

  test('uses the server\'s button label and can be cancelled', () => {
    assert.match(render, /confirmLabel/);
    assert.match(render, /declineAction/);
  });

  test('disables its buttons while confirming', () => {
    assert.match(render, /disabled = true/);
  });
});

describe('details form', () => {
  test('builds inputs from the option and submits it', () => {
    const render = fn('renderActionForm');
    assert.match(render, /inputs/);
    assert.match(render, /proposeAction/);
  });

  test('does not rely on window.prompt', () => {
    assert.doesNotMatch(page, /window\.prompt\(/);
  });
});

describe('message replies', () => {
  test('sendMessage renders cards and detail forms', () => {
    const send = fn('sendMessage');
    assert.match(send, /handleActionResults\(res\.proposals\)/);
    assert.match(send, /suggestedAction/);
  });

  test('a refusal shows its message and only links within the site', () => {
    assert.match(fn('handleActionResults'), /refused/);
    assert.match(fn('safeRedirect'), /\\\.html/);
  });
});

describe('income on the summary card', () => {
  test('offers optional income and obligations fields', () => {
    assert.match(page, /id="summary-income"/);
    assert.match(page, /id="summary-obligations"/);
  });

  test('sends them with the confirmation', () => {
    assert.match(fn('confirmSummary'), /monthlyIncome/);
    assert.match(fn('confirmSummary'), /monthlyObligations/);
  });
});

describe('safe rendering', () => {
  test('never writes data through innerHTML (only clears with it)', () => {
    const assignments = [...page.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    for (const value of assignments) assert.equal(value, "''", `innerHTML = ${value}`);
  });
});
