'use strict';

/**
 * Unit Tests — Login Flow Logic
 *
 * Tests for extracted pure functions that drive login.html behaviour.
 * Each function is duplicated here from login.html so it can be
 * tested without a DOM or browser environment.
 *
 * Run: node --test tests/unit/login-flow.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// formatLoginError — mirrors the error-formatting logic in login.html
// ---------------------------------------------------------------------------

function formatLoginError(data, status) {
    if (!data) return 'Login failed. Please try again.';

    if (status === 403) {
        switch (data.code) {
            case 'EMAIL_UNVERIFIED':
                return null; // special-cased by caller: redirect to verify-email
            case 'ACCOUNT_LOCKED': {
                if (data.lockedUntil) {
                    const unlockTime = new Date(data.lockedUntil);
                    const now = new Date();
                    const minsLeft = Math.ceil((unlockTime - now) / 60000);
                    return minsLeft > 0
                        ? `Account locked. Try again in ${minsLeft} minute${minsLeft !== 1 ? 's' : ''}.`
                        : 'Account locked. Please try again shortly.';
                }
                return 'Account temporarily locked. Please try again later.';
            }
            case 'ACCOUNT_SUSPENDED':
                return 'Account suspended. Please contact support.';
            case 'ACCOUNT_CLOSED':
                return 'Account closed. Please contact support.';
            case 'PASSWORD_REQUIRED':
                return null; // special-cased by caller: redirect to forgot-password
        }
    }

    if (status === 401) {
        const base = data.error || 'Invalid email or password.';
        if (typeof data.attemptsRemaining === 'number' && data.attemptsRemaining > 0) {
            return `${base} ${data.attemptsRemaining} attempt${data.attemptsRemaining !== 1 ? 's' : ''} remaining before lockout.`;
        }
        if (typeof data.attemptsRemaining === 'number' && data.attemptsRemaining === 0) {
            return `${base} Your account has been locked.`;
        }
        return base;
    }

    if (status === 429) {
        return data.error || 'Too many attempts. Please wait before trying again.';
    }

    return data.error || data.message || 'Login failed. Please try again.';
}

// ---------------------------------------------------------------------------
// redirectTargetByRole — mirrors login.html redirectByRole (returns URL, not navigates)
// ---------------------------------------------------------------------------

function redirectTargetByRole(role) {
    switch (role) {
        case 'admin':    return 'admin-dashboard.html';
        case 'provider': return 'provider-dashboard.html';
        case 'lender':   return 'lender-dashboard.html';
        default:         return 'dashboard.html';
    }
}

// ---------------------------------------------------------------------------
// Tests: formatLoginError
// ---------------------------------------------------------------------------

describe('formatLoginError — attemptsRemaining', () => {

    test('shows remaining attempts when > 0', () => {
        const msg = formatLoginError({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS', attemptsRemaining: 3 }, 401);
        assert.ok(msg.includes('3 attempts remaining'), `expected attempts in message, got: "${msg}"`);
    });

    test('singular "attempt" when 1 remains', () => {
        const msg = formatLoginError({ error: 'Invalid credentials', attemptsRemaining: 1 }, 401);
        assert.ok(msg.includes('1 attempt remaining'), `expected singular, got: "${msg}"`);
    });

    test('says "account has been locked" when attemptsRemaining is 0', () => {
        const msg = formatLoginError({ error: 'Invalid credentials', attemptsRemaining: 0 }, 401);
        assert.ok(msg.toLowerCase().includes('locked'), `expected locked notice, got: "${msg}"`);
    });

    test('plain error when no attemptsRemaining field', () => {
        const msg = formatLoginError({ error: 'Invalid credentials' }, 401);
        assert.ok(!msg.includes('remaining'), `should not mention remaining when field absent: "${msg}"`);
    });
});

describe('formatLoginError — ACCOUNT_LOCKED with lockedUntil', () => {

    test('shows minutes remaining when lockedUntil is in the future', () => {
        const future = new Date(Date.now() + 25 * 60 * 1000).toISOString(); // 25 mins ahead
        const msg = formatLoginError({ code: 'ACCOUNT_LOCKED', lockedUntil: future }, 403);
        assert.ok(msg.includes('minute'), `expected minutes in message, got: "${msg}"`);
        assert.ok(!msg.includes('NaN'), 'should not contain NaN');
    });

    test('shows fallback when lockedUntil is missing', () => {
        const msg = formatLoginError({ code: 'ACCOUNT_LOCKED' }, 403);
        assert.ok(msg.toLowerCase().includes('locked'), `got: "${msg}"`);
    });

    test('shows "shortly" when lockedUntil is in the past', () => {
        const past = new Date(Date.now() - 1000).toISOString();
        const msg = formatLoginError({ code: 'ACCOUNT_LOCKED', lockedUntil: past }, 403);
        assert.ok(msg.toLowerCase().includes('shortly'), `got: "${msg}"`);
    });
});

describe('formatLoginError — special null returns (caller handles redirect)', () => {

    test('returns null for EMAIL_UNVERIFIED (caller redirects)', () => {
        const result = formatLoginError({ code: 'EMAIL_UNVERIFIED' }, 403);
        assert.equal(result, null);
    });

    test('returns null for PASSWORD_REQUIRED (caller redirects to forgot-password)', () => {
        const result = formatLoginError({ code: 'PASSWORD_REQUIRED' }, 403);
        assert.equal(result, null);
    });
});

describe('formatLoginError — rate limiting', () => {

    test('returns error text for 429 IP_BLOCKED', () => {
        const msg = formatLoginError({ error: 'Too many attempts', code: 'IP_BLOCKED' }, 429);
        assert.ok(msg.toLowerCase().includes('too many') || msg.toLowerCase().includes('attempts'), `got: "${msg}"`);
    });
});

// ---------------------------------------------------------------------------
// Tests: redirectTargetByRole
// ---------------------------------------------------------------------------

describe('redirectTargetByRole — no role dropdown required', () => {

    test('admin → admin-dashboard.html', () => {
        assert.equal(redirectTargetByRole('admin'), 'admin-dashboard.html');
    });

    test('provider → provider-dashboard.html', () => {
        assert.equal(redirectTargetByRole('provider'), 'provider-dashboard.html');
    });

    test('lender → lender-dashboard.html', () => {
        assert.equal(redirectTargetByRole('lender'), 'lender-dashboard.html');
    });

    test('user → dashboard.html', () => {
        assert.equal(redirectTargetByRole('user'), 'dashboard.html');
    });

    test('null role → dashboard.html (safe default)', () => {
        assert.equal(redirectTargetByRole(null), 'dashboard.html');
    });

    test('undefined role → dashboard.html (safe default)', () => {
        assert.equal(redirectTargetByRole(undefined), 'dashboard.html');
    });

    test('unknown role → dashboard.html (safe default)', () => {
        assert.equal(redirectTargetByRole('superuser'), 'dashboard.html');
    });
});
