# Architecture — PaySick v1.4.2

**Version**: 1.4.2
**Date**: 2026-03-24

---

## System Overview

*(Unchanged from v1.4.1)*

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (CDN + Serverless)              │
│  Static HTML → /api/* → api/index.js → Express App       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   Express App (server.js)                 │
│  /api/users, /api/applications, /api/payments,           │
│  /api/providers, /api/marketplace, /api/risk             │
│  /v2/shield  ← Shield framework endpoints                │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL — pool errors logged only, no process.exit() │
└─────────────────────────────────────────────────────────┘
```

---

## Serverless Startup Safety (FIXED in v1.4.2)

```
Serverless function startup — CORRECT behaviour (v1.4.2+):

  api/index.js invoked by Vercel
    │
    └── server.js module loads
          ├── validateEnvironment()
          │     ├── OK → app starts normally
          │     └── throws → console.error('FATAL') → app starts anyway
          │           (routes that need TOKEN_SECRET / ENCRYPTION_KEY will
          │            throw inside their own try/catch and return JSON 500)
          │
          └── Express app returned to Vercel → handles request → JSON response

  NEVER call process.exit() during startup:
    - process.exit(1) kills the Vercel lambda before it can respond
    - Vercel then serves an HTML error page (status 404 or 500)
    - Frontend response.json() throws → shows "Server error (404)"
    - This was the root cause of the registration failure reported in
      closed user group testing (2026-03-24)

  Rules enforced:
    - database.js pool.on('error') → log only (fixed v1.3.1)
    - server.js validateEnvironment catch → log only (fixed v1.4.2)
    - No other process.exit() calls in request path
```

---

## Footer Layout

*(Unchanged from v1.4.1 — Company section removed, 3-column footer)*

---

## Login Page Mobile Layout

*(Unchanged from v1.4.1 — 768px and 480px breakpoints)*

---

## Fee Model

*(Unchanged from v1.4.0)*

---

## Frontend Pages (v1.4.2)

| Page | Change |
|------|--------|
| `backend/src/server.js` | Removed `process.exit(1)` from validateEnvironment error handler |
| All other files | Unchanged from v1.4.1 |
