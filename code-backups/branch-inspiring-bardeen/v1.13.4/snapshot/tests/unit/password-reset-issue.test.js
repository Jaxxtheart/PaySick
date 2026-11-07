/**
 * Unit Tests — Password reset token issuance
 * Node.js built-in test runner. No DB, no network — deps are injected.
 * Written BEFORE the fix (test-first, per CLAUDE.md).
 *
 * Bug: forgot-password force-invalidated ALL previously-issued unused tokens on
 * every request. A user who requested a link twice (or whose request double-fired)
 * would find the FIRST email's link already dead — "Reset link is invalid or has
 * already been used." Tokens are already single-use and 1-hour-expiring, so the
 * blanket pre-invalidation is both unnecessary and the cause of the failure.
 *
 * This locks the fixed contract: issuing a token INSERTs a single-use token and
 * does NOT invalidate previously-issued tokens.
 *
 * Run: node --test tests/unit/password-reset-issue.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { issueResetToken } = require('../../backend/src/services/password-reset.service');

/** Fake query recorder: captures every SQL string + params issued. */
function makeQueryRecorder() {
  const calls = [];
  const query = async (text, params) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 0 };
  };
  return { query, calls };
}

describe('issueResetToken', () => {
  test('inserts exactly one token and sends the email with a 64-char raw token', async () => {
    const { query, calls } = makeQueryRecorder();
    let emailed = null;
    const sendPasswordResetEmail = async (to, name, rawToken) => { emailed = { to, name, rawToken }; };

    await issueResetToken(
      { query, sendPasswordResetEmail },
      { user_id: 'u-1', email: 'a@b.com', full_name: 'Ada Lovelace' }
    );

    const inserts = calls.filter((c) => /INSERT INTO password_reset_tokens/i.test(c.text));
    assert.equal(inserts.length, 1, 'exactly one token INSERT');

    assert.ok(emailed, 'email was sent');
    assert.equal(emailed.to, 'a@b.com');
    assert.equal(emailed.rawToken.length, 64, 'raw token is 64 hex chars');
  });

  test('does NOT invalidate previously-issued unused tokens (the bug)', async () => {
    const { query, calls } = makeQueryRecorder();
    await issueResetToken(
      { query, sendPasswordResetEmail: async () => {} },
      { user_id: 'u-1', email: 'a@b.com', full_name: 'Ada' }
    );

    const invalidations = calls.filter(
      (c) => /UPDATE\s+password_reset_tokens/i.test(c.text) && /used\s*=\s*true/i.test(c.text)
    );
    assert.equal(invalidations.length, 0, 'must not blanket-invalidate prior tokens');
  });

  test('stores the sha256 hash of the raw token, never the raw token itself', async () => {
    const { query, calls } = makeQueryRecorder();
    let rawToken = null;
    await issueResetToken(
      { query, sendPasswordResetEmail: async (to, name, t) => { rawToken = t; } },
      { user_id: 'u-1', email: 'a@b.com', full_name: 'Ada' }
    );

    const insert = calls.find((c) => /INSERT INTO password_reset_tokens/i.test(c.text));
    const storedHash = insert.params.find((p) => typeof p === 'string' && p.length === 64 && /^[0-9a-f]+$/.test(p));
    const expected = crypto.createHash('sha256').update(rawToken).digest('hex');
    assert.equal(storedHash, expected, 'stored value is the hash, not the raw token');
    assert.notEqual(storedHash, rawToken, 'raw token must not be stored');
  });

  test('sets an expiry in the future (default ~1 hour)', async () => {
    const { query, calls } = makeQueryRecorder();
    const before = Date.now();
    await issueResetToken(
      { query, sendPasswordResetEmail: async () => {} },
      { user_id: 'u-1', email: 'a@b.com', full_name: 'Ada' }
    );
    const insert = calls.find((c) => /INSERT INTO password_reset_tokens/i.test(c.text));
    const expiry = insert.params.find((p) => p instanceof Date);
    assert.ok(expiry instanceof Date, 'an expires_at Date param is present');
    assert.ok(expiry.getTime() > before, 'expiry is in the future');
  });
});
