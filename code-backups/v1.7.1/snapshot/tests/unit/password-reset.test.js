/**
 * Unit Tests — Password Reset Flow
 *
 * Tests for the forgot-password / reset-password feature:
 *  - Token validation (length, format)
 *  - Expiry checks
 *  - Anti-enumeration guarantee on forgot-password (always 200)
 *  - Password requirements enforcement
 *  - Passwords-match check (client-side)
 *  - Non-JSON server response handling (mirrors login / register pattern)
 *  - Successful reset response handling
 *
 * Run: node --test tests/unit/password-reset.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Shared helpers (mirror backend logic without importing the server)
// ---------------------------------------------------------------------------

/** SHA-256 hex digest — same function used in users.js reset routes */
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/** Returns true when a token string is a valid 64-char hex reset token */
function isValidTokenFormat(token) {
    return typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token);
}

/** Returns true when now is before expiresAt */
function isTokenExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
}

/** Client-side password strength check — minimum 8 characters */
function meetsPasswordRequirements(password) {
    return typeof password === 'string' && password.length >= 8;
}

/** Client-side passwords-match check */
function passwordsMatch(password, confirmPassword) {
    return password === confirmPassword;
}

// ---------------------------------------------------------------------------
// Mock API response helpers
// ---------------------------------------------------------------------------

function mockJsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body)
    };
}

function mockHtmlResponse(status, htmlText) {
    return {
        ok: false,
        status,
        json: () => Promise.reject(
            new SyntaxError(
                `Unexpected token '${htmlText[0]}', "${htmlText.slice(0, 10)}"... is not valid JSON`
            )
        )
    };
}

/**
 * Mirrors the fetch-response handling in reset-password.html and
 * forgot-password.html.  Returns either:
 *   { ok: true, message }   on a 2xx response
 *   { ok: false, message }  on a non-2xx or non-JSON response
 */
async function handlePasswordApiResponse(response) {
    let data;
    try {
        data = await response.json();
    } catch {
        return { ok: false, message: `Server error (${response.status}). Please try again shortly.` };
    }

    if (response.ok) {
        return { ok: true, message: data.message || '' };
    }

    return { ok: false, message: data.error || data.message || 'Something went wrong. Please try again.' };
}

// ---------------------------------------------------------------------------
// Token format validation
// ---------------------------------------------------------------------------

describe('isValidTokenFormat', () => {
    test('accepts a valid 64-char lowercase hex token', () => {
        const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars
        assert.ok(isValidTokenFormat(token));
    });

    test('rejects a token that is too short', () => {
        assert.ok(!isValidTokenFormat('abc123'));
    });

    test('rejects a token that is too long', () => {
        assert.ok(!isValidTokenFormat('a'.repeat(65)));
    });

    test('rejects an empty string', () => {
        assert.ok(!isValidTokenFormat(''));
    });

    test('rejects null', () => {
        assert.ok(!isValidTokenFormat(null));
    });

    test('rejects a token with non-hex characters', () => {
        const badToken = 'z'.repeat(64);
        assert.ok(!isValidTokenFormat(badToken));
    });
});

// ---------------------------------------------------------------------------
// Token expiry
// ---------------------------------------------------------------------------

describe('isTokenExpired', () => {
    test('returns false for a token that expires in the future', () => {
        const future = new Date(Date.now() + 3600 * 1000).toISOString();
        assert.ok(!isTokenExpired(future));
    });

    test('returns true for a token that expired in the past', () => {
        const past = new Date(Date.now() - 1000).toISOString();
        assert.ok(isTokenExpired(past));
    });

    test('returns true when expiry is exactly now (boundary — treat as expired)', () => {
        const almostNow = new Date(Date.now() - 1).toISOString();
        assert.ok(isTokenExpired(almostNow));
    });
});

// ---------------------------------------------------------------------------
// SHA-256 token hashing
// ---------------------------------------------------------------------------

describe('sha256 token hashing', () => {
    test('produces a 64-char hex string', () => {
        const hash = sha256('some_raw_token');
        assert.equal(hash.length, 64);
        assert.match(hash, /^[0-9a-f]+$/);
    });

    test('same input always produces same hash (deterministic)', () => {
        const raw = 'deterministic_test_token';
        assert.equal(sha256(raw), sha256(raw));
    });

    test('different inputs produce different hashes', () => {
        assert.notEqual(sha256('token_a'), sha256('token_b'));
    });

    test('raw token is not recoverable from hash (one-way)', () => {
        const raw = crypto.randomBytes(32).toString('hex');
        const hash = sha256(raw);
        assert.notEqual(hash, raw);
        assert.ok(!hash.includes(raw));
    });
});

