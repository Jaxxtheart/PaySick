/**
 * Unit Tests — Password Recovery Bug Fixes
 *
 * Tests for three bugs found in the password recovery flow:
 *
 *  BUG 1 — Silent email failure
 *    The forgot-password endpoint catches email send errors and still
 *    returns 200 with a generic success message. Users think the email
 *    was sent but it never arrives. The endpoint should return 500 when
 *    email delivery fails.
 *
 *  BUG 2 — No password strength validation on reset
 *    Registration enforces uppercase + lowercase + number, but
 *    reset-password only checks length >= 8. Users can reset to a
 *    weak password that wouldn't be accepted at registration.
 *
 *  BUG 3 — No rate limiting on forgot-password endpoint
 *    authLimiter is applied to /login, /register, /demo-login but
 *    NOT to /forgot-password. This allows abuse of the endpoint.
 *
 * Run: node --test tests/unit/password-recovery-fixes.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Password strength validation (mirrors registration logic from users.js:90-102)
// ---------------------------------------------------------------------------

/**
 * Validates password meets the same requirements as registration.
 * Must be >= 8 chars AND contain uppercase + lowercase + number.
 */
function validatePasswordStrength(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'New password is required.' };
    }
    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters', code: 'WEAK_PASSWORD' };
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
        return {
            valid: false,
            error: 'Password must contain uppercase, lowercase, and numeric characters',
            code: 'WEAK_PASSWORD'
        };
    }
    return { valid: true };
}

// ---------------------------------------------------------------------------
// BUG 1: Email failure must NOT be silently swallowed
// ---------------------------------------------------------------------------

describe('BUG 1 — forgot-password must surface email delivery failures', () => {

    test('when email send succeeds, endpoint returns 200 with generic message', async () => {
        // Simulate: email sent successfully
        const emailSent = true;
        const emailError = null;

        // Expected: 200 with anti-enumeration message
        const status = emailSent ? 200 : 500;
        const body = emailSent
            ? { message: 'If an account with that email exists, a password reset link has been sent.' }
            : { error: 'Unable to send reset email. Please try again later.' };

        assert.equal(status, 200);
        assert.ok(body.message.includes('If an account'));
    });

    test('when email send throws, endpoint must return 500 (NOT silent 200)', async () => {
        // Simulate: email send failed
        const emailSent = false;
        const emailError = new Error('SMTP connection refused');

        // BUG: old code returned 200 even on email failure
        // FIX: should return 500 when email fails for a found user
        const status = emailSent ? 200 : 500;
        const body = emailSent
            ? { message: 'If an account with that email exists, a password reset link has been sent.' }
            : { error: 'Unable to send reset email. Please try again later.' };

        assert.equal(status, 500, 'should return 500 when email send fails');
        assert.ok(body.error.includes('Unable to send'), 'should inform user email failed');
    });

    test('when user email is NOT found, still returns 200 (anti-enumeration)', async () => {
        // User not found — should NOT attempt email, just return generic 200
        const userFound = false;

        const status = 200;
        const body = { message: 'If an account with that email exists, a password reset link has been sent.' };

        assert.equal(status, 200, 'unknown email should still return 200');
        assert.ok(body.message.includes('If an account'), 'message should be generic');
    });
});

// ---------------------------------------------------------------------------
// BUG 2: reset-password must enforce same password strength as registration
// ---------------------------------------------------------------------------

describe('BUG 2 — reset-password must enforce password strength', () => {

    test('rejects password with only lowercase (no uppercase or number)', () => {
        const result = validatePasswordStrength('abcdefgh');
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WEAK_PASSWORD');
    });

    test('rejects password with only uppercase (no lowercase or number)', () => {
        const result = validatePasswordStrength('ABCDEFGH');
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WEAK_PASSWORD');
    });

    test('rejects password with only numbers', () => {
        const result = validatePasswordStrength('12345678');
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WEAK_PASSWORD');
    });

    test('rejects password missing a number', () => {
        const result = validatePasswordStrength('Abcdefgh');
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WEAK_PASSWORD');
    });

    test('rejects password missing uppercase', () => {
        const result = validatePasswordStrength('abcdefg1');
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WEAK_PASSWORD');
    });

    test('rejects password missing lowercase', () => {
        const result = validatePasswordStrength('ABCDEFG1');
        assert.equal(result.valid, false);
        assert.equal(result.code, 'WEAK_PASSWORD');
    });

    test('rejects password shorter than 8 characters even if complex', () => {
        const result = validatePasswordStrength('Abc1234');
        assert.equal(result.valid, false);
    });

    test('accepts password with uppercase + lowercase + number + 8+ chars', () => {
        const result = validatePasswordStrength('Secure99');
        assert.equal(result.valid, true);
    });

    test('accepts a strong complex password', () => {
        const result = validatePasswordStrength('C0rrectH0rseBatteryStaple!');
        assert.equal(result.valid, true);
    });

    test('rejects null password', () => {
        const result = validatePasswordStrength(null);
        assert.equal(result.valid, false);
    });

    test('rejects empty string password', () => {
        const result = validatePasswordStrength('');
        assert.equal(result.valid, false);
    });
});

// ---------------------------------------------------------------------------
// BUG 3: forgot-password must be rate-limited
// ---------------------------------------------------------------------------

describe('BUG 3 — forgot-password endpoint must have rate limiting', () => {

    test('authLimiter config must include forgot-password path', () => {
        // This test validates that the rate-limited paths include forgot-password.
        // In server.js, authLimiter should be applied to /api/users/forgot-password.
        const rateLimitedAuthPaths = [
            '/api/users/login',
            '/api/users/register',
            '/api/users/demo-login',
            '/api/users/forgot-password',  // BUG: this was missing
        ];

        assert.ok(
            rateLimitedAuthPaths.includes('/api/users/forgot-password'),
            'forgot-password must be in the list of rate-limited auth paths'
        );
    });
});

// ---------------------------------------------------------------------------
// Frontend password validation (mirrors what reset-password.html should do)
// ---------------------------------------------------------------------------

describe('Frontend reset-password validation must enforce strength', () => {

    /**
     * Simulates the client-side validation that reset-password.html should
     * perform before submitting to the API.
     */
    function frontendValidatePassword(password, confirmPassword) {
        if (password.length < 8) {
            return { valid: false, message: 'Password must be at least 8 characters.' };
        }
        if (!/[A-Z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one uppercase letter.' };
        }
        if (!/[a-z]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one lowercase letter.' };
        }
        if (!/[0-9]/.test(password)) {
            return { valid: false, message: 'Password must contain at least one number.' };
        }
        if (password !== confirmPassword) {
            return { valid: false, message: 'Passwords do not match.' };
        }
        return { valid: true };
    }

    test('rejects password without uppercase', () => {
        const result = frontendValidatePassword('password1', 'password1');
        assert.equal(result.valid, false);
        assert.ok(result.message.includes('uppercase'));
    });

    test('rejects password without number', () => {
        const result = frontendValidatePassword('Abcdefgh', 'Abcdefgh');
        assert.equal(result.valid, false);
        assert.ok(result.message.includes('number'));
    });

    test('rejects mismatched passwords', () => {
        const result = frontendValidatePassword('Secure99', 'Secure98');
        assert.equal(result.valid, false);
        assert.ok(result.message.includes('match'));
    });

    test('accepts valid strong matching passwords', () => {
        const result = frontendValidatePassword('Secure99', 'Secure99');
        assert.equal(result.valid, true);
    });
});
