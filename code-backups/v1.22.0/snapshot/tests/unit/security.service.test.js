/**
 * Unit Tests — Security Service
 * Uses Node.js built-in test runner (node:test + node:assert).
 * No external dependencies required.
 *
 * Run: node --test tests/unit/security.service.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// ──────────────────────────────────────────────────────────
// Patch module cache: inject a fake 'pg' and database module
// BEFORE requiring security.service so the real pg pool
// is never actually connected.
// ──────────────────────────────────────────────────────────

const fakePg = {
  Pool: class FakePool {
    on() {}
    query() { return Promise.resolve({ rows: [], rowCount: 0 }); }
    connect() { return Promise.resolve({ query: () => Promise.resolve({ rows: [] }), release: () => {} }); }
  }
};

// Register fake pg in require cache
try {
  const pgPath = require.resolve('pg');
  require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: fakePg };
} catch (e) {
  // pg not installed — register under a generic key so imports resolve
  require.cache['pg'] = { id: 'pg', filename: 'pg', loaded: true, exports: fakePg };
}

// Register fake database config
const dbPath = path.resolve(__dirname, '../../backend/src/config/database.js');
const fakeDb = {
  query: () => Promise.resolve({ rows: [], rowCount: 0 }),
  transaction: (cb) => cb({ query: () => Promise.resolve({ rows: [] }), release: () => {} }),
  healthCheck: () => Promise.resolve({ status: 'healthy' }),
  pool: { on: () => {} }
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

// Set required env vars before importing the service
process.env.NODE_ENV = 'test';
process.env.TOKEN_SECRET = 'a'.repeat(128);
process.env.ENCRYPTION_KEY = '0'.repeat(64); // 64 hex chars = 32 bytes

// Now safely require the security service
const {
  hashPassword,
  verifyPassword,
  encryptBankingData,
  decryptBankingData,
  sanitizeObject,
  validateEnvironment
} = require('../../backend/src/services/security.service');

// ──────────────────────────────────────────────────────────
// hashPassword / verifyPassword
// ──────────────────────────────────────────────────────────

describe('hashPassword', () => {
  test('returns a non-empty string', async () => {
    const hash = await hashPassword('ValidPass1');
    assert.equal(typeof hash, 'string');
    assert.ok(hash.length > 0);
  });

  test('produces different hashes for the same input (random salt)', async () => {
    const h1 = await hashPassword('ValidPass1');
    const h2 = await hashPassword('ValidPass1');
    assert.notEqual(h1, h2);
  });

  test('throws when password is fewer than 8 characters', async () => {
    await assert.rejects(() => hashPassword('short'), Error);
  });

  test('throws when password is empty', async () => {
    await assert.rejects(() => hashPassword(''), Error);
  });
});

describe('verifyPassword', () => {
  test('returns true for the correct password', async () => {
    const hash = await hashPassword('CorrectPass9');
    const result = await verifyPassword('CorrectPass9', hash);
    assert.equal(result, true);
  });

  test('returns false for an incorrect password', async () => {
    const hash = await hashPassword('CorrectPass9');
    const result = await verifyPassword('WrongPass99', hash);
    assert.equal(result, false);
  });

  test('returns false for an empty password', async () => {
    const hash = await hashPassword('SomePassword1');
    const result = await verifyPassword('', hash);
    assert.equal(result, false);
  });

  test('returns false when hash is malformed', async () => {
    const result = await verifyPassword('anypassword', 'not-a-valid-hash');
    assert.equal(result, false);
  });
});

// ──────────────────────────────────────────────────────────
// encryptBankingData / decryptBankingData
// ──────────────────────────────────────────────────────────

describe('encryptBankingData / decryptBankingData', () => {
  const sampleData = {
    account_number: '12345678901',
    branch_code: '632005',
    account_holder_name: 'John Doe'
  };

  test('encrypt produces a non-empty string', () => {
    const encrypted = encryptBankingData(sampleData);
    assert.equal(typeof encrypted, 'string');
    assert.ok(encrypted.length > 0);
  });

  test('decrypt round-trips the original data', () => {
    const encrypted = encryptBankingData(sampleData);
    const decrypted = decryptBankingData(encrypted);
    assert.deepEqual(decrypted, sampleData);
  });

  test('two encryptions of the same data produce different ciphertexts (random IV)', () => {
    const e1 = encryptBankingData(sampleData);
    const e2 = encryptBankingData(sampleData);
    assert.notEqual(e1, e2);
  });

  test('decrypting a tampered ciphertext throws (AES-GCM auth tag failure)', () => {
    const encrypted = encryptBankingData(sampleData);
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    // AES-256-GCM authentication will reject tampered ciphertext
    assert.throws(() => decryptBankingData(tampered), Error);
  });

  test('decrypting garbage throws (invalid format)', () => {
    // The decrypt function throws on invalid format — this is correct security behavior
    assert.throws(() => decryptBankingData('not-valid-data'), Error);
  });
});

// ──────────────────────────────────────────────────────────
// sanitizeObject
// ──────────────────────────────────────────────────────────

describe('sanitizeObject', () => {
  test('strips script tags from string values', () => {
    const result = sanitizeObject({ name: '<script>alert(1)</script>John' });
    assert.ok(!result.name.includes('<script>'));
    assert.ok(!result.name.includes('</script>'));
  });

  test('passes through plain strings unchanged', () => {
    const result = sanitizeObject({ name: 'John Doe' });
    assert.equal(result.name, 'John Doe');
  });

  test('handles null fields gracefully', () => {
    const result = sanitizeObject({ a: null, c: 'ok' });
    assert.equal(result.c, 'ok');
  });

  test('handles numeric values in object', () => {
    const result = sanitizeObject({ amount: 850 });
    assert.equal(result.amount, 850);
  });
});

// ──────────────────────────────────────────────────────────
// validateEnvironment
// ──────────────────────────────────────────────────────────

describe('validateEnvironment', () => {
  test('does not throw in test mode (non-production)', () => {
    process.env.NODE_ENV = 'test';
    assert.doesNotThrow(() => validateEnvironment());
  });

  test('throws in production mode when TOKEN_SECRET is missing', () => {
    const savedEnv = process.env.NODE_ENV;
    const savedToken = process.env.TOKEN_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.TOKEN_SECRET;

    assert.throws(() => validateEnvironment(), Error);

    // Restore
    process.env.NODE_ENV = savedEnv;
    process.env.TOKEN_SECRET = savedToken;
  });
});
