/**
 * Unit Tests — Email Service: Production Configuration Guards
 *
 * Regression tests for two bugs found in production:
 *
 *  BUG 1 — Wrong reset URL domain
 *    APP_URL was not set in vercel.json so it defaulted to
 *    "http://localhost:3000". Every emailed link pointed to localhost.
 *
 *  BUG 2 — Silent Ethereal fallback in production
 *    When SMTP_HOST is unset and NODE_ENV=production, sendMail()
 *    silently fell back to an Ethereal test account. Emails appeared
 *    "sent" (API returned 200) but were delivered to a fake inbox.
 *
 * Run: node --test tests/unit/email-service.test.js
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Bust the email service module cache so env vars are re-read at load time.
 * Returns a fresh require of the service.
 */
function freshEmailService() {
    Object.keys(require.cache).forEach(k => {
        if (k.includes('email.service')) delete require.cache[k];
    });
    return require('../../backend/src/services/email.service');
}

/**
 * Set env vars from a map; returns a restore function.
 * Pass `undefined` as a value to delete the key.
 */
function setEnv(vars) {
    const saved = {};
    for (const [k, v] of Object.entries(vars)) {
        saved[k] = process.env[k];
        if (v === undefined) {
            delete process.env[k];
        } else {
            process.env[k] = v;
        }
    }
    return function restoreEnv() {
        for (const [k, orig] of Object.entries(saved)) {
            if (orig === undefined) {
                delete process.env[k];
            } else {
                process.env[k] = orig;
            }
        }
        // Also bust the cache after restore
        Object.keys(require.cache).forEach(k => {
            if (k.includes('email.service')) delete require.cache[k];
        });
    };
}

// ─── BUG 1: APP_URL must not default to localhost ────────────────────────────

describe('BUG 1 — reset link URL uses correct production domain', () => {

    test('reset link contains the correct paysick.co.za domain when APP_URL is set', async (t) => {
        let capturedHtml = null;

        // Stub nodemailer.createTransport to capture the outgoing mail body
        const orig = nodemailer.createTransport;
        nodemailer.createTransport = () => ({
            sendMail: async (opts) => { capturedHtml = opts.html; return { messageId: 'test' }; },
        });

        const restore = setEnv({
            APP_URL:   'https://paysick.co.za',
            SMTP_HOST: 'smtp.fake.test',
            SMTP_USER: 'user',
            SMTP_PASS: 'pass',
            NODE_ENV:  'production',
        });

        try {
            const service = freshEmailService();
            const rawToken = 'deadbeef'.repeat(8); // 64 hex chars
            await service.sendPasswordResetEmail('user@test.com', 'Test User', rawToken);

            assert.ok(capturedHtml, 'email body should have been captured');
            assert.ok(
                capturedHtml.includes('https://paysick.co.za/reset-password.html?token=' + rawToken),
                'reset link should use the configured APP_URL domain'
            );
            assert.ok(
                !capturedHtml.includes('localhost'),
                'reset link must NOT contain localhost'
            );
        } finally {
            nodemailer.createTransport = orig;
            restore();
        }
    });

    test('DEFECT (pre-fix): reset link contains localhost when APP_URL is unset', async (t) => {
        // This test documents the old broken behaviour.
        // It passes BEFORE the fix (localhost IS in the URL).
        // After the vercel.json fix (APP_URL added to deployment), this path
        // is no longer reached in production, but the defect is preserved here
        // for record-keeping.
        let capturedHtml = null;

        const orig = nodemailer.createTransport;
        nodemailer.createTransport = () => ({
            sendMail: async (opts) => { capturedHtml = opts.html; return { messageId: 'test' }; },
        });

        const restore = setEnv({
            APP_URL:   undefined,   // deliberately unset
            SMTP_HOST: 'smtp.fake.test',
            SMTP_USER: 'user',
            SMTP_PASS: 'pass',
            NODE_ENV:  'development', // dev mode so no production guard fires
        });

        try {
            const service = freshEmailService();
            await service.sendPasswordResetEmail('user@test.com', 'Test User', 'abc123token');

            assert.ok(capturedHtml, 'email body should be captured');
            // Before fix: link falls back to localhost
            assert.ok(
                capturedHtml.includes('localhost:3000'),
                'DEFECT: without APP_URL the link defaults to localhost:3000'
            );
        } finally {
            nodemailer.createTransport = orig;
            restore();
        }
    });

});

// ─── BUG 2: No silent Ethereal fallback in production ────────────────────────

describe('BUG 2 — production requires SMTP_HOST to be configured', () => {

    test('sendPasswordResetEmail throws a clear error when NODE_ENV=production and SMTP_HOST is missing', async (t) => {
        // FAILING before the fix: service silently uses Ethereal.
        // PASSING after the fix: throws ConfigurationError.
        const restore = setEnv({
            NODE_ENV:  'production',
            SMTP_HOST: undefined,
            APP_URL:   'https://paysick.co.za',
        });

        try {
            const service = freshEmailService();
            await assert.rejects(
                () => service.sendPasswordResetEmail('user@test.com', 'Test User', 'token'),
                (err) => {
                    assert.match(
                        err.message,
                        /SMTP_HOST|smtp.*not configured|email.*not configured/i,
                        'error message should mention SMTP_HOST or configuration'
                    );
                    return true;
                }
            );
        } finally {
            restore();
        }
    });

    test('sendPasswordResetEmail succeeds when NODE_ENV=production and SMTP_HOST IS set', async (t) => {
        let called = false;

        const orig = nodemailer.createTransport;
        nodemailer.createTransport = () => ({
            sendMail: async () => { called = true; return { messageId: 'test' }; },
        });

        const restore = setEnv({
            NODE_ENV:  'production',
            SMTP_HOST: 'smtp.sendgrid.net',
            SMTP_USER: 'apikey',
            SMTP_PASS: 'SG.fakekey',
            APP_URL:   'https://paysick.co.za',
        });

        try {
            const service = freshEmailService();
            await service.sendPasswordResetEmail('user@test.com', 'Test User', 'token123');
            assert.ok(called, 'sendMail should have been called via production SMTP transport');
        } finally {
            nodemailer.createTransport = orig;
            restore();
        }
    });

    test('sendPasswordResetEmail does NOT throw in development without SMTP_HOST (Ethereal fallback is OK)', async (t) => {
        // Dev behaviour is deliberately preserved: no SMTP needed locally.
        const origCreate = nodemailer.createTransport;
        const origTestAccount = nodemailer.createTestAccount;

        nodemailer.createTestAccount = async () => ({ user: 'dev@ethereal', pass: 'devpass' });
        nodemailer.createTransport = () => ({
            sendMail: async () => ({ messageId: 'dev-test' }),
        });

        const restore = setEnv({
            NODE_ENV:  'development',
            SMTP_HOST: undefined,
        });

        try {
            const service = freshEmailService();
            await assert.doesNotReject(
                () => service.sendPasswordResetEmail('dev@test.com', 'Dev User', 'devtoken'),
                'dev mode should not throw when SMTP is unconfigured'
            );
        } finally {
            nodemailer.createTransport = origCreate;
            nodemailer.createTestAccount = origTestAccount;
            restore();
        }
    });

});
