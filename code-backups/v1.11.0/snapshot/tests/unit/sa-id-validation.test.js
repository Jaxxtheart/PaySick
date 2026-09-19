'use strict';

/**
 * Unit Tests — South African ID number validation (server-side)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Gap this closes:
 *   register.html has done a full Luhn check since v1.x, but the server
 *   (POST /api/users/register) only ever asserted /^\d{13}$/. Client-side
 *   validation is advisory — anyone posting straight at the API could register
 *   with a structurally impossible ID such as 0000000000000, and the users table
 *   only constrains LENGTH(sa_id_number) = 13.
 *
 *   claude/verify-full-id-number-DzmMD implemented the richer checks (embedded
 *   date-of-birth, future-date rejection, Luhn checksum) but only in
 *   onboarding.html, and that page has since moved to collecting the last four
 *   digits only — so the work never reached anywhere that enforces it.
 *
 * The validator lives in backend/src/utils/sa-id.js so it is testable without a
 * DB, an HTTP server, or a browser.
 *
 * Run: node --test tests/unit/sa-id-validation.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateSAID,
  extractDateOfBirth,
  resolveBirthYear,
} = require('../../backend/src/utils/sa-id');

/**
 * Builds a structurally valid SA ID by computing the correct Luhn check digit
 * for the 12 given digits, so fixtures cannot silently rot.
 */
function withCheckDigit(first12) {
  assert.equal(first12.length, 12, 'fixture must supply 12 digits');
  const digits = first12.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      sum += digits[i];
    } else {
      let d = digits[i] * 2;
      if (d > 9) d -= 9;
      sum += d;
    }
  }
  return first12 + String((10 - (sum % 10)) % 10);
}

// 1990-01-01, sequence 5009, SA citizen
const VALID_ID = withCheckDigit('900101500908');

// ─── Shape ───────────────────────────────────────────────────────────────────

describe('validateSAID — shape', () => {
  test('accepts a well-formed 13-digit ID', () => {
    const result = validateSAID(VALID_ID);
    assert.equal(result.valid, true, result.error);
  });

  test('rejects a non-string input', () => {
    assert.equal(validateSAID(undefined).valid, false);
    assert.equal(validateSAID(null).valid, false);
    assert.equal(validateSAID(9001015009087).valid, false);
  });

  test('rejects fewer than 13 digits', () => {
    assert.equal(validateSAID('900101500').valid, false);
  });

  test('rejects more than 13 digits', () => {
    assert.equal(validateSAID(VALID_ID + '4').valid, false);
  });

  test('rejects non-numeric characters', () => {
    assert.equal(validateSAID('90010150090AB').valid, false);
  });

  test('tolerates surrounding whitespace and internal spaces', () => {
    const spaced = `  ${VALID_ID.slice(0, 6)} ${VALID_ID.slice(6)}  `;
    assert.equal(validateSAID(spaced).valid, true);
  });
});

// ─── Embedded date of birth ──────────────────────────────────────────────────

describe('validateSAID — embedded date of birth', () => {
  test('rejects month 00', () => {
    const result = validateSAID(withCheckDigit('900001500908'));
    assert.equal(result.valid, false);
    assert.match(result.error, /date of birth/i);
  });

  test('rejects month 13', () => {
    assert.equal(validateSAID(withCheckDigit('901301500908')).valid, false);
  });

  test('rejects day 00', () => {
    assert.equal(validateSAID(withCheckDigit('900100500908')).valid, false);
  });

  test('rejects 31 February', () => {
    assert.equal(validateSAID(withCheckDigit('900231500908')).valid, false);
  });

  test('rejects an all-zero ID even when the checksum works out', () => {
    assert.equal(validateSAID(withCheckDigit('000000000000')).valid, false);
  });

  test('rejects a date of birth later in the current year', (t) => {
    // The century pivot is derived from the current year, so a two-digit year
    // can never resolve to a future *year* — it falls back a century instead.
    // The reachable future case is a date later in the current year.
    const now = new Date();
    const future = new Date(now.getFullYear(), 11, 31); // 31 December, this year
    if (future <= now) {
      t.skip('no later date remains in the current year');
      return;
    }
    const yy = String(future.getFullYear() % 100).padStart(2, '0');
    const result = validateSAID(withCheckDigit(`${yy}1231500908`));
    assert.equal(result.valid, false);
    assert.match(result.error, /future/i);
  });

  test('extractDateOfBirth returns the encoded date for a valid ID', () => {
    const dob = extractDateOfBirth(VALID_ID);
    assert.equal(dob.getFullYear(), 1990);
    assert.equal(dob.getMonth(), 0);
    assert.equal(dob.getDate(), 1);
  });

  test('extractDateOfBirth returns null for an invalid ID', () => {
    assert.equal(extractDateOfBirth('not-an-id'), null);
  });
});

