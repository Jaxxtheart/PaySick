# Architecture — PaySick v1.5.3

**Version**: 1.5.3
**Date**: 2026-03-26

---

## Updated: Vercel Serverless Function Entry Points

Both `api/index.js` and `api/[...slug].js` now use a crash-safe wrapper pattern:

```
Vercel receives request
        |
        v
api/[...slug].js (file-system catch-all for /api/*)
        |
        v
try { app = require('../backend/src/server') }
        |
   throws?
  yes  /  \ no
      /    \
     v      v
JSON 500   app(req, res)
{ error:       |
  "Server       v
  failed to   Express middleware chain
  start",          |
  code:            v
  "SERVER_    Route handler (users, payments, ...)
  LOAD_            |
  ERROR" }         v
                JSON response
```

### Key property
A module-load crash (missing dependency, bad env var at load time, syntax error) now returns `application/json` with `{"error":"Server failed to start","code":"SERVER_LOAD_ERROR"}` instead of Vercel's HTML 500 page. The frontend can parse this; before v1.5.3 it could not.

---

## Vercel Routing (as of v1.5.2 + v1.5.3)

```
Incoming request
        |
        v
Vercel routing engine
        |
        +-- /health           → api/index.js      (explicit rewrite, vercel.json)
        +-- /api/(.*)         → api/index.js      (explicit rewrite, vercel.json)
        +-- /api/[...slug]    → api/[...slug].js  (file-system catch-all, fallback)
        |
Both api/index.js and api/[...slug].js load backend/src/server.js
```

---

## Password Reset Flow (unchanged from v1.5.2)

```
User                     Frontend                     Backend API                   Database
 |                           |                              |                            |
 |--- GET /forgot-password.html ---->|                      |                            |
 |<-- form (email input) ------------|                      |                            |
 |                           |                              |                            |
 |--- submit email ----------|                              |                            |
 |                           |-- POST /api/users/forgot-password --> lookup user        |
 |                           |                              |<---- user row (or null) ---|
 |                           |                              |                            |
 |                           |                              |-- if found:                |
 |                           |                              |   invalidate old tokens ---|
 |                           |                              |   generate rawToken        |
 |                           |                              |   store SHA-256(rawToken) -|
 |                           |                              |   send email (async)       |
 |                           |                              |                            |
 |                           |<-- 200 { message: "If an account..." } ------------------|
 |<-- generic success card --|                              |                            |
 |                           |                              |                            |
 |--- click link in email ------------------> GET /reset-password.html?token=RAW        |
 |<-- form (password inputs) ------------|                  |                            |
 |                           |                              |                            |
 |--- submit new password ----|                             |                            |
 |                           |-- POST /api/users/reset-password (token, password) ----->|
 |                           |                              |-- lookup SHA-256(token)  --|
 |                           |                              |   check used=false         |
 |                           |                              |   check expires_at > now   |
 |                           |                              |                            |
 |                           |                              |-- BEGIN TRANSACTION        |
 |                           |                              |   mark token used        --|
 |                           |                              |   update password_hash   --|
 |                           |                              |   revoke all sessions    --|
 |                           |                              |-- COMMIT                   |
 |                           |                              |                            |
 |                           |<-- 200 { message: "Password reset successfully." } -------|
 |<-- success + redirect to login.html                      |                            |
```

---

## All other architecture unchanged from v1.4.4.

See `code-backups/v1.4.4/ARCHITECTURE.md` for the complete platform architecture.
