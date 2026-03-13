# Architecture — PaySick v1.3.2

**Version**: 1.3.2
**Date**: 2026-03-13

---

## System Overview

*(Unchanged from v1.3.1)*

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

## Frontend Pages (v1.3.2)

| Page | Route | Auth Required |
|------|-------|---------------|
| index.html | / | No |
| about.html | /about | No |
| contact.html | /contact | No |
| login.html | /login | No |
| register.html | /register | No |
| provider-apply.html | /provider-apply | No |
| dashboard.html | /dashboard | Yes (user) |
| providers.html | /providers | No |
| admin-dashboard.html | /admin-dashboard | Yes (admin) |
| privacy-policy.html | /privacy-policy | No |
| terms-of-service.html | /terms-of-service | No |
| privacy.html | /privacy | No (legacy alias) |
| terms.html | /terms | No (legacy alias) |

---

## Provider Application Form Error Handling (v1.3.2)

```
submitApplication()
  │
  ├── fetch('/api/providers/apply')
  │     └── network failure → catch(err) → showFormError('Unable to connect…')
  │
  ├── response.json()   ← wrapped in own try/catch
  │     └── non-JSON body (HTML error page) → showFormError('Server error (N)')
  │
  ├── !response.ok → showFormError(result.error || 'Application submission failed')
  │
  └── response.ok → hide form, show #successMessage
```

All error paths write to `#errorBanner` (inline, styled, scrolled into view).
No `alert()` calls remain in the provider application flow.

---

## Changes from v1.3.1

- `provider-apply.html`: Added `.error-banner` / `#errorBanner` inline error display element
- `provider-apply.html`: `response.json()` wrapped in its own try/catch — non-JSON server responses surface the HTTP status code rather than a raw SyntaxError
- `provider-apply.html`: All error paths replaced `alert()` with `showFormError()` (inline banner)
- `provider-apply.html`: Eliminated double `response.json()` call (was called separately for error and success paths); now called once and used for both
