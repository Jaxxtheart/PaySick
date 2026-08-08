'use strict';

/**
 * Unit Tests — Reset Flow Security Bugs
 *
 * Tests for the four security issues found in the password-reset / verify-email flow:
 *
 * Fix 1: verify-email.html must NOT auto-POST the token on page load.
 *         Email security scanners (Proofpoint, Mimecast, ATP) pre-fetch every link.
 *         Auto-posting consumes the one-time token before the real user can click.
 *         Fix: show a "Confirm Email" button; only POST on explicit user click.
 *
 * Fix 2: /forgot-password and /resend-verification have no rate limiter.
 *         Any actor can email-bomb or enumerate addresses without limit.
 *         Fix: add forgotPasswordRateLimit / resendVerificationRateLimit.
 *
 * Fix 3: When email sending fails, /forgot-password returns HTTP 500.
 *         Non-existent email → 200; registered email (send fail) → 500.
 *         This leaks whether an email address is registered.
 *         Fix: swallow send errors and always return the generic 200.
 *
 * Fix 4: Email URLs contain the .html extension.
 *         With cleanUrls:true Vercel 308-redirects reset-password.html?token=X
 *         → reset-password?token=X. The redirect works, but it adds a round-trip
 *         and creates a dependency on redirect behaviour preserving query strings.
 *         Fix: use the clean URL directly in the email links.
 *
 * Run: node --test tests/unit/reset-flow-security.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');

const REPO_ROOT    = path.resolve(__dirname, '../../');
const VERIFY_HTML  = path.join(REPO_ROOT, 'verify-email.html');
const EMAIL_SVC    = path.join(REPO_ROOT, 'backend/src/services/email.service.js');
const USERS_ROUTES = path.join(REPO_ROOT, 'backend/src/routes/users.js');

// ─── Fix 1: verify-email.html scanner protection ─────────────────────────────

describe('verify-email.html — scanner protection', () => {

  test('page has an explicit confirmation button the user must click', () => {
    const html = fs.readFileSync(VERIFY_HTML, 'utf8');
    assert.ok(
      html.includes('id="confirmBtn"'),
      'verify-email.html must have a confirmation button with id="confirmBtn"'
    );
  });

  test('page does NOT auto-POST the token on load (no IIFE verifyToken call)', () => {
    const html = fs.readFileSync(VERIFY_HTML, 'utf8');
    // Before fix: if (urlToken) { showState(...); (async function verifyToken() { fetch(...) })(); }
    // After fix: the IIFE inside the urlToken-present branch must be gone
    const hasAutoSubmit = /if\s*\(\s*urlToken\s*\)\s*\{[^}]*\(async\s+function\s+verifyToken/.test(html);
    assert.ok(
      !hasAutoSubmit,
      'verify-email.html must not auto-invoke verifyToken() when the token is present in the URL'
    );
  });

  test('stateVerifying state is shown on load (spinner while confirming)', () => {
    const html = fs.readFileSync(VERIFY_HTML, 'utf8');
    // After fix the page shows a "confirm your email" state, not immediately the verifying spinner.
    // The initial state when a token is present should be stateConfirm (or similar), not stateVerifying.
    assert.ok(
      html.includes('id="stateConfirm"') || html.includes('stateConfirm'),
      'verify-email.html must have a stateConfirm state to show the confirmation button'
    );
  });

});

// ─── Fix 2: Rate limiters on forgot-password and resend-verification ──────────

describe('users.js — rate limiters', () => {

  test('/forgot-password route uses a dedicated rate limiter', () => {
    const src = fs.readFileSync(USERS_ROUTES, 'utf8');
    assert.ok(
      src.includes('forgotPasswordRateLimit'),
      'users.js must define a forgotPasswordRateLimit'
    );
    // The route declaration must pass the rate limiter as middleware
    assert.ok(
      /router\.post\(\s*['"]\/forgot-password['"]\s*,\s*forgotPasswordRateLimit/.test(src),
      '/forgot-password route must pass forgotPasswordRateLimit as the first middleware argument'
    );
  });

  test('/resend-verification route uses a dedicated rate limiter', () => {
    const src = fs.readFileSync(USERS_ROUTES, 'utf8');
    assert.ok(
      src.includes('resendVerificationRateLimit'),
      'users.js must define a resendVerificationRateLimit'
    );
    assert.ok(
      /router\.post\(\s*['"]\/resend-verification['"]\s*,\s*resendVerificationRateLimit/.test(src),
      '/resend-verification route must pass resendVerificationRateLimit as the first middleware argument'
    );
  });

});

// ─── Fix 3: Anti-enumeration — email send failure must not return 500 ─────────

describe('users.js — anti-enumeration on email send failure', () => {

  test('forgot-password emailErr catch block does not return 500 (leaks user existence)', () => {
    const src = fs.readFileSync(USERS_ROUTES, 'utf8');

    // Isolate only the forgot-password handler to avoid false matches from other routes
    const startMarker = "POST /api/users/forgot-password";
    const endMarker   = "POST /api/users/reset-password";
    const startIdx    = src.indexOf(startMarker);
    const endIdx      = src.indexOf(endMarker, startIdx);
    assert.ok(startIdx !== -1, 'could not find forgot-password section in users.js');
    assert.ok(endIdx   !== -1, 'could not find reset-password section in users.js');

    const section = src.slice(startIdx, endIdx);

    // The specific vulnerability: the catch(emailErr) block returning 500.
    // Non-existent email → 200; registered email with send failure → 500 leaks existence.
    // We verify there is no `res.status(500)` inside the emailErr catch.
    const emailErrIdx = section.indexOf('catch (emailErr)');
    assert.ok(emailErrIdx !== -1, 'forgot-password must still have a catch(emailErr) block');

    // Extract from catch(emailErr) to the next top-level catch (or end of section)
    const afterEmailErr   = section.slice(emailErrIdx);
    const nextCatchOffset = afterEmailErr.indexOf('} catch (error)');
    const emailErrBlock   = nextCatchOffset === -1
      ? afterEmailErr
      : afterEmailErr.slice(0, nextCatchOffset);

    assert.ok(
      !emailErrBlock.includes('res.status(500)'),
      'forgot-password catch(emailErr) must not return 500 — this leaks whether an email address is registered'
    );
  });

});

// ─── Fix 4: Email URLs must not contain .html extension ──────────────────────

describe('email.service.js — clean URL links (no .html extension)', () => {

  test('password reset email uses /reset-password?token= (no .html)', () => {
    const src = fs.readFileSync(EMAIL_SVC, 'utf8');
    assert.ok(
      !src.includes('reset-password.html'),
      'email.service.js must not use reset-password.html in the reset URL — use /reset-password instead'
    );
  });

  test('verification email uses /verify-email?token= (no .html)', () => {
    const src = fs.readFileSync(EMAIL_SVC, 'utf8');
    assert.ok(
      !src.includes('verify-email.html'),
      'email.service.js must not use verify-email.html in the verify URL — use /verify-email instead'
    );
  });

});
