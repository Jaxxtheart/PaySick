'use strict';

/**
 * Unit Tests — Reset Token Race Condition Fix
 *
 * Problem:
 *   The forgot-password handler runs two separate DB calls — an UPDATE (invalidate old
 *   tokens) and an INSERT (new token) — outside any transaction. If two concurrent
 *   requests arrive for the same user:
 *
 *     T+0  Request A: UPDATE (no-op — no existing tokens yet)
 *     T+1  Request B: UPDATE (no-op — same)
 *     T+2  Request A: INSERT token-A  ← committed to DB
 *     T+3  Request B: UPDATE marks token-A as used, INSERT token-B
 *     T+4  User clicks first email → token-A is used=true → "invalid or already used"
 *
 *   The common sequential variant (user clicks "Resend" because email was slow):
 *     Request A succeeds, sends email-A.
 *     Request B invalidates token-A, sends email-B.
 *     User clicks email-A → "invalid or already used."
 *
 * Fixes applied:
 *   1. migration 008_reset_token_unique.sql — adds a partial unique index
 *      `CREATE UNIQUE INDEX ... ON password_reset_tokens (user_id) WHERE used = false`
 *      The DB now enforces at most one active (unused) token per user at all times.
 *      A concurrent INSERT while another unused token exists is rejected immediately.
 *
 *   2. users.js — the UPDATE + INSERT are now wrapped in a single transaction() call.
 *      The SELECT ... FOR UPDATE row-level lock inside the transaction ensures concurrent
 *      requests serialize correctly at READ COMMITTED isolation (PostgreSQL default).
 *
 * Run: node --test tests/unit/reset-token-race.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT    = path.resolve(__dirname, '../../');
const MIGRATIONS   = path.join(REPO_ROOT, 'backend/src/migrations');
const USERS_ROUTES = path.join(REPO_ROOT, 'backend/src/routes/users.js');
const MIGRATION_FILE = path.join(MIGRATIONS, '008_reset_token_unique.sql');

// ─── Migration: partial unique index ─────────────────────────────────────────

describe('migration 008_reset_token_unique.sql', () => {

  test('migration file exists at backend/src/migrations/008_reset_token_unique.sql', () => {
    assert.ok(
      fs.existsSync(MIGRATION_FILE),
      '008_reset_token_unique.sql must exist in backend/src/migrations/'
    );
  });

  test('migration creates a partial unique index on (user_id) WHERE used = false', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.ok(
      /CREATE\s+UNIQUE\s+INDEX/i.test(sql),
      'migration must contain CREATE UNIQUE INDEX'
    );
    assert.ok(
      /password_reset_tokens/i.test(sql),
      'migration must reference password_reset_tokens'
    );
    assert.ok(
      /user_id/i.test(sql),
      'unique index must be on the user_id column'
    );
    assert.ok(
      /WHERE\s+used\s*=\s*false/i.test(sql),
      'unique index must be a partial index WHERE used = false'
    );
  });

  test('migration is safe to re-run (uses IF NOT EXISTS or CREATE INDEX ... IF NOT EXISTS)', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.ok(
      /IF\s+NOT\s+EXISTS/i.test(sql),
      'migration must be idempotent — use CREATE UNIQUE INDEX IF NOT EXISTS'
    );
  });

});

// ─── users.js: transaction wrapping ──────────────────────────────────────────

describe('users.js — forgot-password token ops wrapped in a transaction', () => {

  test('the UPDATE (invalidate) and INSERT (new token) are inside a transaction() call', () => {
    const src = fs.readFileSync(USERS_ROUTES, 'utf8');

    // Isolate the forgot-password handler
    const startIdx = src.indexOf("POST /api/users/forgot-password");
    const endIdx   = src.indexOf("POST /api/users/reset-password", startIdx);
    assert.ok(startIdx !== -1, 'could not find forgot-password section');
    assert.ok(endIdx   !== -1, 'could not find reset-password section');
    const section = src.slice(startIdx, endIdx);

    assert.ok(
      section.includes('transaction('),
      'forgot-password must wrap the UPDATE + INSERT in a transaction() call to prevent race conditions'
    );
  });

  test('the UPDATE (invalidate) is inside the transaction block', () => {
    const src = fs.readFileSync(USERS_ROUTES, 'utf8');

    // Find the transaction block in forgot-password
    const startIdx  = src.indexOf("POST /api/users/forgot-password");
    const endIdx    = src.indexOf("POST /api/users/reset-password", startIdx);
    const section   = src.slice(startIdx, endIdx);

    const txStart   = section.indexOf('transaction(');
    const txEnd     = section.indexOf('});', txStart);
    assert.ok(txStart !== -1, 'forgot-password must have a transaction() call');
    const txBody = section.slice(txStart, txEnd);

    assert.ok(
      txBody.includes('UPDATE password_reset_tokens') ||
      txBody.includes("SET used = true"),
      'the UPDATE (invalidate) must be inside the transaction block'
    );
  });

  test('the INSERT of the new token is inside the transaction block', () => {
    const src = fs.readFileSync(USERS_ROUTES, 'utf8');

    const startIdx = src.indexOf("POST /api/users/forgot-password");
    const endIdx   = src.indexOf("POST /api/users/reset-password", startIdx);
    const section  = src.slice(startIdx, endIdx);

    const txStart  = section.indexOf('transaction(');
    const txEnd    = section.indexOf('});', txStart);
    const txBody   = section.slice(txStart, txEnd);

    assert.ok(
      txBody.includes('INSERT INTO password_reset_tokens'),
      'the INSERT of the new token must be inside the transaction block'
    );
  });

});
