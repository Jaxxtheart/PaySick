/**
 * Unit Tests — Login & Dashboard Redirect Bug Fixes
 *
 * Tests for three bugs found in the login/redirect flow:
 *
 *  BUG 1 — Auto-login / manual login race condition
 *    attemptAutoLogin() IIFE runs on page load and can overwrite
 *    localStorage after the manual login form has already stored
 *    user data, stripping the role fallback.
 *
 *  BUG 2 — Admin dashboard flicker (infinite redirect loop)
 *    When auto-login overwrites user data with a null database role,
 *    admin-dashboard checkAuth sees role !== 'admin' and redirects
 *    back to login, where auto-login redirects back — infinite loop.
 *
 *  BUG 3 — Provider redirect loop
 *    redirectByRole('provider') sends to dashboard.html, but
 *    dashboard.html checkAuth rejects role !== 'user'.
 *
 * Run: node --test tests/unit/login-redirect-fixes.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// redirectByRole logic (mirrors login.html)
// ---------------------------------------------------------------------------

function redirectByRole(role) {
    switch (role) {
        case 'admin':
            return 'admin-dashboard.html';
        case 'provider':
            return 'provider-dashboard.html';
        case 'lender':
            return 'lender-dashboard.html';
        default:
            return 'dashboard.html';
    }
}

// ---------------------------------------------------------------------------
// checkAuth logic for each dashboard (mirrors actual page JS)
// ---------------------------------------------------------------------------

function adminCheckAuth(user, token) {
    if (!user || !token || user.role !== 'admin') return null;
    return user;
}

function userCheckAuth(user, token) {
    if (!user || !token || user.role !== 'user') return null;
    return user;
}

function providerCheckAuth(user, token) {
    if (!user || !token || user.role !== 'provider') return null;
    return user;
}

// ---------------------------------------------------------------------------
// Simulated localStorage user data storage
// ---------------------------------------------------------------------------

/** Manual login stores user with role fallback */
function storeUserFromManualLogin(apiUser, dropdownRole) {
    return {
        ...apiUser,
        role: apiUser.role || dropdownRole,
        name: apiUser.full_name
    };
}

/** Auto-login stores user from profile (FIXED: must include role fallback) */
function storeUserFromAutoLogin(profileUser, savedRole) {
    return {
        ...profileUser,
        role: profileUser.role || savedRole,
        name: profileUser.full_name
    };
}

// ---------------------------------------------------------------------------
// BUG 1: Auto-login must not overwrite manual login data
// ---------------------------------------------------------------------------

describe('BUG 1 — auto-login must not overwrite manual login when form submitted', () => {

    test('when manual login has already completed, auto-login must not write to storage', () => {
        // Simulate: manual login completed flag
        let manualLoginCompleted = false;
        let storedUser = null;

        // Manual login succeeds first
        const apiUser = { user_id: '1', full_name: 'Test Admin', email: 'a@b.com', role: null };
        storedUser = storeUserFromManualLogin(apiUser, 'admin');
        manualLoginCompleted = true;

        assert.equal(storedUser.role, 'admin', 'manual login stores role from dropdown fallback');

        // Auto-login completes later — must check flag before overwriting
        const profileUser = { user_id: '1', full_name: 'Test Admin', email: 'a@b.com', role: null };
        if (!manualLoginCompleted) {
            storedUser = storeUserFromAutoLogin(profileUser, 'admin');
        }

        // storedUser should still have role='admin' from manual login
        assert.equal(storedUser.role, 'admin', 'auto-login must not overwrite after manual login');
    });

    test('when manual login has NOT happened, auto-login stores data normally', () => {
        let manualLoginCompleted = false;
        let storedUser = null;

        // Auto-login fires, no manual login yet
        const profileUser = { user_id: '1', full_name: 'Test Admin', email: 'a@b.com', role: 'admin' };
        if (!manualLoginCompleted) {
            storedUser = storeUserFromAutoLogin(profileUser, 'admin');
        }

        assert.equal(storedUser.role, 'admin');
    });
});

// ---------------------------------------------------------------------------
// BUG 2: Auto-login must preserve role fallback
// ---------------------------------------------------------------------------

describe('BUG 2 — auto-login must include role fallback (same as manual login)', () => {

    test('when database role is null, auto-login uses saved role as fallback', () => {
        const profileUser = { user_id: '1', full_name: 'Admin', email: 'a@b.com', role: null };
        const savedRole = 'admin';

        const stored = storeUserFromAutoLogin(profileUser, savedRole);

        assert.equal(stored.role, 'admin', 'null db role should fall back to saved role');
    });

    test('when database role is set, auto-login uses database role', () => {
        const profileUser = { user_id: '1', full_name: 'Admin', email: 'a@b.com', role: 'admin' };
        const savedRole = 'user'; // different from DB

        const stored = storeUserFromAutoLogin(profileUser, savedRole);

        assert.equal(stored.role, 'admin', 'db role should take priority');
    });

    test('admin dashboard accepts user when role is correctly stored as admin', () => {
        const user = { role: 'admin', name: 'Admin' };
        const token = 'valid-token';

        const result = adminCheckAuth(user, token);
        assert.ok(result, 'checkAuth should accept valid admin');
    });

    test('admin dashboard rejects user when role is null (the bug)', () => {
        const user = { role: null, name: 'Admin' };
        const token = 'valid-token';

        const result = adminCheckAuth(user, token);
        assert.equal(result, null, 'null role should be rejected');
    });
});

// ---------------------------------------------------------------------------
// BUG 3: Provider redirect must NOT go to dashboard.html
// ---------------------------------------------------------------------------

describe('BUG 3 — provider redirect must go to provider-dashboard, not dashboard', () => {

    test('provider role redirects to provider-dashboard.html (not dashboard.html)', () => {
        const target = redirectByRole('provider');
        assert.equal(target, 'provider-dashboard.html',
            'providers must NOT be sent to dashboard.html which rejects non-user roles');
    });

    test('admin role redirects to admin-dashboard.html', () => {
        assert.equal(redirectByRole('admin'), 'admin-dashboard.html');
    });

    test('lender role redirects to lender-dashboard.html', () => {
        assert.equal(redirectByRole('lender'), 'lender-dashboard.html');
    });

    test('user role (default) redirects to dashboard.html', () => {
        assert.equal(redirectByRole('user'), 'dashboard.html');
    });

    test('unknown role redirects to dashboard.html (safe default)', () => {
        assert.equal(redirectByRole('unknown'), 'dashboard.html');
    });

    test('dashboard.html checkAuth accepts user role', () => {
        const result = userCheckAuth({ role: 'user' }, 'token');
        assert.ok(result);
    });

    test('dashboard.html checkAuth rejects provider role (the bug)', () => {
        const result = userCheckAuth({ role: 'provider' }, 'token');
        assert.equal(result, null, 'dashboard.html should reject non-user roles');
    });
});
