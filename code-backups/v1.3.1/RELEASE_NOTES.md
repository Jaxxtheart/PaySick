# Release Notes — PaySick v1.3.1

**Version**: 1.3.1
**Date**: 2026-03-13
**Type**: PATCH — Bug fix

---

## Summary

Fixed a crash-on-error in the database pool that caused new account creation to fail silently with "Unable to connect to the server" in production (Vercel serverless).

---

## Bug Fixes

### `pool.on('error')` called `process.exit(-1)` in serverless context
- **File**: `backend/src/config/database.js`
- **Problem**: When an idle PostgreSQL client emitted an error event, the `pool.on('error')` handler called `process.exit(-1)`. In a Vercel serverless environment this terminates the function process, causing subsequent requests (including `/api/users/register`) to receive a non-JSON HTML error response from Vercel's hosting layer rather than from the Express app.
- **Fix**: Removed the `process.exit(-1)` call. The error is now logged only. The pool will recover naturally for subsequent connections.

### Frontend `response.json()` failure swallowed as misleading network error
- **File**: `register.html`
- **Problem**: `response.json()` was inside the same `try/catch` as the `fetch()` call. When the server returned a non-JSON body (HTML error page from the hosting layer), `response.json()` threw a `SyntaxError` which was caught and displayed as "Unable to connect to the server. Please check your connection and try again." — masking the real server-side failure.
- **Fix**: Wrapped `response.json()` in its own inner `try/catch`. Non-JSON responses now surface as `Server error (${status})` with the HTTP status code, making failures easier to diagnose.

---

## No Changes To

- API routes or middleware
- Authentication or session management
- Database schema or migrations
- Frontend pages other than `register.html`
