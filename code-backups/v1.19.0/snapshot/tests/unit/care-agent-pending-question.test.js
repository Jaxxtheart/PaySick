'use strict';

/**
 * Unit Tests: Care Agent holds a signed-out visitor's question through login
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Bug (v1.13.0): a signed-out visitor types a question into the homepage's
 * "Ask PaySick" bar, lands on care-agent.html?q=..., is told to log in, and
 * login.html then redirects by role to the dashboard (or onboarding). The
 * typed question is lost.
 *
 * Fix: js/care-agent-pending.js holds the question in localStorage for up to
 * 24 hours (long enough to register and verify an email), and it is cleared
 * the moment it is used.
 *   - care-agent.html saves it when signed out, and uses it once signed in.
 *   - login.html and onboarding.html send a patient with a held question back
 *     to care-agent.html instead of the dashboard. There is no ?next= URL
 *     parameter, so this adds no open-redirect surface.
 *
 * Run: node --test tests/unit/care-agent-pending-question.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const read = (f) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _data: data,
  };
}

const HOUR = 60 * 60 * 1000;

describe('js/care-agent-pending.js', () => {
  const pending = require(path.join(REPO_ROOT, 'js/care-agent-pending.js'));

  test('save then take returns the question once, then nothing', () => {
    const s = memoryStorage();
    pending.save(s, '  I need a knee replacement  ', 0);
    assert.equal(pending.take(s, 1000), 'I need a knee replacement');
    assert.equal(pending.take(s, 2000), null);
  });

  test('peek returns the question without clearing it', () => {
    const s = memoryStorage();
    pending.save(s, 'dental implants', 0);
    assert.equal(pending.peek(s, 1000), 'dental implants');
    assert.equal(pending.peek(s, 2000), 'dental implants');
  });

  test('a question survives 23 hours but expires after 24', () => {
    const s = memoryStorage();
    pending.save(s, 'MRI scan', 0);
    assert.equal(pending.peek(s, 23 * HOUR), 'MRI scan');
    assert.equal(pending.peek(s, 24 * HOUR + 1), null);
    assert.equal(s._data.size, 0, 'an expired question is removed from storage');
  });

  test('ignores an empty question and caps length at 500 characters', () => {
    const s = memoryStorage();
    pending.save(s, '   ', 0);
    assert.equal(pending.peek(s, 0), null);
    pending.save(s, 'x'.repeat(900), 0);
    assert.equal(pending.peek(s, 0).length, 500);
  });

  test('corrupt stored data is treated as no question and cleared', () => {
    const s = memoryStorage();
    s.setItem(pending.STORAGE_KEY, '{not json');
    assert.equal(pending.peek(s, 0), null);
    assert.equal(s._data.size, 0);
  });

  test('clear removes a held question', () => {
    const s = memoryStorage();
    pending.save(s, 'physio', 0);
    pending.clear(s);
    assert.equal(pending.peek(s, 0), null);
  });

  test('never throws when storage is unavailable', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => pending.save(broken, 'q', 0));
    assert.equal(pending.peek(broken, 0), null);
    assert.equal(pending.take(broken, 0), null);
  });
});

describe('care-agent.html holds and restores the question', () => {
  const page = read('care-agent.html');

  test('loads the pending-question module', () => {
    assert.match(page, /<script src="js\/care-agent-pending.js"><\/script>/);
  });

  test('signed out: saves the ?q= question and tells the visitor it is kept', () => {
    const lockedBranch = page.match(/if \(!isAuthenticated\(\)\) \{[\s\S]*?return;\s*\}/);
    assert.ok(lockedBranch, 'expected the signed-out branch of init()');
    assert.match(lockedBranch[0], /PaySickCareAgentPending\.save\(/);
    assert.match(page, /id="saved-question"/);
  });

  test('signed in: uses the URL question, else the held one, and clears it', () => {
    const init = page.match(/async function init\(\) \{[\s\S]*?\n {8}\}/);
    assert.ok(init);
    assert.match(init[0], /PaySickCareAgentPending\.take\(/);
  });

  test('a held question is put in the message box for review, never auto-sent (shared devices)', () => {
    const init = page.match(/async function init\(\) \{[\s\S]*?\n {8}\}/)[0];
    assert.match(init, /getElementById\('message-input'\)\.value = held/);
    assert.doesNotMatch(init, /sendMessage\(held\)/);
    assert.doesNotMatch(init, /\? urlQuery : held/, 'the held question must not be merged into the auto-send path');
  });
});

describe('login.html and onboarding.html return to the Care Agent', () => {
  test('login.html loads the module and sends a patient with a held question to care-agent.html', () => {
    const login = read('login.html');
    assert.match(login, /<script src="js\/care-agent-pending.js"><\/script>/);
    const fn = login.match(/function redirectByRole\(role\) \{[\s\S]*?\n {8}\}/);
    assert.ok(fn);
    assert.match(fn[0], /PaySickCareAgentPending\.peek\(/);
    assert.match(fn[0], /care-agent\.html/);
  });

  test('login.html still sends patients who have not finished onboarding to onboarding first', () => {
    const fn = read('login.html').match(/function redirectByRole\(role\) \{[\s\S]*?\n {8}\}/)[0];
    assert.match(fn, /onboarding\.html/);
  });

  test('login.html has no ?next= redirect parameter (no open redirect)', () => {
    assert.doesNotMatch(read('login.html'), /get\(['"]next['"]\)/);
  });

  test('onboarding.html sends a patient with a held question to care-agent.html when finished', () => {
    const onboarding = read('onboarding.html');
    assert.match(onboarding, /<script src="js\/care-agent-pending.js"><\/script>/);
    const fn = onboarding.match(/function goToDashboard\(\) \{[\s\S]*?\n {8}\}/);
    assert.ok(fn);
    assert.match(fn[0], /PaySickCareAgentPending\.peek\(/);
    assert.match(fn[0], /care-agent\.html/);
  });
});
