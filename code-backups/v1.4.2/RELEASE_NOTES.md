# Release Notes — PaySick v1.4.2

**Version**: 1.4.2
**Date**: 2026-03-24
**Type**: PATCH — Critical bug fix: registration/onboarding returning Server error (404)

---

## Summary

Fixed a critical regression where account registration was failing with "Server error (404). Please try again shortly." for all users in production. The root cause was a `process.exit(1)` call in `backend/src/server.js` that killed the Vercel serverless function during startup if required environment variables (`TOKEN_SECRET`, `ENCRYPTION_KEY`) were missing. When the process exited before handling any request, Vercel returned an HTML error page (not JSON), which caused the frontend's `response.json()` call to throw, triggering the misleading 404 error message.

This is the same class of bug as the `process.exit(-1)` removed from the database pool error handler in v1.3.1, but in a different location.

---

## Fixed

### `backend/src/server.js` — removed `process.exit(1)` from startup validation

**Before:**
```javascript
try {
  validateEnvironment();
} catch (error) {
  console.error('FATAL:', error.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);  // kills the Vercel function → Vercel returns HTML 404
  }
}
```

**After:**
```javascript
// Do NOT call process.exit() — in serverless, exiting causes the function to
// die before it can return a JSON error response.
try {
  validateEnvironment();
} catch (error) {
  console.error('FATAL:', error.message);
}
```

**Impact of fix:** If `TOKEN_SECRET` or `ENCRYPTION_KEY` are missing, the app now starts normally. Any route that actually uses these values will throw inside its own `try/catch` block and return a proper JSON 500 response — which the frontend can parse and display correctly. No more silent HTML 404 from Vercel.

---

## Root Cause Analysis

```
Vercel invokes /api/index.js (serverless function)
  │
  ├── server.js module loads
  │     └── validateEnvironment() → throws if TOKEN_SECRET / ENCRYPTION_KEY missing
  │           └── catch block → process.exit(1)  ← KILLS THE PROCESS
  │
  └── Vercel receives non-zero exit → returns HTML error page (status 404 or 500)

Frontend (register.html):
  fetch('/api/users/register')
    └── response.json()  ← THROWS because body is HTML, not JSON
          └── catch → showAlert('error', `Server error (${response.status}). Please try again shortly.`)
```

The same `process.exit()` pattern was already identified and fixed in `database.js` pool error handler (v1.3.1). This was a parallel instance in the startup validation path.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/server.js` | Removed `process.exit(1)` from `validateEnvironment()` error handler |

---

## No Breaking Changes

Routes that require `TOKEN_SECRET` (token signing/verification) or `ENCRYPTION_KEY` (banking data encryption) will still fail if those env vars are missing — they will now return a JSON 500 instead of causing the entire function to crash. The fix does not reduce security: missing env vars are still logged as FATAL.
