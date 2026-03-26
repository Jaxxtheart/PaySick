# Release Notes — PaySick v1.5.0

**Version**: 1.5.0
**Date**: 2026-03-26
**Type**: MINOR — New feature: forgot password / reset password flow

---

## Summary

Users who have forgotten their password can now request a reset link via email. The reset link is valid for 1 hour and immediately invalidates all existing sessions on use.

---

## Added

### Backend

- `POST /api/users/forgot-password`
  - Accepts `{ email }` in request body
  - Looks up user; if found, invalidates any existing unused reset tokens, generates a new 32-byte random token, stores its SHA-256 hash in `password_reset_tokens` with a 1-hour expiry, and sends a branded reset email
  - **Anti-enumeration**: always returns `200 { message: "If an account..." }` regardless of whether the email is registered
  - Sends `PASSWORD_RESET_REQUESTED` security event to audit log

- `POST /api/users/reset-password`
  - Accepts `{ token, password }` in request body
  - Validates token is a 64-char hex string
  - Looks up `SHA-256(token)` in `password_reset_tokens WHERE used = false`
  - Returns `400` if token not found, already used, or expired
  - In a database transaction: marks token as used, updates `password_hash`, revokes all active sessions for that user
  - Sends `PASSWORD_CHANGED` security event to audit log
  - Returns `200 { message: "Password reset successfully." }`

- `backend/src/services/email.service.js` — added `sendPasswordResetEmail(to, fullName, rawToken)`:
  - Branded PaySick HTML email (matches verification email style)
  - States token expires in 1 hour
  - Reset URL: `${APP_URL}/reset-password.html?token=${rawToken}`

### Frontend

- `forgot-password.html` — new page
  - Email entry form; submits to `POST /api/users/forgot-password`
  - Shows generic success message (never reveals whether email is registered)
  - Hides form after submission; shows success card
  - Non-JSON server response → friendly "Server error (N). Please try again shortly."
  - Responsive (768px / 480px breakpoints, iOS zoom fix on inputs)

- `reset-password.html` — new page
  - Reads `?token=` from URL query string
  - If token missing or not 64 hex chars, shows "Invalid reset link" state with link to request a new one
  - New-password + confirm-password fields with client-side validation (min 8 chars, must match)
  - Submits to `POST /api/users/reset-password`
  - On success, shows confirmation and redirects to `login.html` after 2.5 seconds
  - Non-JSON server response → friendly error message
  - Responsive (768px / 480px breakpoints, iOS zoom fix on inputs)

- `login.html` — added "Forgot password?" link below the remember-me checkbox, pointing to `forgot-password.html`

### Tests

- `tests/unit/password-reset.test.js` — 30 new unit tests covering:
  - Token format validation (valid 64-char hex, too short, too long, non-hex, null)
  - Token expiry (future, past, boundary)
  - SHA-256 hashing (64-char output, deterministic, different inputs, one-way)
  - Password requirements enforcement (≥8 chars)
  - Passwords-match check (match, mismatch, case-sensitivity)
  - `forgot-password` response handling (200 with anti-enumeration message, HTML 404/500 → friendly message)
  - `reset-password` response handling (success, expired token, used token, invalid token, empty error body, HTML 500)

---

## No Database Changes

The `password_reset_tokens` table was already present in `backend/src/migrations/003_security_tables.sql` (added in v1.0.0). No new migration required.

---

## Test Results

Total: **97 unit tests, 0 failures** (was 67 in v1.4.4).