// ─── Century pivot ───────────────────────────────────────────────────────────

describe('resolveBirthYear — the century pivot does not rot', () => {
  const now = new Date(2026, 7, 1); // 2026-08-01

  test('a two-digit year at or before the current year is this century', () => {
    assert.equal(resolveBirthYear(24, now), 2024);
    assert.equal(resolveBirthYear(26, now), 2026);
    assert.equal(resolveBirthYear(0, now), 2000);
  });

  test('a two-digit year after the current year falls back a century', () => {
    assert.equal(resolveBirthYear(27, now), 1927);
    assert.equal(resolveBirthYear(90, now), 1990);
    assert.equal(resolveBirthYear(99, now), 1999);
  });

  test('the pivot moves with time rather than sitting at a hardcoded year', () => {
    const later = new Date(2031, 0, 1);
    // 2028 has not happened as of 2026, but has as of 2031.
    assert.equal(resolveBirthYear(28, now), 1928);
    assert.equal(resolveBirthYear(28, later), 2028);
  });
});

// ─── Citizenship digit ───────────────────────────────────────────────────────

describe('validateSAID — citizenship digit', () => {
  test('accepts citizenship digit 0 (SA citizen)', () => {
    assert.equal(validateSAID(withCheckDigit('900101500908')).valid, true);
  });

  test('accepts citizenship digit 1 (permanent resident)', () => {
    assert.equal(validateSAID(withCheckDigit('900101500918')).valid, true);
  });

  test('rejects any other citizenship digit', () => {
    const result = validateSAID(withCheckDigit('900101500928'));
    assert.equal(result.valid, false);
    assert.match(result.error, /citizen/i);
  });
});

// ─── Luhn checksum ───────────────────────────────────────────────────────────

describe('validateSAID — Luhn checksum', () => {
  test('rejects an ID whose check digit is wrong', () => {
    const wrong = VALID_ID.slice(0, 12) + String((Number(VALID_ID[12]) + 1) % 10);
    const result = validateSAID(wrong);
    assert.equal(result.valid, false);
    assert.match(result.error, /checksum|check digit/i);
  });

  test('every check digit other than the correct one is rejected', () => {
    const correct = Number(VALID_ID[12]);
    for (let d = 0; d <= 9; d++) {
      const candidate = VALID_ID.slice(0, 12) + String(d);
      assert.equal(
        validateSAID(candidate).valid,
        d === correct,
        `check digit ${d} should be ${d === correct ? 'accepted' : 'rejected'}`
      );
    }
  });
});

// ─── Cross-validation against a declared date of birth ───────────────────────

describe('validateSAID — cross-check against declared date_of_birth', () => {
  test('accepts a matching declared date of birth', () => {
    const result = validateSAID(VALID_ID, { dateOfBirth: '1990-01-01' });
    assert.equal(result.valid, true, result.error);
  });

  test('rejects a mismatched declared date of birth', () => {
    const result = validateSAID(VALID_ID, { dateOfBirth: '1991-06-15' });
    assert.equal(result.valid, false);
    assert.match(result.error, /date of birth/i);
  });

  test('ignores an absent or unparseable declared date of birth', () => {
    assert.equal(validateSAID(VALID_ID, {}).valid, true);
    assert.equal(validateSAID(VALID_ID, { dateOfBirth: '' }).valid, true);
    assert.equal(validateSAID(VALID_ID, { dateOfBirth: 'tomorrow' }).valid, true);
  });
});

// ─── The registration route actually calls it ────────────────────────────────

describe('POST /api/users/register enforces full SA ID validation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../backend/src/routes/users.js'),
    'utf8'
  );

  test('users.js imports the validator', () => {
    assert.match(source, /require\(['"]\.\.\/utils\/sa-id['"]\)/);
  });

  test('users.js no longer relies on the bare 13-digit regex alone', () => {
    assert.ok(
      source.includes('validateSAID('),
      'registration must call validateSAID rather than only testing /^\\d{13}$/'
    );
  });
});
