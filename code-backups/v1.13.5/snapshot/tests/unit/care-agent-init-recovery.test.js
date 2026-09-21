'use strict';

/**
 * Unit Tests — care-agent.html must never silently swallow a typed
 * message, and must give an actionable error (not a dead end) when
 * starting the conversation fails.
 *
 * Written to pin the frontend contract (static-content pattern — no
 * DOM/browser runner available in this sandbox, same as
 * care-agent-procedure-chips-ui.test.js).
 *
 * Reported bug (screenshot): the page showed "Something went wrong
 * starting this conversation. Please refresh and try again." with no way
 * to recover except a manual page reload, and the real cause (e.g. an
 * expired login session vs. a genuine network/server error) was always
 * hidden behind the same generic text. Separately, sendMessage() had
 * `if (!message || !state.sessionId) return;` — if the initial session
 * failed to start, typing anything and hitting Send did *nothing at all*,
 * with zero feedback. That is what made it "a non-starter in the
 * process": the conversation could get stuck with no way forward and no
 * indication why.
 *
 * Run: node --test tests/unit/care-agent-init-recovery.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../care-agent.html'), 'utf8');

describe('Starting the conversation is retryable and its failure is diagnosable', () => {
  test('session-start logic is a reusable function, not inlined only in init()', () => {
    assert.match(html, /async function startConversation\s*\(/);
  });

  test('init() uses it', () => {
    assert.match(html, /await startConversation\(\)/);
  });

  test('an expired login session is distinguished from a generic failure', () => {
    assert.match(html, /session expired|log in again/i);
  });

  test('a generic start failure offers a retry action, not just a static "refresh the page" instruction', () => {
    assert.match(html, /Try again/);
    assert.match(html, /addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{[\s\S]{0,200}startConversation\(\)/);
  });
});

describe('sendMessage() never silently discards what the patient typed', () => {
  test('the early-return guard no longer drops input just because sessionId is missing', () => {
    // The old bug: `if (!message || !state.sessionId) return;` silently
    // no-ops. The fix must not early-return on a missing sessionId without
    // at least attempting recovery.
    assert.doesNotMatch(html, /if\s*\(!message\s*\|\|\s*!state\.sessionId\)\s*return;/);
  });

  test('sendMessage() shows the user\'s own bubble even before a session exists', () => {
    const fnStart = html.indexOf('async function sendMessage(');
    const fnBody = html.slice(fnStart, fnStart + 1200);
    const addBubbleIdx = fnBody.indexOf("addBubble('user'");
    const sessionCheckIdx = fnBody.indexOf('state.sessionId');
    assert.notEqual(addBubbleIdx, -1, 'sendMessage must still show what the patient typed');
    assert.ok(addBubbleIdx < sessionCheckIdx || fnBody.match(/if\s*\(!state\.sessionId\)/),
      'the user\'s message must never vanish with no visible trace');
  });

  test('sendMessage() attempts to recover the session rather than giving up silently', () => {
    const fnStart = html.indexOf('async function sendMessage(');
    const fnBody = html.slice(fnStart, fnStart + 1200);
    assert.match(fnBody, /startConversation\(\)/, 'must try to re-establish a session before failing');
  });
});
