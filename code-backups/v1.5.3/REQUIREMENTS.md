# Requirements & Specifications — PaySick v1.5.3

**Version**: 1.5.3
**Date**: 2026-03-26

Carries forward all requirements from v1.5.2 with the following additions.

---

## New Requirements — API Reliability & Testability

### 4.1 Production API Error Format

| ID | Requirement | Priority |
|----|-------------|----------|
| API-01 | All API responses must be `application/json` — never HTML | Must Have |
| API-02 | Module-load failures in Vercel serverless functions must return `{"error":"Server failed to start","code":"SERVER_LOAD_ERROR"}` as JSON 500 instead of HTML | Must Have |
| API-03 | `api/index.js` and `api/[...slug].js` must wrap server module loading in try/catch | Must Have |

### 4.2 Integration Test Coverage

| ID | Requirement | Priority |
|----|-------------|----------|
| TEST-08 | Integration tests must cover `POST /api/users/forgot-password` — content-type, input validation, anti-enumeration, DB failure resilience | Must Have |
| TEST-09 | Integration tests must cover `POST /api/users/reset-password` — content-type, token validation, expiry, successful reset | Must Have |
| TEST-10 | The most critical integration test assertion is: response content-type is always `application/json`, never HTML | Must Have |

---

## Carried Forward — Password Reset Flow (v1.5.2)

### 3.1 Forgot Password

| ID | Requirement | Priority |
|----|-------------|----------|
| PW-01 | Users must be able to request a password reset by entering their registered email address | Must Have |
| PW-02 | The API must always return the same `200` response regardless of whether the email is registered (anti-enumeration) | Must Have |
| PW-03 | A reset link must be sent via email when the email is registered | Must Have |
| PW-04 | The reset token must be 32 cryptographically random bytes (64 hex chars) | Must Have |
| PW-05 | Only the SHA-256 hash of the token may be stored in the database; the raw token is never persisted | Must Have |
| PW-06 | Any existing unused reset tokens for the user must be invalidated before issuing a new one | Must Have |
| PW-07 | The reset token must expire in 1 hour | Must Have |
| PW-08 | A `PASSWORD_RESET_REQUESTED` security event must be logged | Should Have |

### 3.2 Reset Password

| ID | Requirement | Priority |
|----|-------------|----------|
| PW-09 | The reset endpoint must accept `{ token, password }` | Must Have |
| PW-10 | Tokens that are not 64-char hex strings must be rejected with `400` | Must Have |
| PW-11 | Tokens that are expired, already used, or not found must be rejected with `400` | Must Have |
| PW-12 | Updating the password and marking the token as used must occur in a single database transaction | Must Have |
| PW-13 | All active sessions for the user must be revoked when a password reset is completed | Must Have |
| PW-14 | A `PASSWORD_CHANGED` security event must be logged | Should Have |
| PW-15 | Passwords must be hashed with scrypt before storage | Must Have |

### 3.3 Frontend

| ID | Requirement | Priority |
|----|-------------|----------|
| PW-16 | `forgot-password.html` must show a generic success message after submission regardless of outcome | Must Have |
| PW-17 | `reset-password.html` must validate that the token in the URL is present and 64 chars before rendering the form | Must Have |
| PW-18 | `reset-password.html` must enforce minimum password length (≥ 8 chars) and passwords-match client-side | Must Have |
| PW-19 | All fetch calls in reset pages must wrap `response.json()` in try/catch — no raw errors shown to users | Must Have |
| PW-20 | `login.html` must link to `forgot-password.html` | Must Have |

### 3.4 Test Coverage

| ID | Requirement | Priority |
|----|-------------|----------|
| TEST-03 | Unit test suite must include tests for token format validation | Must Have |
| TEST-04 | Unit test suite must include tests for token expiry logic | Must Have |
| TEST-05 | Unit test suite must include tests for anti-enumeration (same message for known/unknown email) | Must Have |
| TEST-06 | Unit test suite must include tests for reset response handling (success, expired, used, invalid, non-JSON) | Must Have |
| TEST-07 | Total unit tests must be ≥ 97 | Must Have |
