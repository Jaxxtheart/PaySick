# PaySick Code Backups

This folder is the **official versioned archive** of the PaySick platform. It provides a complete snapshot of the platform at every significant release milestone, including full source code, requirements & specifications, architecture diagrams, and release notes.

---

## Purpose

- **Version Control**: Every major release is captured here as an immutable snapshot.
- **Archival Record**: Dropped features remain documented with their full specs and code, never lost.
- **Audit Trail**: Stakeholders, investors, and regulators can inspect any historical version of the platform.
- **Onboarding**: New engineers can understand what the platform looked like at any point in time.

---

## Folder Structure

```
code-backups/
├── README.md                        <- This file
├── VERSIONING_GUIDE.md              <- How to cut a new backup version
├── CHANGELOG.md                     <- Master changelog across all versions
│
├── v1.0.0/                          <- Initial official release (2026-03-09)
│   ├── RELEASE_NOTES.md             <- What changed in this version
│   ├── REQUIREMENTS.md              <- Full requirements & specifications
│   ├── ARCHITECTURE.md              <- Architecture & data-flow diagrams
│   └── snapshot/                    <- Full source code snapshot
│       ├── [all frontend HTML files]
│       ├── [all JS files]
│       ├── backend/
│       └── [all config & docs]
│
└── v1.x.x/                          <- Future versions follow same pattern
```

---

## Versioning Scheme

PaySick uses **Semantic Versioning (SemVer)**:

| Increment | When to use |
|-----------|-------------|
| **MAJOR** (v2.0.0) | Breaking changes to the platform — e.g. complete redesign, fundamental flow change, dropped core module |
| **MINOR** (v1.1.0) | New feature or module added — e.g. new dashboard, new API service, new page |
| **PATCH** (v1.0.1) | Bug fix, copy change, style tweak — no new functionality |

---

## How to Create a New Version

See [VERSIONING_GUIDE.md](./VERSIONING_GUIDE.md) for the full step-by-step process.

---

## Released Versions

