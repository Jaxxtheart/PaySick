# Architecture — PaySick v1.8.1

**Version**: 1.8.1
**Date**: 2026-07-22

No architectural changes from v1.8.0. This patch modifies only `login.html` (frontend) and adds a test stub.

See `code-backups/v1.8.0/ARCHITECTURE.md` for the current system architecture diagram.

---

## Login Page Flow (updated)

```
User loads login.html
        │
        ▼
Does localStorage contain 'paysick_remember'?
    Yes ──► Call POST /api/users/refresh-token
    │           ├── OK  ──► Call GET /api/users/profile ──► store user + redirect
    │           └── Fail ──► clear 'paysick_remember', show form
    No ──► Show form (email + password only, no role selector)
        │
        ▼
User submits form
        │
        ▼
POST /api/users/login
        │
        ├── 200 OK + accessToken
        │       ├── Remember Me? ──► store refreshToken + email + role in 'paysick_remember'
        │       └── Redirect based on data.user.role (no dropdown fallback)
        │
        ├── 403 EMAIL_UNVERIFIED ──► show message ──► redirect verify-email.html
        │
        ├── 403 PASSWORD_REQUIRED ──► show message ──► redirect forgot-password.html
        │
        ├── 403 ACCOUNT_LOCKED ──► show "Try again in N minutes"
        │
        ├── 401 INVALID_CREDENTIALS
        │       ├── attemptsRemaining > 0 ──► "X attempts remaining before lockout"
        │       └── attemptsRemaining = 0 ──► "Account has been locked"
        │
        └── 429 / other ──► show error message
```
