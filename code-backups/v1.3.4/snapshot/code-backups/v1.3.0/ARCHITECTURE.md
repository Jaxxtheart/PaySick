# Architecture — PaySick v1.3.0

**Version**: 1.3.0
**Date**: 2026-03-12

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
└─────────────────────────────────────────────────────────┘
```

---

## Frontend Pages (v1.3.0)

| Page | Route | Auth Required |
|------|-------|---------------|
| index.html | / | No |
| about.html | /about | No — NEW in v1.3.0 |
| contact.html | /contact | No — NEW in v1.3.0 |
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

## Changes from v1.2.0

- Added `about.html` and `contact.html` to frontend page inventory
- Fixed `index.html` provider network statement to generic compliant copy
- Fixed `privacy.html` / `terms.html` footer links to canonical filenames
- Fixed `contact.html` form submission to use `fetch()` instead of `alert()`
- No backend architectural changes
