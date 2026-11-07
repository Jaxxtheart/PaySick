/**
 * Unit Tests — care-agent.html value-chain screens (v1.18.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Static checks on the page that renders the plan's screens: the journey
 * bar, the account home with the agent's decisions and authority badges,
 * the consent-gated proposal card, the detail form for actions that need
 * the patient's input (replacing window.prompt, which the page cannot rely
 * on), the optional income fields that let Shield Gate 2 run, and the
 * "What the agent did" log.
 *
 * Run: node --test tests/unit/care-agent-account-ui.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '../../care-agent.html'), 'utf8');
const { JOURNEY_STAGES } = require('../../backend/src/services/care-agent-actions.service');

function fn(name) {
  const start = page.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `expected function ${name}`);
  const next = page.slice(start + 10).search(/\n        (async )?function /);
  return next === -1 ? page.slice(start) : page.slice(start, start + 10 + next);
}

describe('journey bar', () => {
  test('has one step per value-chain stage, in order', () => {
    assert.match(page, /id="journey-tracker"/);
    const stages = [...page.matchAll(/data-stage="([a-z_]+)"/g)].map((m) => m[1]);
    assert.deepEqual(stages, JOURNEY_STAGES);
  });

  test('is updated from the account journey stage', () => {
    assert.match(fn('renderJourney'), /journeyStage|stage/);
  });
});

describe('account home', () => {
  test('loads the account after the conversation starts and after submitting', () => {
    assert.match(fn('init'), /loadAccount\(\)/);
    assert.match(fn('approveAndExecute'), /loadAccount\(\)/);
  });

  test("shows each of the agent's decisions with its reason code and rationale", () => {
    const render = fn('renderAccount');
    assert.match(render, /agent-decision/);
    assert.match(render, /reasonCode/);
    assert.match(render, /rationale/);
  });

  test('badges every action with its authority tier', () => {
    assert.match(page, /\.badge-autonomous/);
    assert.match(page, /\.badge-patient_consent/);
    assert.match(page, /\.badge-human_review/);
    assert.match(page, /\.badge-prohibited/);
    for (const label of ['Agent does it', 'You approve', 'Team decides', 'Not in chat']) {
      assert.ok(page.includes(label), label);
    }
  });
});

describe('proposal card', () => {
  const render = fn('renderProposal');

  test('shows what will change before asking', () => {
    assert.match(render, /effect/);
    assert.match(render, /Will change/);
  });

  test('needs its own consent box ticked before confirming', () => {
    assert.match(render, /type = 'checkbox'/);
    const confirmAt = render.indexOf('confirmAction');
    const checkAt = render.indexOf('.checked');
    assert.ok(checkAt !== -1 && confirmAt !== -1 && checkAt < confirmAt, 'checks the box before calling confirmAction');
  });

  test('can be declined', () => {
    assert.match(render, /declineAction/);
  });

  test('disables its buttons while confirming, so a double tap sends one request', () => {
    assert.match(render, /disabled = true/);
  });
});

describe('detail form for actions that need input', () => {
  test('builds inputs from the action definition and proposes the action', () => {
    const render = fn('renderActionForm');
    assert.match(render, /inputs/);
    assert.match(render, /proposeAction/);
  });

  test('no longer relies on window.prompt', () => {
    assert.doesNotMatch(page, /window\.prompt\(/);
  });
});

describe('message replies carry actions', () => {
  test('sendMessage renders proposals and suggested actions', () => {
    const send = fn('sendMessage');
    assert.match(send, /handleActionResults\(res\.proposals\)/);
    assert.match(send, /suggestedAction/);
  });

  test('a refusal is explained and only links to a page on this site', () => {
    const handle = fn('handleActionResults');
    assert.match(handle, /refused/);
    assert.match(page, /function safeRedirect\(/);
    assert.match(fn('safeRedirect'), /\\\.html/);
  });
});

describe('income on the summary card', () => {
  test('offers optional income and obligations fields', () => {
    assert.match(page, /id="summary-income"/);
    assert.match(page, /id="summary-obligations"/);
  });

  test('sends them with the confirmation so Shield Gate 2 can run', () => {
    assert.match(fn('confirmSummary'), /monthlyIncome/);
    assert.match(fn('confirmSummary'), /monthlyObligations/);
  });
});

describe('what the agent did', () => {
  test('has a log the patient can open', () => {
    assert.match(page, /id="decision-log"/);
    assert.match(fn('showDecisionLog'), /getDecisions/);
  });

  test('tags each line by who acted', () => {
    assert.match(fn('showDecisionLog'), /tier/);
  });
});

describe('safe rendering', () => {
  test('never writes data through innerHTML (only clears with it)', () => {
    const assignments = [...page.matchAll(/innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    for (const value of assignments) assert.equal(value, "''", `innerHTML = ${value}`);
  });
});
