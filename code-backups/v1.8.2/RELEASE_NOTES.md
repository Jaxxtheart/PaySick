# v1.8.2 — Security PATCH: Reset-flow & email-scanner hardening

**Date**: 2026-07-25
**Type**: PATCH — Bug fixes (no new features, no breaking changes)

---

## Summary

Four security bugs found in the password-reset / email-verification flow:

1. `verify-email.html` auto-POSTed the one-time token on page load, allowing email security
   scanners (Proofpoint, Mimecast, Microsoft ATP) to consume the token before the real user
   clicks — leaving them with "Link invalid or already used."
2. `/api/users/forgot-password` and `/api/users/resend-verification` had no rate limiters,
   enabling unlimited email-bombing and account-enumeration probes.
3. When the SMTP send failed inside `/forgot-password`, the handler returned HTTP 500 for
   registered addresses and 200 for unknown addresses — leaking user existence.
4. Email links used `.html` extension URLs (e.g. `reset-password.html?token=X`); with
   `cleanUrls: true` in Vercel these trigger an unnecessary 308 redirect before the token
   is consumed.

All four issues are now patched and covered by 8 new unit tests.

---

## Changes

### `verify-email.html`
- Added `stateConfirm` state with a "Confirm Email Address" button (`id="confirmBtn"`)
- Removed IIFE that auto-POSTed token on page load; `verifyToken()` is now a named function
  called only when the user explicitly clicks Confirm
- Fixed `resendFromError()` redirect URL: `verify-email.html` → `verify-email`

### `backend/src/routes/users.js`
- Added `forgotPasswordRateLimit` (5 req / hour per IP)
- Added `resendVerificationRateLimit` (5 req / hour per IP)
- Applied `forgotPasswordRateLimit` to `POST /forgot-password`
- Applied `resendVerificationRateLimit` to `POST /resend-verification`
- Fixed anti-enumeration: `catch (emailErr)` block no longer returns 500; failure is logged
  and the generic 200 response is returned regardless

### `backend/src/services/email.service.js`
- `sendPasswordResetEmail`: URL changed from `.../reset-password.html?token=` to `.../reset-password?token=`
- `sendVerificationEmail`: URL changed from `.../verify-email.html?token=` to `.../verify-email?token=`

### `tests/unit/reset-flow-security.test.js` (new)
- 8 new tests covering all four fixes (test-first: written and confirmed failing before implementation)

### `tests/unit/email-service.test.js`
- Updated existing assertion to match new clean URL format (no `.html`)

---

## Tests

- **New**: 8 tests in `tests/unit/reset-flow-security.test.js`
- **Total passing**: 57 / 57 (0 failures)
