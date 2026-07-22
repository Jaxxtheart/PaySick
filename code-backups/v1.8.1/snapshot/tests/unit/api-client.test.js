'use strict';

/**
 * Unit Tests — PaySick API Client
 *
 * Tests for:
 *  - Token auto-refresh on 401 TOKEN_EXPIRED responses
 *  - Server-side token revocation on logout
 *
 * Run: node --test tests/unit/api-client.test.js
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ─── Browser environment shim ─────────────────────────────────────────────────

function makeLocalStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

function makeWindow(origin = 'https://paysick.co.za') {
  return { location: { hostname: 'paysick.co.za', origin } };
}

/**
 * Load a fresh copy of api-client.js with mocked globals.
 * Returns the PaySickAPI object and the mocked globals.
 */
function loadClient(overrides = {}) {
  // Bust module cache
  Object.keys(require.cache).forEach(k => {
    if (k.includes('api-client')) delete require.cache[k];
  });

  const ls = makeLocalStorage();
  const win = makeWindow();

  // Inject browser globals before loading
  global.localStorage = ls;
  global.window = win;

  const client = require('../../api-client.js');

  return { client, ls, win };
}

// ─── Fix 5: Token auto-refresh on 401 ────────────────────────────────────────

describe('Token auto-refresh on 401 TOKEN_EXPIRED', () => {

  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  test('retries the original request with a new token after a successful refresh', async () => {
    const { client, ls } = loadClient();

    // Seed tokens in storage
    ls.setItem('paysick_auth_token', 'old-access-token');
    ls.setItem('paysick_refresh_token', 'valid-refresh-token');

    let callCount = 0;
    global.fetch = async (url, opts) => {
      callCount++;
      // First call: original request → 401 TOKEN_EXPIRED
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Token expired', code: 'TOKEN_EXPIRED' }),
        };
      }
      // Second call: refresh endpoint → success
      if (url.includes('/users/refresh-token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token' }),
        };
      }
      // Third call: retry of original request → success
      if (callCount === 3) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: 'profile data' }),
        };
      }
      throw new Error(`Unexpected fetch call #${callCount} to ${url}`);
    };

    const result = await client.request('/users/profile');
    assert.equal(result.data, 'profile data', 'should return data from the retried request');
    assert.equal(ls.getItem('paysick_auth_token'), 'new-access-token', 'should store the new access token');
    assert.equal(callCount, 3, 'should make exactly 3 fetch calls: original → refresh → retry');
  });

  test('clears storage and throws when refresh request fails', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_auth_token', 'old-access-token');
    ls.setItem('paysick_refresh_token', 'expired-refresh-token');
    ls.setItem('paysick_user', JSON.stringify({ id: 'u1' }));

    let callCount = 0;
    global.fetch = async (url) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: 'Token expired', code: 'TOKEN_EXPIRED' }),
        };
      }
      // Refresh call → fails
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Refresh token invalid', code: 'INVALID_REFRESH_TOKEN' }),
      };
    };

    await assert.rejects(
      () => client.request('/users/profile'),
      (err) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        return true;
      }
    );

    assert.equal(ls.getItem('paysick_auth_token'), null, 'access token must be cleared after failed refresh');
    assert.equal(ls.getItem('paysick_user'), null, 'user data must be cleared after failed refresh');
  });

  test('does NOT attempt refresh when 401 does not carry TOKEN_EXPIRED code', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_auth_token', 'some-token');
    ls.setItem('paysick_refresh_token', 'some-refresh');

    let refreshAttempted = false;
    global.fetch = async (url) => {
      if (url.includes('refresh-token')) refreshAttempted = true;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorised', code: 'UNAUTHORIZED' }),
      };
    };

    await assert.rejects(() => client.request('/users/profile'));
    assert.equal(refreshAttempted, false, 'should NOT attempt refresh for non-TOKEN_EXPIRED 401s');
  });

  test('does NOT attempt refresh when no refresh token is stored', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_auth_token', 'some-token');
    // No refresh token in storage

    let refreshAttempted = false;
    global.fetch = async (url) => {
      if (url.includes('refresh-token')) refreshAttempted = true;
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Token expired', code: 'TOKEN_EXPIRED' }),
      };
    };

    await assert.rejects(() => client.request('/users/profile'));
    assert.equal(refreshAttempted, false, 'should NOT attempt refresh when no refresh token exists');
  });

});

