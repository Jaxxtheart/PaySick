# PaySick Master Changelog

All notable changes to the PaySick platform are documented here in reverse chronological order.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

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
