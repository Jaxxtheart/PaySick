# Architecture — PaySick v1.3.1

**Version**: 1.3.1
**Date**: 2026-03-13

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (CDN + Serverless)              │
│                                                           │
│  Static HTML  ←──────────────────────────────────────┐   │
│  (Frontend)                                           │   │
│  index.html, about.html, contact.html, login.html,   │   │
│  dashboard.html, providers.html, payments.html, ...   │   │
│                                                       │   │
│  /api/* → api/index.js → Express App                 │   │
│  /health → api/index.js → Express App                │   │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   Express App (server.js)                 │
│                                                           │
│  Middleware: Helmet, CORS, Morgan, Rate Limiting          │
│                                                           │
│  Routes:                                                  │
│  /api/users        → users.js                            │
│  /api/applications → applications.js                     │
│  /api/payments     → payments.js                         │
│  /api/providers    → providers.js                        │
│  /api/marketplace  → marketplace.js                      │
│  /api/risk         → risk.js                             │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                     PostgreSQL (Vercel Postgres)           │
│                                                           │
│  Tables: users, sessions, applications, payments,         │
│          providers, marketplace, risk_assessments         │
│                                                           │
│  Pool error events: logged only — no process.exit()       │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend Pages (v1.3.1)

| Page | Route | Auth Required |
|------|-------|---------------|
| index.html | / | No |
| about.html | /about | No |
| contact.html | /contact | No |
| login.html | /login | No |
| register.html | /register | No |
| dashboard.html | /dashboard | Yes (user) |
| providers.html | /providers | No |
| admin-dashboard.html | /admin-dashboard | Yes (admin) |
| privacy-policy.html | /privacy-policy | No |
| terms-of-service.html | /terms-of-service | No |
| privacy.html | /privacy | No (legacy alias) |
| terms.html | /terms | No (legacy alias) |

---

## API Layers

### Auth Middleware
- `authenticateToken` — validates opaque token from Authorization header
- `requireRole(role)` — checks user role after authentication
- Tokens stored in `sessions` table (not JWT — no signing key exposure)

### Security Service
- `encryptBankingData(data)` → AES-256-GCM encrypted string (never base64)
- `decryptBankingData(encrypted)` → plaintext
- `hashPassword(password)` → scrypt hash
- `verifyPassword(password, hash)` → boolean
- `generateToken()` → cryptographically random opaque token
- `validateEnvironment()` → fails fast if secrets missing in production

### Database Pool (v1.3.1 change)
- `pool.on('error')` logs the error but does **not** call `process.exit()`.
- Calling `process.exit()` in a Vercel serverless function terminates the handler process, causing subsequent requests to receive a non-JSON HTML error page from the hosting layer rather than a proper API response.

### Serverless Entry
```
api/index.js
  └── require('../backend/src/server')
      └── module.exports = app  (no app.listen() when VERCEL === '1')
```

---

## Deployment Configuration

```json
vercel.json:
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" },
    { "source": "/health",   "destination": "/api/index.js" }
  ],
  "env": {
    "NODE_ENV": "production",
    "ALLOW_DEMO_LOGIN": "true",
    "CORS_ORIGIN": "https://paysick.co.za,https://www.paysick.co.za"
  }
}
```

---

## Changes from v1.3.0

- `database.js`: Removed `process.exit(-1)` from `pool.on('error')` handler
- `register.html`: `response.json()` wrapped in its own try/catch to surface server-side HTTP errors rather than masking them as a network connectivity failure
