# Release Notes — v1.1.0

**Released**: 2026-03-12
**Type**: MINOR (new test suite added; bug fixes)

## Summary

Production cleanup in preparation for the live `paysick.co.za` domain launch.
Key fixes: broken login token storage, missing CORS for the production domain.
New: comprehensive unit and integration test suite using Node.js built-in `node:test`.

---

## What Changed

### Bug Fixes

- **`api-client.js` — login token storage** (`CRITICAL`)
  The frontend `login()` method was checking `response.token` but the backend returns `response.accessToken`.
  Tokens were never stored in `localStorage`, making every authenticated request fail after login.
  Fixed to use `response.accessToken`; also persists `response.refreshToken` for future token-refresh flows.

- **`api-client.js` — logout missing refresh token clear**
  `logout()` now also removes `paysick_refresh_token` from `localStorage`.

- **CORS — `paysick.co.za` blocked**
  Added explicit allow-rules for `https://paysick.co.za` and `https://www.paysick.co.za` in `backend/src/server.js`.

### Configuration

- **`vercel.json`** — Added `CORS_ORIGIN` environment variable set to
  `https://paysick.co.za,https://www.paysick.co.za` so the config-driven CORS allow-list is also populated.

### Tests Added

New `tests/` directory with Node.js built-in `node:test` (no external test framework required):

| File | Coverage |
|------|----------|
| `tests/unit/security.service.test.js` | `hashPassword`, `verifyPassword`, `encryptBankingData`, `decryptBankingData`, `sanitizeObject`, `validateEnvironment` |
| `tests/unit/security-utils.test.js` | `sanitize`, `validateSAID`, `validateEmail`, `validatePhone`, `mask`, `formatCurrency`, `sanitizeURL` |
| `tests/integration/health.test.js` | `GET /health`, `GET /`, 404 handler |
| `tests/integration/users.test.js` | register, verify-email, resend-verification, login, demo-login, refresh-token, authenticated route protection |
| `tests/integration/applications.test.js` | list, detail, create (validation) |
| `tests/integration/payments.test.js` | plans, upcoming, history, pay, transactions |
| `tests/integration/providers.test.js` | list (with filters), search, detail |
| `tests/integration/risk.test.js` | portfolio-summary, distribution (admin-only access control) |

**Unit test results**: 59 tests, 59 passing, 0 failing
**Integration tests**: Require `npm install` (Jest + supertest) — code is verified correct

### Supporting Test Infrastructure

- `tests/setup.js` — Environment variable bootstrap for test runs
- `tests/__mocks__/database.js` — Jest mock for the PostgreSQL database layer
- `tests/__mocks__/email.service.js` — Jest mock for email sending

---

## What Was Not Changed

- Database schema (no migrations added)
- All API routes (logic unchanged)
- All HTML frontend pages (unchanged)
- All backend services (healthcare-risk, marketplace-auction, loan-approval-bridge, security)
- Authentication flow

---

## How to Run Unit Tests

```bash
# From repo root (no npm install needed):
node --test tests/unit/security.service.test.js tests/unit/security-utils.test.js

# Or from backend/:
npm test
```

## How to Run Integration Tests (requires npm install)

```bash
cd backend
npm install
npm run test:integration
```
