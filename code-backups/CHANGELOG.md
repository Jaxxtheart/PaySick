# PaySick Master Changelog

All notable changes to the PaySick platform are documented here in reverse chronological order.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

---

## [v1.3.2] — 2026-03-13

**Type**: PATCH — Bug fix

### Summary
Applied the same server-resilience and error-display fixes from v1.3.1 to the provider registration flow (`provider-apply.html`).

### Fixed
- **Provider application**: `response.json()` now wrapped in its own try/catch — non-JSON server responses (e.g. HTML error page from hosting layer) surface as `Server error (N)` instead of a raw SyntaxError
- **Provider application**: `alert()` replaced with `#errorBanner` inline element for all error paths
- **Provider application**: Eliminated double `response.json()` call (was called once for error path and once for success path); now called once and result used for both

---

## [v1.3.1] — 2026-03-13

**Type**: PATCH — Bug fix

### Summary
Fixed "Unable to connect to the server" failure on new account creation. Root cause: `pool.on('error')` called `process.exit(-1)` in a serverless context, killing the function process. A secondary frontend issue masked the real server error as a misleading network error.

### Fixed
- **Database**: `pool.on('error')` in `database.js` called `process.exit(-1)` — removed the exit call. In Vercel serverless this terminated the function handler, causing the next request to receive a non-JSON HTML error page and trigger the frontend's catch block.
- **Registration UX**: `register.html` `response.json()` was in the same try/catch as `fetch()`. When the server returned a non-JSON body, a `SyntaxError` was caught and shown as "Unable to connect to the server." — wrapping `response.json()` in its own try/catch now surfaces the actual HTTP status code instead.

---

## [v1.3.0] — 2026-03-12

**Type**: MINOR — Generic provider statement, new public pages, production compliance fixes

### Summary
Removed third-party healthcare brand names from the landing page (generic compliant language). Added About and Contact pages. Fixed Vercel guard pattern, root package.json bloat, and legacy page link references.

### Added
- `about.html` — About Us page with company mission, stats, team section
- `contact.html` — Contact page with async form submission (fetch POST)

### Fixed
- **Compliance**: `index.html` provider network statement no longer names specific SA healthcare brands
- **Serverless**: `server.js` VERCEL guard fixed from `NODE_ENV !== 'production' || !process.env.VERCEL` to correct `VERCEL !== '1'`
- **Deployment**: `vercel.json` serverless destination fixed to `/api/index.js`
- **package.json**: Removed duplicate Express dependencies from root; restored `node >= 18.0.0`
- **Legacy pages**: `privacy.html` / `terms.html` footer links corrected to `privacy-policy.html` / `terms-of-service.html`
- **UX**: `contact.html` form submit replaced `alert()` with inline success/error divs + `fetch()` POST

---

## [v1.2.0] — 2026-03-12

**Type**: MINOR — new pages, extended provider API, serverless deployment fix

### Summary
Added complete payments UI (payments.html, make-payment.html, payment-success.html), extended the provider API with self-service application and full admin CRUD, added Vercel serverless entry point (api/index.js), fixed critical security bug (base64 → AES-256-GCM for provider banking data), and added auth protection to all admin routes.

### Added
- `payments.html` — My Payments page (active plans, upcoming, history tabs)
- `make-payment.html` — Payment execution flow
- `payment-success.html` — Post-payment confirmation
- `api/index.js` — Vercel serverless function entry point
- `POST /api/providers/apply` — self-service provider application
- `POST /api/providers/track-cta` — CTA analytics (never fails caller)
- `GET /api/providers/admin/all` — admin: all providers
- `GET /api/providers/admin/stats` — admin: aggregate statistics
- `PUT /api/providers/admin/:id/approve` — admin: approve with tier
- `PUT /api/providers/admin/:id/status` — admin: activate/suspend
- `PUT /api/providers/admin/:id` — admin: update details
- `DELETE /api/providers/admin/:id` — admin: delete
- `backend/database/seed-providers.sql` — fictional SA provider seed data
- Provider network section on `index.html` homepage
- 24 new integration tests for providers routes (now 27 total)

### Fixed
- **Security**: `/api/providers/apply` used `Buffer.from(...).toString('base64')` as "encryption" — replaced with `encryptBankingData()` (AES-256-GCM)
- **Auth**: All 6 admin provider routes were unauthenticated — added `authenticateToken + requireRole('admin')`
- **Serverless**: `server.js` now guards `app.listen()` with `VERCEL !== '1'`
- **vercel.json**: Updated to `rewrites` syntax (deprecated `routes`/`builds` removed); restored CORS_ORIGIN + ALLOW_DEMO_LOGIN env vars
- **Navigation**: `index.html` nav "For Providers" linked to `provider-apply.html` → corrected to `providers.html`
- **Footer links**: `providers.html` footer used `privacy.html`/`terms.html` → fixed to `privacy-policy.html`/`terms-of-service.html`; removed dead Careers/Press links
- **Dashboard icons**: Replaced emoji icons (💳 📅 📊 🏠) with SVG design-system icons

