# PaySick Master Changelog

All notable changes to the PaySick platform are documented here in reverse chronological order.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

---

## [v1.5.6] — 2026-03-31

**Type**: PATCH — Bug fix: password reset email delivery

### Summary
Fixed two bugs causing password reset emails to silently fail in production: reset links pointed to `localhost:3000` (APP_URL missing from vercel.json), and emails were delivered to a fake Ethereal test inbox instead of the user (SMTP_HOST not set in production, Ethereal fallback triggered silently).

### Fixed
- `vercel.json`: Added `APP_URL=https://paysick.co.za` to env block
- `backend/src/services/email.service.js`: Added production guard — throws clear error when `NODE_ENV=production` and `SMTP_HOST` is not set, preventing silent Ethereal fallback

### Added
- `tests/unit/email-service.test.js`: 5 new unit tests covering APP_URL domain correctness and production SMTP configuration guard (total: 102 unit tests)

---

## [v1.5.5] — 2026-03-27

**Type**: PATCH — Regulatory terminology compliance audit & update

### Summary
Comprehensive audit and update of all customer-facing, provider-facing, investor-facing, and internal documents to ensure consistent positioning of PaySick as a **healthcare payment facilitation platform** — not a credit provider, medical scheme, or insurer.

### Fixed
- `about.html`: Removed false NCA credit provider claim; replaced with correct CPA/POPIA positioning
- `terms-of-service.html`: Removed NCA credit agreement conditional; added explicit non-credit/non-NCR disclaimer
- `privacy-policy.html`: Removed NCA row from legal framework table; fixed "claims history" → "payment history"
- `index.html`: "credit risk" → "collection burden" in provider section (2 instances)
- `providers.html`: "Zero Credit Risk" heading and copy → "Zero Collection Burden"
- `provider-apply.html`: "credit risk" language → payment management language (2 instances)
- `marketplace-offers.html`: "loan offer/application/processed" → payment arrangement language
- `investor-deck.html`: All prohibited terms replaced — underwriting/lenders/loans/credit risk/NIM/healthcare financing → approved payment facilitation equivalents (both HTML and PPTX generation code)
- `marketplace-apply.html`: APR comment → service fee rate; loan UI text → arrangement language

---

## [v1.5.4] — 2026-03-26

**Type**: PATCH — Root cause fix for all API 500 errors: missing `requireRole` export

### Summary
`providers.js` imported `requireRole` from `auth.middleware.js`, but the function was never defined or exported. At module load time, Express route registration hit `requireRole('admin')` as `undefined`, throwing `TypeError: requireRole is not a function`. This crashed `server.js` before `module.exports = app` was reached, causing every API route to return 500. Root cause was identified via the v1.5.3 diagnostic wrapper, which converted the opaque Vercel HTML 500 into a JSON error logged as: `[PaySick] FATAL: server failed to load: requireRole is not a function`.

### Fixed
- `auth.middleware.js`: added `requireRole(role)` factory function and added it to `module.exports`

---

## [v1.5.3] — 2026-03-26

**Type**: PATCH — Diagnostic crash wrapper + integration test coverage for forgot/reset-password

### Summary
Production API returning Vercel HTML 500 (instead of JSON) on all `/api/*` routes. Root cause still under diagnosis. Added crash-safe wrapper to `api/index.js` and `api/[...slug].js` that catches any module-load exception and returns `{"error":"Server failed to start","code":"SERVER_LOAD_ERROR"}` as `application/json` — converting an opaque HTML crash into a parseable JSON error. Also added 14 integration tests for `POST /api/users/forgot-password` and `POST /api/users/reset-password` which had zero prior integration test coverage.

### Added
- `api/index.js`: try/catch wrapper around `require('../backend/src/server')` — crash → JSON 500
- `api/[...slug].js`: same crash wrapper for the Vercel file-system catch-all function
- `tests/integration/users.test.js`: 14 new integration tests for forgot-password and reset-password

### Fixed
- Module-load crashes in Vercel functions now return `application/json` instead of Vercel HTML 500

---

## [v1.5.2] — 2026-03-26

**Type**: PATCH — Bug fix: explicit `/api/(.*)` rewrite in vercel.json to guarantee function invocation

### Summary
File-based catch-all `api/[...slug].js` was not reliably routing `/api/*` requests to the Express function in Vercel production. Added explicit rewrite `"/api/(.*)" → "/api/index.js"` in vercel.json. Combined with the v1.5.1 fix (deps in root package.json), this ensures all API routes are correctly handled.

### Fixed
- `vercel.json`: added `{ "source": "/api/(.*)", "destination": "/api/index.js" }` rewrite

---

## [v1.5.1] — 2026-03-26

**Type**: PATCH — Bug fix: API routes returning HTML 404 in Vercel production

### Summary
All `/api/*` routes were returning Vercel's HTML 404 page instead of JSON responses in production. Root cause: backend production dependencies lived only in `backend/package.json`. Vercel's `postinstall` script (`cd backend && npm install`) could fail silently, leaving `backend/node_modules` empty. With no `express` discoverable, `@vercel/nft` could not bundle the serverless functions, so Vercel had no function to invoke and returned HTML 404.

