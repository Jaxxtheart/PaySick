# Release Notes — v1.5.4

**Date**: 2026-03-26
**Type**: PATCH — Root cause fix for all API 500 errors in production

---

## Root Cause

`backend/src/routes/providers.js` imported `requireRole` from `auth.middleware.js`:

```javascript
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
```

But `requireRole` was **never defined or exported** from `auth.middleware.js`. Destructuring a non-existent export gives `undefined`. When Node.js loads `providers.js` at server startup, it registers routes at the module level — and `requireRole('admin')` passed as Express middleware fails immediately with:

```
TypeError: requireRole is not a function
    at Object.<anonymous> (/var/task/backend/src/routes/providers.js:191:45)
```

This crashed `server.js` before `module.exports = app` was reached, so the Vercel function had no callable handler — causing every API route to return 500.

## Fix

Added `requireRole(role)` to `auth.middleware.js` as a factory function returning role-checking middleware. Consistent with the existing `requireAdmin`, `requireLender`, `requireProvider` pattern. Added to `module.exports`.

## How It Was Found

The v1.5.3 crash diagnostic wrapper (`try { app = require('../backend/src/server') } catch`) converted the opaque Vercel HTML 500 into a JSON response. The Vercel function logs then revealed:

```
[PaySick] FATAL: server failed to load: requireRole is not a function
```

## Files Changed

- `backend/src/middleware/auth.middleware.js` — added `requireRole(role)` function and export