---

## [v1.1.0] — 2026-03-12

**Type**: MINOR — Bug fixes + test suite

### Summary
Production cleanup for the live `paysick.co.za` domain launch. Fixed critical login token storage bug, added CORS for the production domain, and introduced a comprehensive test suite (59 unit tests, integration test stubs for all 6 route modules).

### Fixed
- `api-client.js`: login response used `response.token` but backend returns `response.accessToken` — tokens were never stored
- `api-client.js`: logout now clears `paysick_refresh_token` from localStorage
- CORS: added `https://paysick.co.za` and `https://www.paysick.co.za` to allow-list in `server.js`
- `vercel.json`: added `CORS_ORIGIN` env variable pointing to production domain

### Added
- `tests/unit/security.service.test.js` — 19 tests for crypto functions
- `tests/unit/security-utils.test.js` — 40 tests for frontend security utilities
- `tests/integration/health.test.js` — health endpoint and 404 handler
- `tests/integration/users.test.js` — user auth flows
- `tests/integration/applications.test.js` — application CRUD + validation
- `tests/integration/payments.test.js` — payment plan flows
- `tests/integration/providers.test.js` — provider directory (public)
- `tests/integration/risk.test.js` — risk analytics (admin-only)
- `tests/setup.js`, `tests/__mocks__/database.js`, `tests/__mocks__/email.service.js`

---

## [v1.0.0] — 2026-03-09

**Type**: Initial Official Release

### Summary
First officially archived version of the PaySick platform. Captures the complete South African healthcare payment platform including core patient flows, multi-lender marketplace, proprietary healthcare risk scoring engine, provider network, admin dashboards, investor deck, and full backend API.

### Added
- **Core Platform**
  - Patient registration and JWT authentication
  - Payment application workflow (up to R850)
  - 3-month payment plan scheduling
  - Collections management for overdue payments
  - POPIA compliance audit logging
  - Transaction ledger

- **Multi-Lender Marketplace**
  - Lender onboarding and management
  - Auction-based loan offer system
  - Patient-facing offer comparison (`marketplace-offers.html`)
  - Patient application flow (`marketplace-apply.html`)
  - Lender dashboard for reviewing applications (`lender-dashboard.html`)
  - Loan approval bridge service
  - Marketplace auction service

- **Healthcare Risk Scoring Engine**
  - Proprietary PD (Probability of Default) model — target 3.2%
  - LGD (Loss Given Default) model — target 45%
  - Expected Loss calculation (PD × LGD × EAD)
  - ICD-10 procedure risk weighting
  - Patient health score (bureau-like score)
  - Healthcare affordability assessment
  - Risk-adjusted pricing recommendations
  - Automated approve/review/decline decisions
  - Integration placeholders: Discovery, Bonitas, Momentum, MedCredits SA

- **Provider Network**
  - Public provider directory with search/filter (`providers.html`)
  - Provider application form (`provider-apply.html`)
  - Admin provider management (`admin-providers.html`)

- **Admin Dashboards**
  - Main admin dashboard (`admin-dashboard.html`)
  - Risk portfolio section with real-time PD/LGD/EL metrics
  - Healthcare data source status monitoring
  - Model performance metrics (AUC-ROC, Gini, KS)
  - Collections management (`collections.html`)

- **Frontend & Design**
  - Landing page (`index.html`)
  - User login (`login.html`)
  - User onboarding (`onboarding.html`)
  - User dashboard (`dashboard.html`)
  - Custom SVG icon system (29 icons, minimalist 2px stroke)
  - PaySick brand design system

- **Investor Materials**
  - 12-slide investor deck (`investor-deck.html`)
  - Risk management slides with PD/LGD model detail

- **Backend API**
  - Express.js REST API
  - PostgreSQL schema (14 tables)
  - Routes: users, applications, payments, providers, marketplace, risk
  - Services: healthcare-risk, marketplace-auction, loan-approval-bridge, security
  - JWT authentication middleware
  - Security tables migration
  - Vercel deployment configuration

### Architecture
- **Frontend**: HTML5 / CSS3 / Vanilla JS
- **Backend**: Node.js / Express.js
- **Database**: PostgreSQL (Vercel Postgres in production)
- **Auth**: JWT
- **Hosting**: Vercel
- **Security**: Helmet.js, CORS, rate limiting, bcrypt, parameterized queries

---

*Next version: v1.1.0 — to be created when the next feature ships.*
