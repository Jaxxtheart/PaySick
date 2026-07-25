# Architecture — PaySick v1.8.2

**Version**: 1.8.2
**Date**: 2026-07-25

No architectural changes from v1.8.1. This patch modifies security behaviour in
existing components only (verify-email.html, users.js, email.service.js).

See `code-backups/v1.8.0/ARCHITECTURE.md` for the current system architecture diagram.

---

## Security Behaviour Changes

### verify-email.html — confirmation gate
```
Before (v1.8.1):
  Page loads → if token in URL → immediately POST /api/users/verify-email
  ⚠ Email scanners consume the token before the user clicks

After (v1.8.2):
  Page loads → if token in URL → show stateConfirm (button)
  User clicks "Confirm Email Address" → POST /api/users/verify-email
  ✓ Scanners cannot consume the token by prefetching
```

### users.js — rate limiting coverage
```
Before (v1.8.1):
  /api/users/login              → loginRateLimit ✓
  /api/users/register           → registrationRateLimit ✓
  /api/users/forgot-password    → (none) ✗
  /api/users/resend-verification → (none) ✗

After (v1.8.2):
  /api/users/forgot-password    → forgotPasswordRateLimit (5/hr) ✓
  /api/users/resend-verification → resendVerificationRateLimit (5/hr) ✓
```

### email.service.js — clean URL links
```
Before (v1.8.1):
  Reset link:  https://paysick.co.za/reset-password.html?token=X
               → Vercel cleanUrls 308-redirects to /reset-password?token=X

After (v1.8.2):
  Reset link:  https://paysick.co.za/reset-password?token=X
               → No redirect, direct hit
  Verify link: https://paysick.co.za/verify-email?token=X
               → No redirect, direct hit
```
