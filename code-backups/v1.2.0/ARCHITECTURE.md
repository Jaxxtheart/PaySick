# Architecture — PaySick v1.2.0

**Version**: 1.2.0
**Date**: 2026-03-12

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         paysick.co.za                           │
│                    (Vercel static hosting)                      │
├─────────────────────────────────────────────────────────────────┤
│  FRONTEND (Static HTML + Vanilla JS)                            │
│                                                                 │
│  Patient: index.html → register.html → verify-email.html       │
│           → onboarding.html → dashboard.html                   │
│           → payments.html → make-payment.html → payment-success.html  [NEW v1.2.0]│
│                                                                 │
│  Providers: providers.html → provider-apply.html               │
│                                                                 │
│  Admin: admin-dashboard.html → admin-providers.html            │
│                                                                 │
│  Auth: login.html → demo-login.html                            │
│                                                                 │
│  Legal: privacy-policy.html, terms-of-service.html,            │
│         licenses.html, accessibility.html                      │
│                                                                 │
│  Marketplace: marketplace-apply.html, marketplace-offers.html  │
│  Other: lender-dashboard.html, collections.html                │
├─────────────────────────────────────────────────────────────────┤
│  API CLIENT (api-client.js)                                     │
│  PaySickAPI.users | .payments | .applications | .providers      │
│  All calls: Bearer token from localStorage['paysick_auth_token']│
└────────────────────────────┬────────────────────────────────────┘
                             │  /api/* → Vercel serverless rewrite
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  VERCEL SERVERLESS FUNCTION                                     │
│  api/index.js → require('../backend/src/server')               │
│  Guard: if (process.env.VERCEL !== '1') app.listen(PORT)       │
├─────────────────────────────────────────────────────────────────┤
│  EXPRESS API (backend/src/server.js)                           │
│                                                                 │
│  Middleware stack:                                              │
│  helmet → CORS (paysick.co.za allow-list) → morgan → rateLimit │
│  → validateEnvironment → auth extraction                       │
│                                                                 │
│  Routes:                                                        │
│  POST/GET  /api/users/*          users.js                      │
│  GET/POST  /api/applications/*   applications.js               │
│  GET/POST  /api/payments/*       payments.js                   │
│  GET/POST  /api/providers/*      providers.js        [EXTENDED v1.2.0]│
│  GET/POST  /api/marketplace/*    marketplace.js                │
│  GET       /api/risk/*           risk.js                       │
│  GET       /health               inline                        │
├─────────────────────────────────────────────────────────────────┤
│  SERVICES                                                       │
│                                                                 │
│  security.service.js    AES-256-GCM encrypt/decrypt, scrypt    │
│  email.service.js       Nodemailer + Ethereal dev fallback     │
│  healthcare-risk.service.js   PD/LGD/EL scoring               │
│  marketplace-auction.service.js  Lender matching               │
│  loan-approval-bridge.service.js  State transitions            │
├─────────────────────────────────────────────────────────────────┤
│  MIDDLEWARE                                                     │
│  auth.middleware.js                                            │
│    authenticateToken  — validates opaque token from DB         │
│    requireRole(role)  — checks user.role                       │
├─────────────────────────────────────────────────────────────────┤
│  DATABASE (Vercel Postgres / Neon — PostgreSQL)                │
│                                                                 │
│  Migrations (in order):                                        │
│  001_marketplace_tables.sql                                    │
│  002_healthcare_risk_scoring.sql                               │
│  002_seed_marketplace.sql                                      │
│  003_security_tables.sql  (tokens, audit_log, popia_log)       │
│  004_email_verification.sql  (email_verified, tokens on users) │
│                                                                 │
│  Key tables:                                                   │
│  users, session_tokens, refresh_tokens                         │
│  payment_applications, payment_plans, payment_transactions     │
│  providers  (+ account_number_encrypted AES-256-GCM)          │
│  lender_products, marketplace_applications                     │
│  audit_log, popia_access_log                                   │
│                                                                 │
│  Seed data:                                                    │
│  backend/database/seed-providers.sql  (fictional SA providers) │
└─────────────────────────────────────────────────────────────────┘
```

## Provider Route Access Control (v1.2.0)

```
Public (no auth):
  GET  /api/providers           — list active providers
  GET  /api/providers/search/:term
  GET  /api/providers/:id
  POST /api/providers/track-cta — always succeeds, never blocks
  POST /api/providers/apply     — submit application (status=pending)

Admin only (authenticateToken + requireRole('admin')):
  GET    /api/providers/admin/all
  GET    /api/providers/admin/stats
  PUT    /api/providers/admin/:id/approve
  PUT    /api/providers/admin/:id/status
  PUT    /api/providers/admin/:id
  DELETE /api/providers/admin/:id
```

## Vercel Deployment Architecture

```
vercel.json
  rewrites:
    /api/(.*)  → /api/index.js   (serverless function)
    /health    → /api/index.js
  cleanUrls: true
  env: NODE_ENV, ALLOW_DEMO_LOGIN, CORS_ORIGIN

api/index.js
  module.exports = require('../backend/src/server');

backend/src/server.js
  if (process.env.VERCEL !== '1') { app.listen(PORT) }
  module.exports = app;
```

## Changes from v1.1.0

- Added `api/index.js` serverless entry point
- Added VERCEL guard in `backend/src/server.js`
- `vercel.json` uses `rewrites` instead of deprecated `routes`/`builds`
- `providers.js` route extended with apply + admin CRUD (all admin routes authenticated)
- `payments.html`, `make-payment.html`, `payment-success.html` added to frontend
- Provider section added to `index.html` homepage
