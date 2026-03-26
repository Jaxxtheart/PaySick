# Release Notes — v1.5.3

**Date**: 2026-03-26
**Type**: PATCH — Diagnostic crash wrapper for Vercel HTML 500 + missing integration tests

---

## What Changed

### api/index.js — Crash diagnostic wrapper
Replaced bare `module.exports = app` with a try/catch wrapper that catches any exception thrown during `require('../backend/src/server')`. If the module fails to load, the handler now returns:

```json
{ "error": "Server failed to start", "code": "SERVER_LOAD_ERROR" }
```

as `application/json` with status 500, instead of letting Vercel serve its HTML error page. This makes an opaque HTML 500 into a diagnosable JSON response.

### api/[...slug].js — Same diagnostic wrapper
Applied the identical catch wrapper so the Vercel catch-all function (which receives `/api/*` requests via file-system routing) also converts load crashes to JSON.

### tests/integration/users.test.js — 14 new integration tests
Added full integration test coverage for two endpoints that previously had zero tests:

**POST /api/users/forgot-password** (7 tests)
- Response content-type is always `application/json` (never HTML)
- Returns 400 when `email` is missing
- Returns 400 when `email` is not a string
- Returns 200 with generic message when email is **not** in database (anti-enumeration)
- Returns 200 with **same** generic message when email **is** in database (anti-enumeration)
- Returns 200 (not 500) even when the database query throws

**POST /api/users/reset-password** (7 tests)
- Response content-type is always `application/json` (never HTML)
- Returns 400 with `INVALID_TOKEN` when token is missing
- Returns 400 with `INVALID_TOKEN` when token is not 64 characters
- Returns 400 when `new_password` is missing
- Returns 400 with `INVALID_TOKEN` when token hash not found in DB
- Returns 400 with `TOKEN_EXPIRED` when token has expired
- Returns 200 on successful password reset

---

## What Was Added
- Crash diagnostic wrappers in `api/index.js` and `api/[...slug].js`
- 14 integration tests for forgot-password and reset-password flows

## What Was Removed
- Nothing

## What Was Fixed
- Production API returning Vercel HTML 500 now returns diagnosable JSON instead
