# Architecture — PaySick v1.3.5

**Version**: 1.3.5
**Date**: 2026-03-13

---

## System Overview

*(Unchanged from v1.3.4)*

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

## Demo Mode Architecture (v1.3.5)

The demo is now fully self-contained. No API call is made at any point in the demo flow.

```
demo-login.html
  │
  ├── Enter password (PaySick-demo-2026) → show role grid
  │
  └── Click role button
        │
        ├── Look up hardcoded DEMO_USERS object (no fetch)
        ├── Write to localStorage:
        │     paysick_auth_token  = 'demo-' + role
        │     paysick_user        = JSON.stringify(profile)
        │     paysick_onboarding_complete = 'true'
        │
        └── Redirect by role (250ms delay for UX)
              ├── admin   → admin-dashboard.html
              ├── lender  → lender-dashboard.html
              └── default → dashboard.html
                              │
                              ├── isDemoMode() = true
                              ├── loadDemoData() — hardcoded stats + plan
                              │     R18,500 total | 1 active plan
                              │     Next: R6,167 on 15 April 2026
                              │     Provider: Netcare Dental Centre
                              │
                              └── "Apply for Funding"
                                      │
                                      └── marketplace-apply.html
                                              │
                                              ├── Steps 1–3: user inputs
                                              │
                                              └── Step 4: Submit
                                                      │
                                                      ├── isDemoMode() = true
                                                      └── buildDemoResponse()
                                                            Computes monthly payments
                                                            for 3 lenders using
                                                            standard amortisation:
                                                            • MediFinance SA    16.5%
                                                            • HealthCredit Plus 18.5%
                                                            • CareCapital       19.5%
```

---

## Demo Mode Detection

Pages use the following pattern to bypass API calls in demo mode:

```javascript
function isDemoMode() {
    const tok = localStorage.getItem('paysick_auth_token') || '';
    return tok.startsWith('demo-');
}
```

---

## Frontend Pages (v1.3.5)

*(Unchanged from v1.3.4)*

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

## Changes from v1.3.4

- `demo-login.html`: API call replaced with synchronous hardcoded DEMO_USERS lookup
- `dashboard.html`: Added `isDemoMode()` + `loadDemoData()` — all data served locally in demo mode
- `marketplace-apply.html`: Added `isDemoMode()` + `buildDemoResponse()` — application submit resolved locally in demo mode
