# Architecture — PaySick v1.3.3

**Version**: 1.3.3
**Date**: 2026-03-13

---

## System Overview

*(Unchanged from v1.3.2)*

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

## Demo User Navigation Flow (v1.3.3)

```
demo-login.html
  │
  ├── Enter password → role selection
  │
  └── Click "Patient" → POST /api/users/demo-login
        │
        ├── Server error (HTML) → "Server error (N). Is the server running?"
        │                          (previously: raw SyntaxError)
        │
        └── Success → store token → redirect
              │
              ├── onboarding not done → onboarding.html → dashboard.html
              │
              └── onboarding done ────────────────────► dashboard.html
                                                              │
                                                    "Apply for Funding"
                                                              │
                                                    marketplace-apply.html  ← FIXED (was onboarding.html)
                                                              │
                                                    Step 1: Select procedure type
                                                    Step 2: Loan amount & term
                                                    Step 3: Employment details
                                                    Step 4: Review & submit
                                                              │
                                                    POST /api/marketplace/applications
                                                              │
                                                    Demo response (preview offers)
```

---

## API Client Error Handling (v1.3.3)

```
PaySickAPI.request(endpoint, options)
  │
  ├── fetch(url, config)
  │     └── network failure → catch(error) → re-throw → caller handles
  │
  ├── response.json()  ← wrapped in own try/catch
  │     └── non-JSON body → throw Error("Server error (N). Please try again shortly.")
  │
  ├── !response.ok → throw Error(data.error || 'Request failed')
  │
  └── response.ok → return data
```

All pages using `PaySickAPI` (dashboard, marketplace-apply, payments, lender-dashboard, etc.) now receive readable error messages when the API returns non-JSON responses.

---

## Frontend Pages (v1.3.3)

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

## Changes from v1.3.2

- `dashboard.html`: "Apply for Funding" nav link changed from `onboarding.html` to `marketplace-apply.html`
- `dashboard.html`: "Apply now" inline link (empty payment plans state) changed to `marketplace-apply.html`
- `api-client.js`: `response.json()` wrapped in its own try/catch — non-JSON responses produce `Server error (N)` instead of re-throwing a `SyntaxError`
- `demo-login.html`: Same `response.json()` fix applied to the demo login fetch call