// ─── Fix 5b: users.refreshToken() public method ──────────────────────────────

describe('users.refreshToken() public method', () => {

  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  test('users.refreshToken() calls POST /users/refresh-token with the stored refresh token', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_refresh_token', 'my-stored-refresh-token');

    let capturedUrl  = null;
    let capturedBody = null;

    global.fetch = async (url, opts) => {
      capturedUrl  = url;
      capturedBody = JSON.parse(opts.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }),
      };
    };

    const result = await client.users.refreshToken();

    assert.ok(capturedUrl && capturedUrl.includes('/users/refresh-token'),
      'must POST to /users/refresh-token');
    assert.equal(capturedBody.refreshToken, 'my-stored-refresh-token',
      'must send the stored refresh token in the request body');
    assert.equal(result.accessToken, 'fresh-access', 'should return the new access token');
    assert.equal(result.refreshToken, 'fresh-refresh', 'should return the new refresh token');
  });

  test('users.refreshToken() updates localStorage with the new tokens', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_refresh_token', 'old-refresh');

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'updated-access', refreshToken: 'updated-refresh' }),
    });

    await client.users.refreshToken();

    assert.equal(ls.getItem('paysick_auth_token'), 'updated-access',
      'access token should be updated in localStorage');
    assert.equal(ls.getItem('paysick_refresh_token'), 'updated-refresh',
      'refresh token should be updated in localStorage');
  });

  test('users.refreshToken() throws when the server returns an error', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_refresh_token', 'bad-refresh');

    global.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Refresh token invalid', code: 'INVALID_REFRESH_TOKEN' }),
    });

    await assert.rejects(
      () => client.users.refreshToken(),
      (err) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        return true;
      },
      'should throw when the refresh request fails'
    );
  });

});

// ─── Fix 6: Server-side token revocation on logout ───────────────────────────

describe('Server-side token revocation on logout', () => {

  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  test('calls POST /api/users/logout on the server when logging out', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_auth_token', 'active-token');
    ls.setItem('paysick_refresh_token', 'active-refresh');
    ls.setItem('paysick_user', JSON.stringify({ id: 'u1', name: 'Test' }));

    let logoutCalled = false;
    let logoutAuthHeader = null;

    global.fetch = async (url, opts) => {
      if (url.includes('/users/logout')) {
        logoutCalled = true;
        logoutAuthHeader = opts?.headers?.Authorization;
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      throw new Error(`Unexpected fetch to ${url}`);
    };

    await client.users.logout();

    assert.ok(logoutCalled, 'should call the server logout endpoint');
    assert.match(logoutAuthHeader, /Bearer active-token/, 'should send the current token in Authorization header');
    assert.equal(ls.getItem('paysick_auth_token'), null, 'should clear access token from storage');
    assert.equal(ls.getItem('paysick_user'), null, 'should clear user data from storage');
  });

  test('clears localStorage even if the server logout call fails', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_auth_token', 'active-token');
    ls.setItem('paysick_user', JSON.stringify({ id: 'u1' }));

    global.fetch = async () => {
      throw new Error('Network error');
    };

    // Should not throw
    await assert.doesNotReject(() => client.users.logout());

    assert.equal(ls.getItem('paysick_auth_token'), null, 'storage must be cleared even on network failure');
    assert.equal(ls.getItem('paysick_user'), null, 'user data must be cleared even on network failure');
  });

  test('clears localStorage even if the server returns an error status', async () => {
    const { client, ls } = loadClient();

    ls.setItem('paysick_auth_token', 'active-token');
    ls.setItem('paysick_user', JSON.stringify({ id: 'u1' }));

    global.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    await assert.doesNotReject(() => client.users.logout());

    assert.equal(ls.getItem('paysick_auth_token'), null, 'storage must be cleared even on server error');
  });

});
