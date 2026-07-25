# Requirements & Specifications — PaySick v1.8.2

**Version**: 1.8.2
**Date**: 2026-07-25

Carries forward all requirements from v1.8.1 with the following additions.

---

## Changed / New Requirements

### Email Verification Flow

| ID | Requirement | Change |
|----|-------------|--------|
| VERIF-01 | `verify-email.html` must NOT automatically POST the verification token on page load | **New** |
| VERIF-02 | When a verification token is present in the URL, the page must show a "Confirm Email Address" button that the user must explicitly click to trigger verification | **New** |
| VERIF-03 | Email verification links sent by the backend must use the clean URL path `/verify-email?token=` (no `.html` extension) | **New** |

### Password Reset Flow

| ID | Requirement | Change |
|----|-------------|--------|
| RESET-01 | `POST /api/users/forgot-password` must apply a rate limiter (max 5 requests per IP per hour) | **New** |
| RESET-02 | `POST /api/users/resend-verification` must apply a rate limiter (max 5 requests per IP per hour) | **New** |
| RESET-03 | `POST /api/users/forgot-password` must return the same generic 200 response regardless of whether the SMTP send succeeded — email send failures must be logged but must not cause a 500 response | **New** |
| RESET-04 | Password reset links sent by the backend must use the clean URL path `/reset-password?token=` (no `.html` extension) | **New** |

---

## Inherited Requirements (unchanged from v1.8.1)

All v1.8.1 requirements remain in effect. See `code-backups/v1.8.1/REQUIREMENTS.md`.