| Version | Date | Summary |
|---------|------|---------|
| [v1.7.4](./v1.7.4/) | 2026-04-15 | Copy patch: replace lender marketplace messaging with PaySick direct disbursement copy across application flow |
| [v1.7.3](./v1.7.3/) | 2026-04-15 | Copy patch: replace "Loan Amount" with "Payment Arrangement" on application review screen (LANG-02 compliance) |
| [v1.7.2](./v1.7.2/) | 2026-04-15 | UI/terms patch: cap payment plan slider max at R10,000 in marketplace-apply.html; update Terms of Service section 4.3 to reflect R10,000 per-payment-plan limit |
| [v1.7.1](./v1.7.1/) | 2026-04-15 | Copy patch: "Apply for Medical Finance" → "Apply for a Medical Payment Plan" in marketplace-apply.html to comply with Shield framework LANG-01 approved terminology |
| [v1.7.0](./v1.7.0/) | 2026-04-10 | Shield Framework v5.0: DSP Status Verification, Tariff-Anchored Facilitation Ceiling, Provider Billing Agreement Gate, Tariff Disclosure Screen, EOB/Payout Reconciliation — 18 new API routes, 7 frontend pages, 007 migration (15 tables), 25 integration tests |
| [v1.6.0](./v1.6.0/) | 2026-04-05 | Customer Messaging Journey: 43 message types, 10 lifecycle stages, 13-rung collections escalation ladder, NotificationService, /api/notifications inbox API, 173 new unit tests (total: 443) |
| [v1.5.6](./v1.5.6/) | 2026-03-31 | Fix: password reset email delivery — APP_URL missing from vercel.json caused localhost reset links; SMTP_HOST not set caused silent Ethereal fallback in production; add production guard + 5 unit tests (total: 102) |
| [v1.5.5](./v1.5.5/) | 2026-03-27 | Regulatory terminology compliance audit — remove false NCA credit provider claim; replace all credit/loan/underwriting/lender/insurance terminology with approved payment facilitation language across all customer-facing, provider-facing, and investor-facing documents |
| [v1.5.4](./v1.5.4/) | 2026-03-26 | Fix: root cause of all API 500 errors — `requireRole` was imported by providers.js but never exported from auth.middleware.js, crashing server at load time |
| [v1.5.3](./v1.5.3/) | 2026-03-26 | Fix: API returning HTML 500 — add crash diagnostic wrapper to api/index.js + api/[...slug].js; add 14 integration tests for forgot/reset-password |
| [v1.5.2](./v1.5.2/) | 2026-03-26 | Fix: API 404 persists — add explicit `/api/(.*)` rewrite in vercel.json so Vercel always invokes api/index.js for all API paths |
| [v1.5.1](./v1.5.1/) | 2026-03-26 | Fix: API routes returning HTML 404 in production — moved all backend dependencies to root package.json so Vercel's npm install reliably installs them |
| [v1.5.0](./v1.5.0/) | 2026-03-26 | Forgot password / reset password flow: backend routes, branded email, forgot-password.html, reset-password.html, "Forgot password?" link on login, 30 new tests (total: 97 unit tests) |
| [v1.4.4](./v1.4.4/) | 2026-03-26 | Fix login raw SyntaxError shown to user on non-JSON API response; add 8-test regression suite (total: 67 unit tests) |
| [v1.4.3](./v1.4.3/) | 2026-03-24 | Fix lender webhook HMAC: decrypt api_key_encrypted before using as signing secret (was using ciphertext, signatures always failed) |
| [v1.4.2](./v1.4.2/) | 2026-03-24 | Critical fix: removed process.exit(1) from server.js startup validation — was crashing Vercel serverless function and causing HTML 404 on all registration attempts |
| [v1.4.1](./v1.4.1/) | 2026-03-24 | Footer Company section removed site-wide (pending content); login page mobile layout improved with 768px/480px breakpoints and iOS zoom fix |
| [v1.4.0](./v1.4.0/) | 2026-03-16 | Fee model: 5% provider service fee on settlements; 0% patient interest; 5% late fee per overdue month; fee.service.js; fee disclosure in provider-apply.html and payments.html |
| [v1.3.6](./v1.3.6/) | 2026-03-13 | Shield activation: Gate 2 wired into marketplace applications; urgency, monthly obligations, and medical aid fields added to form; decline UX with rationale and alternative offer |
| [v1.3.5](./v1.3.5/) | 2026-03-13 | Bug fix: demo site hardcoded — demo login, dashboard, and marketplace-apply all serve local mock data with no API dependency |
| [v1.3.4](./v1.3.4/) | 2026-03-13 | UI fix: removed duplicate demo link on login page; single "Demo access" link repositioned below fold |
| [v1.3.3](./v1.3.3/) | 2026-03-13 | Bug fix: demo site broken after procedure type — dashboard Apply for Funding linked to onboarding (now marketplace-apply), api-client.js and demo-login.html non-JSON error handling |
| [v1.3.2](./v1.3.2/) | 2026-03-13 | Bug fix: applied same server-resilience fixes to provider-apply.html — inline error banner replaces alert(), response.json() non-JSON protection |
| [v1.3.1](./v1.3.1/) | 2026-03-13 | Bug fix: account creation "Unable to connect" — removed process.exit(-1) from DB pool error handler, fixed register.html JSON parse error masking |
| [v1.3.0](./v1.3.0/) | 2026-03-12 | Generic provider statement, About/Contact pages, Vercel guard fix, package.json cleanup, legacy link fixes |
| [v1.2.0](./v1.2.0/) | 2026-03-12 | Payments UI, extended provider API, Vercel serverless entry, security fix (AES-256-GCM for provider banking data), admin auth on all provider routes |
| [v1.1.0](./v1.1.0/) | 2026-03-12 | Production cleanup: CORS fix for paysick.co.za, login token bug fix, full test suite (59 unit tests) |
| [v1.0.0](./v1.0.0/) | 2026-03-09 | Initial official release — full platform including marketplace, risk engine, provider network, admin dashboards |

---

## Rules

1. **Never edit a snapshot folder** after it has been committed. Snapshots are read-only archives.
2. **Always bump the version** in `CHANGELOG.md` before merging a feature to main.
3. **Dropped features** require a new MINOR/MAJOR version documenting what was removed and why.
4. **Every version folder** must contain all four files: `RELEASE_NOTES.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, and a `snapshot/` directory.