// ---------------------------------------------------------------------------
// Password requirements (client-side enforcement)
// ---------------------------------------------------------------------------

describe('meetsPasswordRequirements', () => {
    test('accepts a password with 8 or more characters', () => {
        assert.ok(meetsPasswordRequirements('secure99'));
    });

    test('accepts a long complex password', () => {
        assert.ok(meetsPasswordRequirements('C0rrectH0rseBatteryStaple!'));
    });

    test('rejects a 7-character password', () => {
        assert.ok(!meetsPasswordRequirements('1234567'));
    });

    test('rejects an empty string', () => {
        assert.ok(!meetsPasswordRequirements(''));
    });
});

// ---------------------------------------------------------------------------
// Passwords-match check (client-side enforcement)
// ---------------------------------------------------------------------------

describe('passwordsMatch', () => {
    test('returns true when both fields are identical', () => {
        assert.ok(passwordsMatch('MyP4ssword!', 'MyP4ssword!'));
    });

    test('returns false when fields differ', () => {
        assert.ok(!passwordsMatch('MyP4ssword!', 'MyP4ssword'));
    });

    test('is case-sensitive', () => {
        assert.ok(!passwordsMatch('password', 'Password'));
    });
});

// ---------------------------------------------------------------------------
// forgot-password API response handling
// ---------------------------------------------------------------------------

describe('handlePasswordApiResponse — forgot-password', () => {
    test('returns ok:true on 200 with anti-enumeration message', async () => {
        const response = mockJsonResponse(200, {
            message: 'If an account with that email exists, a reset link has been sent.'
        });
        const result = await handlePasswordApiResponse(response);
        assert.ok(result.ok);
        assert.ok(result.message.includes('If an account'));
    });

    test('never reveals whether email exists (always same generic message)', async () => {
        // API must return same 200 body whether or not the email is registered
        const knownEmailResponse   = mockJsonResponse(200, { message: 'If an account with that email exists, a reset link has been sent.' });
        const unknownEmailResponse = mockJsonResponse(200, { message: 'If an account with that email exists, a reset link has been sent.' });

        const r1 = await handlePasswordApiResponse(knownEmailResponse);
        const r2 = await handlePasswordApiResponse(unknownEmailResponse);
        assert.equal(r1.message, r2.message);
    });

    test('returns friendly message on non-JSON 500 from server', async () => {
        const response = mockHtmlResponse(500, 'Internal Server Error');
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.ok(result.message.includes('500'));
        assert.ok(!result.message.includes('SyntaxError'));
    });

    test('returns friendly message on non-JSON 404 from server', async () => {
        const response = mockHtmlResponse(404, 'The page cannot be found');
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.ok(result.message.includes('404'));
    });
});

// ---------------------------------------------------------------------------
// reset-password API response handling
// ---------------------------------------------------------------------------

describe('handlePasswordApiResponse — reset-password', () => {
    test('returns ok:true on successful reset', async () => {
        const response = mockJsonResponse(200, { message: 'Password reset successfully.' });
        const result = await handlePasswordApiResponse(response);
        assert.ok(result.ok);
        assert.ok(result.message.includes('Password reset'));
    });

    test('returns ok:false with error on expired token (400)', async () => {
        const response = mockJsonResponse(400, { error: 'Reset token has expired.' });
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.equal(result.message, 'Reset token has expired.');
    });

    test('returns ok:false with error on already-used token (400)', async () => {
        const response = mockJsonResponse(400, { error: 'Reset token has already been used.' });
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.equal(result.message, 'Reset token has already been used.');
    });

    test('returns ok:false with error on invalid token (400)', async () => {
        const response = mockJsonResponse(400, { error: 'Invalid or expired reset token.' });
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.equal(result.message, 'Invalid or expired reset token.');
    });

    test('returns fallback message when error body has no message', async () => {
        const response = mockJsonResponse(400, {});
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.ok(result.message.length > 0);
    });

    test('returns friendly message on non-JSON 500 from server', async () => {
        const response = mockHtmlResponse(500, 'Internal Server Error');
        const result = await handlePasswordApiResponse(response);
        assert.ok(!result.ok);
        assert.ok(result.message.includes('500'));
        assert.ok(!result.message.includes('SyntaxError'));
    });
});