### Fixed
- Moved all backend production dependencies (`express`, `pg`, `helmet`, `cors`, `morgan`, `dotenv`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `nodemailer`, `uuid`) to root `package.json`
- Removed `postinstall` script from root `package.json` — no longer needed

---

## [v1.5.0] — 2026-03-26

**Type**: MINOR — New feature: forgot password / reset password flow

### Summary
Users who have forgotten their password can now request a reset link via email. Backend: `POST /forgot-password` (anti-enumeration, SHA-256 token storage, 1-hour expiry) and `POST /reset-password` (transaction: mark token used, rehash password, revoke all sessions). Frontend: `forgot-password.html` and `reset-password.html` with client-side validation and friendly non-JSON error handling. "Forgot password?" link added to `login.html`. 30 new unit tests (total: 97).

### Added
- `POST /api/users/forgot-password` — anti-enumeration; sends branded reset email with 1-hour token
- `POST /api/users/reset-password` — validates token, updates password in transaction, revokes all sessions
- `backend/src/services/email.service.js` — `sendPasswordResetEmail()`
- `forgot-password.html` — email entry form, generic success message
- `reset-password.html` — new password form, client-side length/match validation, auto-redirect to login on success
- `login.html` — "Forgot password?" link
- `tests/unit/password-reset.test.js` — 30 new tests (token format, expiry, SHA-256 hashing, password requirements, API response handling)

---

## [v1.4.4] — 2026-03-26

**Type**: PATCH — Bug fix: login shows raw SyntaxError to user on non-JSON server response

### Summary
`login.html` was calling `response.json()` bare inside the outer try/catch. When the API returned an HTML error page, the SyntaxError ("Unexpected token 'T', "The page c"... is not valid JSON") propagated to the catch block and was shown verbatim to users. Fixed by wrapping `response.json()` in an inner try/catch (same pattern already used in `register.html` since v1.3.1). Added 8-test regression suite.

### Fixed
- `login.html` — inner try/catch around `response.json()`; non-JSON responses now show "Server error (N). Please try again shortly."

### Added
- `tests/unit/login-error-handling.test.js` — 8 tests covering the full login response handling path (non-JSON 404/500, no SyntaxError in message, success, EMAIL_UNVERIFIED, 401 with/without error body)
- Total unit tests: 67 (was 59)

---

## [v1.4.3] — 2026-03-24

**Type**: PATCH — Bug fix: lender webhook HMAC used ciphertext instead of plaintext key

### Summary
Fixed marketplace.js webhook signature middleware. The AES-encrypted API key ciphertext was being passed directly to `crypto.createHmac()` as the signing secret. Lenders sign requests with the plaintext key; the server was verifying with the ciphertext — so all webhook signatures for external lenders would fail with 401. Fixed by decrypting before HMAC. Also imported `decryptBankingData` which was missing from the import.

### Fixed
- `backend/src/routes/marketplace.js` — decrypt `api_key_encrypted` before using as HMAC key in webhook validation middleware

---

## [v1.4.2] — 2026-03-24

**Type**: PATCH — Critical bug fix: registration returning "Server error (404)"

### Summary
Removed `process.exit(1)` from the startup `validateEnvironment()` error handler in `server.js`. In Vercel serverless, calling `process.exit()` during module initialization kills the function before it can send any response — Vercel then returns an HTML error page. The frontend's `response.json()` call throws on the HTML body, triggering the misleading "Server error (404)" message. Same class of bug as the `process.exit(-1)` fixed in v1.3.1 (database pool), but in the startup validation path.

### Fixed
- `backend/src/server.js` — removed `process.exit(1)` from `validateEnvironment()` catch block; startup errors are now logged only; routes that require `TOKEN_SECRET` / `ENCRYPTION_KEY` return JSON 500 from their own error handlers

---

## [v1.4.1] — 2026-03-24

**Type**: PATCH — Footer Company section removed; login page mobile layout improved

### Summary
Removed the placeholder "Company" footer section site-wide (index, login, onboarding, provider-apply, providers). The section will be restored in a future version once content is defined. Improved login page mobile UX with new 768px and 480px breakpoints: top-aligned layout, reduced padding, 16px input font-size to prevent iOS zoom, and scaled-down logo for small screens.

### Changed
- `index.html` — removed Company footer section
- `login.html` — removed Company footer section; added mobile CSS breakpoints (768px, 480px)
- `onboarding.html` — removed Company footer section
- `provider-apply.html` — removed Company footer section
- `providers.html` — removed Company footer section

---

## [v1.4.0] — 2026-03-16

**Type**: MINOR — Provider charge and patient late-payment fee

### Summary
Introduced the platform's fee model. A central `fee.service.js` module defines all fee rates. Providers are charged a flat 5% service fee on every settlement payout. Patients pay zero interest on regular instalments; if a payment is missed, a 5% late fee is charged per full calendar month overdue (compounding). Frontend pages updated with full fee disclosure.

