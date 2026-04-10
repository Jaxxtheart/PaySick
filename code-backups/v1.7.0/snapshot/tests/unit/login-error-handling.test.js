/**
 * Unit Tests — Login form non-JSON error handling
 *
 * Regression test for the bug where login.html showed the raw JavaScript
 * SyntaxError message to users when the API returned an HTML error page
 * instead of JSON.
 *
 * Bug: `response.json()` was called bare inside the outer try/catch.
 *      When the server returned an HTML 404 (e.g. a Vercel "The page
 *      cannot be found" page), JSON.parse threw:
 *        SyntaxError: Unexpected token 'T', "The page c"... is not valid JSON
 *      That raw error.message was shown directly in the UI.
 *
 * Fix: wrapped response.json() in its own try/catch inside the form
 *      submit handler, mirroring the protection already present in
 *      register.html.
 *
 * Run: node --test tests/unit/login-error-handling.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Extracted login response-handling logic
// ---------------------------------------------------------------------------
// This mirrors the pattern in login.html's submit handler.
// Returns the user-visible error message string, or null on success.

async function handleLoginResponse(response) {
    let data;
    try {
        data = await response.json();
    } catch {
        // Non-JSON body (HTML error page from hosting layer)
        return `Server error (${response.status}). Please try again shortly.`;
    }

    if (response.ok && data.accessToken) {
        return null; // success
    }

    if (response.status === 403 && data.code === 'EMAIL_UNVERIFIED') {
        return 'Please verify your email address first.';
    }

    // API returned a structured error
    throw new Error(data.error || data.message || 'Invalid email or password.');
}

// ---------------------------------------------------------------------------
// Helpers to build mock Response objects
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleLoginResponse — non-JSON server error', () => {
    test('returns friendly message when server returns HTML 404', async () => {
        const response = mockHtmlResponse(404, 'The page cannot be found');
        const message = await handleLoginResponse(response);
        assert.equal(message, 'Server error (404). Please try again shortly.');
    });

    test('returns friendly message when server returns HTML 500', async () => {
        const response = mockHtmlResponse(500, 'Internal Server Error');
        const message = await handleLoginResponse(response);
        assert.equal(message, 'Server error (500). Please try again shortly.');
    });

    test('friendly message does NOT contain raw SyntaxError text', async () => {
        const response = mockHtmlResponse(404, 'The page cannot be found');
        const message = await handleLoginResponse(response);
        assert.ok(
            !message.includes('SyntaxError'),
            'User-visible message must not contain "SyntaxError"'
        );
        assert.ok(
            !message.includes('Unexpected token'),
            'User-visible message must not contain "Unexpected token"'
        );
        assert.ok(
            !message.includes('is not valid JSON'),
            'User-visible message must not contain "is not valid JSON"'
        );
    });

    test('includes the HTTP status code in the friendly message', async () => {
        const response = mockHtmlResponse(503, '<html>Service Unavailable</html>');
        const message = await handleLoginResponse(response);
        assert.ok(message.includes('503'), 'Friendly message should include the status code');
    });
});

describe('handleLoginResponse — successful login', () => {
    test('returns null on successful 200 with accessToken', async () => {
        const response = mockJsonResponse(200, {
            accessToken: 'tok_abc',
            refreshToken: 'ref_xyz',
            user: { user_id: '1', email: 'test@example.com', role: 'user', full_name: 'Test User' }
        });
        const result = await handleLoginResponse(response);
        assert.equal(result, null);
    });
});

describe('handleLoginResponse — API error responses', () => {
    test('returns verification message on 403 EMAIL_UNVERIFIED', async () => {
        const response = mockJsonResponse(403, { code: 'EMAIL_UNVERIFIED', email: 'user@example.com' });
        const message = await handleLoginResponse(response);
        assert.equal(message, 'Please verify your email address first.');
    });

    test('throws with API error message on 401', async () => {
        const response = mockJsonResponse(401, { error: 'Invalid email or password' });
        await assert.rejects(
            () => handleLoginResponse(response),
            (err) => {
                assert.equal(err.message, 'Invalid email or password');
                return true;
            }
        );
    });

    test('throws fallback message when API error has no message', async () => {
        const response = mockJsonResponse(401, {});
        await assert.rejects(
            () => handleLoginResponse(response),
            (err) => {
                assert.equal(err.message, 'Invalid email or password.');
                return true;
            }
        );
    });
});
