# Release Notes — PaySick v1.5.6

**Version**: 1.5.6
**Date**: 2026-03-31
**Type**: PATCH — Bug fix: password reset email delivery

---

## Summary

Fixed two bugs that caused password reset emails to silently fail in production:

1. **Wrong reset URL domain (BUG 1)**: `APP_URL` was not set in `vercel.json`, causing the reset link in every email to point to `http://localhost:3000` instead of `https://paysick.co.za`. Users who received an email would click a link that did not work.

2. **Silent Ethereal fallback in production (BUG 2)**: When `SMTP_HOST` is unset and `NODE_ENV=production`, the email service silently fell back to an Ethereal test account. Emails appeared "sent" (the route returned HTTP 200 and logged success) but were delivered to a fake test inbox that nobody monitors. Users never received their reset email.

---

## Fixed

- **`vercel.json`**: Added `APP_URL=https://paysick.co.za` to the `env` block so all emailed links (password reset, email verification) use the correct production domain.

- **`backend/src/services/email.service.js`**: Added production guard in `sendMail()` — when `NODE_ENV === 'production'` and `SMTP_HOST` is not set, throws a clear `Error` with message `"SMTP_HOST is required in production. Configure SMTP environment variables in the Vercel dashboard."` This surfaces the misconfiguration immediately rather than silently swallowing it.

---

## Tests Added

- **`tests/unit/email-service.test.js`** — 5 new unit tests (total: 102 unit tests):
  1. Reset link contains the correct paysick.co.za domain when `APP_URL` is set *(regression guard for BUG 1)*
  2. DEFECT (pre-fix): reset link defaults to `localhost:3000` when `APP_URL` is unset *(documents old broken behaviour)*
  3. `sendPasswordResetEmail` throws a clear error when `NODE_ENV=production` and `SMTP_HOST` is missing *(regression guard for BUG 2)*
  4. `sendPasswordResetEmail` succeeds when `NODE_ENV=production` and `SMTP_HOST` IS set
  5. `sendPasswordResetEmail` does NOT throw in development without `SMTP_HOST` (Ethereal fallback preserved for local dev)

---

## Action Required After Deploy

The `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` environment variables must be set in the **Vercel dashboard** (Environment Variables section). These are secrets and cannot be committed to `vercel.json`. Without them, the production guard introduced in this release will throw a clear error on any password reset or email verification attempt, making the misconfiguration visible in Vercel function logs.

Recommended: SendGrid SMTP
- `SMTP_HOST`: `smtp.sendgrid.net`
- `SMTP_PORT`: `587`
- `SMTP_USER`: `apikey`
- `SMTP_PASS`: your SendGrid API key

---

## Root Cause

The forgot-password route (`backend/src/routes/users.js`, lines 359–414) deliberately swallows email errors to preserve the anti-enumeration guarantee (always returns HTTP 200 regardless of whether the email address exists). This means SMTP failures were silently swallowed, making the bug invisible to callers. The fix ensures that a missing SMTP configuration fails loudly in function logs (via the thrown error) while the route-level behaviour remains unchanged for legitimate email send failures.