### Added
- `backend/src/services/fee.service.js` — `PROVIDER_SERVICE_FEE_PCT` (5%), `PATIENT_LATE_FEE_PCT_PER_MONTH` (5%), `PATIENT_BASE_INTEREST_RATE` (0%), `calculateLateFee()`, `calculateProviderSettlement()`
- `POST /api/payments/:id/pay` — calculates and applies late fee if payment is overdue; logs fee as separate transaction
- `GET /api/payments/:id/fee-preview` — returns late fee preview for any payment
- `POST /api/payments/admin/process-overdue` — bulk overdue marking and late fee update (admin/cron)
- `GET /api/providers/admin/:id/settlements` — list settlements with service fee pct
- `POST /api/providers/admin/:id/settle` — create settlement with 5% deduction per line item
- `provider-apply.html` — "How You Get Paid" section: provider tier table, 5% fee disclosure, updated consent checkbox
- `payments.html` — fee policy banner (0% interest, 5% late fee), overdue card late fee display, history late fee line

---

## [v1.3.6] — 2026-03-13

**Type**: MINOR — Shield underwriting activation

### Summary
Activated the PaySick Shield underwriting framework on the live patient application flow. Three missing form fields were added to the marketplace application (procedure urgency, existing monthly obligations, medical aid cover). The backend marketplace route now calls Shield Gate 2 (patient affordability assessment) before any lender matching occurs. Declined applications surface a detailed decline card with rationale and an alternative loan suggestion.

### Added
- **Application form**: New required fields on Step 3 — procedure urgency (elective/planned/semi_urgent/urgent), existing monthly debt repayments, and medical aid cover amount. All three feed directly into the Shield affordability engine.
- **Shield Gate 2 integration**: `POST /api/marketplace/applications` now calls `patientGateService.assessApplication()` for every application that includes income data. DECLINE outcomes return `{ shield_declined: true, shield }` and stop processing. Amber and green outcomes proceed to marketplace.
- **Decline UX**: `showShieldDecline()` in marketplace-apply.html renders a decline card with the Shield engine's rationale bullets and, when available, an alternative loan amount that fits within the 18% RTI comfort ceiling.
- **Demo Shield simulation**: `buildDemoResponse()` now computes and returns a simulated Shield assessment (RTI, DTI, borrower profile, risk tier) from the user's demo inputs.

---

## [v1.3.5] — 2026-03-13

**Type**: PATCH — Bug fix / Demo hardening

### Summary
Made the demo site fully self-contained and independent of the backend API. Demo login, dashboard data, and marketplace application submission all now resolve locally from hardcoded data — no network requests are made in demo mode.

### Fixed
- **Demo login**: Replaced `fetch('/api/users/demo-login', ...)` with a synchronous hardcoded `DEMO_USERS` lookup in `demo-login.html`. Token, user profile, and onboarding flag written directly to `localStorage`.
- **Demo dashboard**: `dashboard.html` now detects demo mode via `isDemoMode()` (checks `paysick_auth_token` prefix). When true, `loadDemoData()` populates all stat cards and renders a hardcoded active plan (Netcare Dental Centre, R18,500, 3 months) and upcoming payment (R6,167, 15 April 2026) without any API call.
- **Demo marketplace**: `marketplace-apply.html` now detects demo mode and calls `buildDemoResponse()` instead of the API. Returns computed preview offers for 3 lenders (MediFinance SA 16.5%, HealthCredit Plus 18.5%, CareCapital 19.5%) using standard amortisation on the user-selected loan amount and term.

---

## [v1.3.4] — 2026-03-13

**Type**: PATCH — UI fix

### Summary
Cleaned up the demo access entry point on the login page. Removed the duplicate "Demo" link; the single remaining "Demo access" link is now positioned below the fold.

### Fixed
- **Login page**: Removed duplicate "Demo" link from `.back-home` row. Single "Demo access" link repositioned with 80px top margin so it is below the fold and does not compete with the primary login CTA.

---

## [v1.3.3] — 2026-03-13

**Type**: PATCH — Bug fix

### Summary
Fixed demo site breaking after selecting a procedure type. Three bugs combined to make the marketplace funding flow unreachable or non-functional.

### Fixed
- **Navigation**: `dashboard.html` "Apply for Funding" nav link and "Apply now" inline link both pointed to `onboarding.html`. A user who had already completed onboarding was bounced straight back to the dashboard, with no path to `marketplace-apply.html` (the procedure-type selection). Both links now point to `marketplace-apply.html`.
- **API client resilience**: `api-client.js` `response.json()` was inside the same `try/catch` as `fetch()`. Non-JSON responses (HTML error pages) produced a raw `SyntaxError` toast. `response.json()` is now wrapped in its own inner try/catch; non-JSON responses surface as `Server error (N)`.
- **Demo login resilience**: `demo-login.html` had the same non-JSON pattern — if the API returned HTML, the catch message was a raw `SyntaxError`, and the auth token was never stored, making all subsequent API calls fail with 401. Same fix applied.

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
