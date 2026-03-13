# Architecture — PaySick v1.3.4

**Version**: 1.3.4
**Date**: 2026-03-13

---

## System Overview

*(Unchanged from v1.3.3)*

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
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL — pool errors logged only, no process.exit() │
└─────────────────────────────────────────────────────────┘
```

---

## Demo Access Entry Point (v1.3.4)

```
login.html
  │
  ├── [primary flow] Email + Password → POST /api/users/login
  │
  └── [below fold] "Demo access" → demo-login.html
        (single link; duplicate removed in v1.3.4)
```

---

## Demo User Navigation Flow

*(Unchanged from v1.3.3)*

```
demo-login.html
  │
  ├── Enter password → role selection
  │
  └── Click role → POST /api/users/demo-login
        │
        └── Success → store token → redirect by role
              ├── admin   → admin-dashboard.html
              ├── lender  → lender-dashboard.html
              └── default → dashboard.html
```

---

## Frontend Pages (v1.3.4)

*(Unchanged from v1.3.3)*

| Page | Route | Auth Required |
|------|-------|---------------|
| index.html | / | No |
| about.html | /about | No |
| contact.html | /contact | No |
| demo-login.html | /demo-login | No (password-gated) |
| login.html | /login | No |
| register.html | /register | No |
| onboarding.html | /onboarding | Yes (user) |
| dashboard.html | /dashboard | Yes (user) |
| marketplace-apply.html | /marketplace-apply | Yes (user) |
| marketplace-offers.html | /marketplace-offers | Yes (user) |
| providers.html | /providers | No |
| provider-apply.html | /provider-apply | No |
| admin-dashboard.html | /admin-dashboard | Yes (admin) |
| privacy-policy.html | /privacy-policy | No |
| terms-of-service.html | /terms-of-service | No |

---

## Changes from v1.3.3

- `login.html`: Duplicate "Demo" link removed from `.back-home`; single "Demo access" link positioned below fold
