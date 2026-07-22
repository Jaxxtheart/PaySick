# Requirements & Specifications — PaySick v1.8.1

**Version**: 1.8.1
**Date**: 2026-07-22

Carries forward all requirements from v1.8.0 with the following changes.

---

## Changed Requirements

### Login Page (UX)

| ID | Requirement | Change |
|----|-------------|--------|
| AUTH-01 | Login form requires email and password only — no role selector | **Updated**: role selector removed; was AUTH-01 "login form fields: role, email, password" |
| AUTH-02 | Failed login with `attemptsRemaining` in response must display count in error message | **New** |
| AUTH-03 | `ACCOUNT_LOCKED` response with `lockedUntil` must display minutes remaining in error message | **New** |
| AUTH-04 | `PASSWORD_REQUIRED` response must redirect to `forgot-password.html` with prefilled email | **New** |
| AUTH-05 | Password field must include a show/hide toggle button | **New** |
| AUTH-06 | Login page must not include a site-wide footer | **New** |
| AUTH-07 | Error shake animation must re-trigger on consecutive errors | **New** |

---

## Inherited Requirements (unchanged from v1.8.0)

All v1.8.0 requirements remain in effect. See `code-backups/v1.8.0/REQUIREMENTS.md`.
