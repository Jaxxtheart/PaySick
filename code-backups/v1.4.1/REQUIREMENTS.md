# Requirements & Specifications — PaySick v1.4.1

**Version**: 1.4.1
**Date**: 2026-03-24
**Platform**: South African Healthcare Payment Platform
**Regulatory Context**: NCA (National Credit Act), POPIA (Protection of Personal Information Act), FICA

---

## 1. Product Overview

PaySick is a B2C2B fintech platform that enables South African patients to split their medical bills into manageable payment plans. The platform operates a multi-lender marketplace model where registered lenders fund patient applications, with healthcare providers acting as the point-of-sale channel. All applications pass through the PaySick Shield underwriting framework before reaching the lending marketplace.

---

## 2. Functional Requirements

### 2.1 Patient Registration & Authentication
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | Collect full name, email, cell number, SA ID number (13 digits), postal code, DOB | Must Have |
| AUTH-02 | Validate SA ID number (Luhn-compliant) | Must Have |
| AUTH-03 | POPIA consent with timestamped record | Must Have |
| AUTH-04 | Terms acceptance before account creation | Must Have |
| AUTH-05 | Opaque token authentication (not JWT) with access and refresh tokens | Must Have |
| AUTH-06 | Account lock after repeated failed logins | Must Have |
| AUTH-07 | scrypt password hashing | Must Have |
| AUTH-08 | Role-based access: user, admin, lender, provider | Must Have |
| AUTH-09 | Demo login via demo-login.html with password gate and role selection | Must Have |
| AUTH-10 | Demo login errors must surface HTTP status code, not raw SyntaxError | Must Have — added v1.3.3 |
| AUTH-11 | Login page must show only one demo access link, positioned below fold | Must Have — added v1.3.4 |
| AUTH-12 | Demo login must be fully hardcoded — no API call made during demo authentication | Must Have — added v1.3.5 |

### 2.2 Payment Plans
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| PAY-01 | Split medical bills into 3-month instalments | Must Have |
| PAY-02 | Display upcoming payment schedule | Must Have |
| PAY-03 | Payment history view | Must Have |
| PAY-04 | Active plan overview | Must Have |
| PAY-05 | Patient payment plans carry **zero base interest** — instalments are bill_amount ÷ 3 | Must Have — added v1.4.0 |
| PAY-06 | If a scheduled payment is missed, a **5% late fee per full calendar month** is charged on the overdue amount (compounding) | Must Have — added v1.4.0 |
| PAY-07 | Late fee is calculated via `fee.service.js:calculateLateFee()` and applied at payment time | Must Have — added v1.4.0 |
| PAY-08 | Late fee is stored in `payments.late_fee` column and logged as a separate `fee` transaction record | Must Have — added v1.4.0 |
| PAY-09 | `POST /api/payments/:id/pay` response includes `late_fee` breakdown (months late, fee amount, total collected) | Must Have — added v1.4.0 |
| PAY-10 | `GET /api/payments/:id/fee-preview` returns current late fee preview for any payment | Must Have — added v1.4.0 |
| PAY-11 | Admin endpoint `POST /api/payments/admin/process-overdue` bulk-marks overdue payments and updates late_fee — intended for nightly cron | Must Have — added v1.4.0 |
| PAY-12 | `payments.html` must display a fee policy banner: "No interest charged. 5% late fee per month if overdue." | Must Have — added v1.4.0 |
| PAY-13 | Overdue payment cards must show OVERDUE badge, late fee amount, months late, and total due | Must Have — added v1.4.0 |
| PAY-14 | Payment history cards must show late fee line if a late fee was charged | Must Have — added v1.4.0 |

### 2.3 Marketplace Funding Application
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| MKT-01 | Patient can select procedure type from 6 categories (Dental, Eye Care, Cosmetic, Orthopedic, Fertility, General Surgery) | Must Have |
| MKT-02 | Patient can select loan amount (R5,000–R500,000) and repayment term (6/12/18/24 months) | Must Have |
| MKT-03 | Patient provides employment status, duration, and monthly income | Must Have |
| MKT-04 | Application submitted to marketplace; demo/preview response returned when no lenders are active | Must Have |
| MKT-05 | Dashboard "Apply for Funding" link must navigate to marketplace-apply.html | Must Have — fixed v1.3.3 |
| MKT-06 | Dashboard "Apply now" inline link must navigate to marketplace-apply.html | Must Have — fixed v1.3.3 |
| MKT-07 | In demo mode, marketplace application must resolve locally with computed preview offers — no API call | Must Have — added v1.3.5 |
| MKT-08 | Demo dashboard must display hardcoded stats and active plan without API calls | Must Have — added v1.3.5 |
| MKT-09 | Patient must declare existing monthly debt repayments (monthlyObligations) — required for DTI | Must Have — added v1.3.6 |
| MKT-10 | Patient must declare medical aid cover amount (medicalAidCovered) — used for gap financing classification | Must Have — added v1.3.6 |
| MKT-11 | Patient must select procedure urgency (elective/planned/semi_urgent/urgent) — required field | Must Have — added v1.3.6 |
| MKT-12 | Every application with monthlyIncome must be assessed by Shield Gate 2 before reaching the marketplace | Must Have — added v1.3.6 |
| MKT-13 | Applications declined by Shield must return { shield_declined: true, shield: <assessment> } and not proceed to lender matching | Must Have — added v1.3.6 |
| MKT-14 | Declined applications must show a decline card with rationale and, where available, an alternative loan amount suggestion | Must Have — added v1.3.6 |

### 2.4 Provider Directory, Registration & Settlements
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| PROV-01 | Public list of participating healthcare providers | Must Have |
| PROV-02 | Filter by type, city, network partner status | Must Have |
| PROV-03 | Provider search by name | Must Have |
| PROV-04 | Provider detail page | Must Have |
| PROV-05 | Provider registration application via provider-apply.html | Must Have |
| PROV-06 | Admin approval workflow for providers | Must Have |
| PROV-07 | Bank details encrypted with AES-256-GCM | Must Have |
| PROV-08 | Provider application errors displayed inline — no alert() | Must Have |
| PROV-09 | Provider application form resilient to non-JSON server responses | Must Have |
| PROV-10 | Provider is charged a **flat 5% service fee** on every settlement payout | Must Have — added v1.4.0 |
| PROV-11 | Settlement fee is calculated via `fee.service.js:calculateProviderSettlement()` | Must Have — added v1.4.0 |
| PROV-12 | `settlements.commission_amount` stores the 5% fee; `settlements.net_amount` = gross − 5% | Must Have — added v1.4.0 |
| PROV-13 | `POST /api/providers/admin/:id/settle` creates settlement records with per-line 5% deduction | Must Have — added v1.4.0 |
| PROV-14 | `GET /api/providers/admin/:id/settlements` returns all settlements for a provider with service_fee_pct in the response | Must Have — added v1.4.0 |
| PROV-15 | `provider-apply.html` must display a "How You Get Paid" section with tier table and explicit 5% fee notice | Must Have — added v1.4.0 |
| PROV-16 | Provider tier table: New Provider (5 days), Standard (3 days), Trusted (24 hours), Premium (same-day) — matching `TRUST_TIERS` in provider-gate.service.js | Must Have — added v1.4.0 |
| PROV-17 | Commission agreement checkbox must read "5% service fee" (not the previous "2-5% based on volume") | Must Have — added v1.4.0 |

### 2.5 Public Website

| ID | Requirement | Priority |
|----|-------------|----------|
| WEB-01 | Landing page with generic provider network statement | Must Have |
| WEB-02 | About Us page | Should Have |
| WEB-03 | Contact page with async form | Should Have |
| WEB-04 | Privacy Policy page (canonical: privacy-policy.html) | Must Have |
| WEB-05 | Terms of Service page (canonical: terms-of-service.html) | Must Have |
| WEB-06 | Contact form must use fetch() — no alert() | Must Have |
| WEB-07 | All page footers must NOT display a Company section until content is defined — section is reserved for future use | Must Have — added v1.4.1 |
| WEB-08 | Login page must be usable on mobile viewports (≥ 320px) without requiring scroll or zoom | Must Have — added v1.4.1 |
| WEB-09 | Login form inputs must have font-size ≥ 16px on mobile to prevent iOS viewport zoom on focus | Must Have — added v1.4.1 |

### 2.6 Security & Infrastructure
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| SEC-01 | AES-256-GCM encryption for all banking data at rest | Must Have |
| SEC-02 | VERCEL !== '1' guard prevents app.listen() in serverless context | Must Have |
| SEC-03 | All admin API routes require authenticateToken + requireRole('admin') | Must Have |
| SEC-04 | Rate limiting: 100 req/15min global, 10 req/15min for auth endpoints | Must Have |
| SEC-05 | Helmet security headers on all responses | Must Have |
| SEC-06 | CORS restricted to paysick.co.za and configured origins | Must Have |
| SEC-07 | No stack traces exposed in production error responses | Must Have |
| SEC-08 | Database pool errors must be logged but must NOT call process.exit() in serverless | Must Have |
| SEC-09 | All API client calls (api-client.js) must surface HTTP status code on non-JSON responses | Must Have — added v1.3.3 |

### 2.7 Demo Mode
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| DEMO-01 | Demo is gated by a password (PaySick-demo-2026) on demo-login.html | Must Have |
| DEMO-02 | Demo offers 4 roles: Patient, Provider, Lender, Admin | Must Have |
| DEMO-03 | Demo authentication is entirely local — no API call | Must Have — added v1.3.5 |
| DEMO-04 | Demo token format: `'demo-' + role` | Must Have |
| DEMO-05 | Pages detect demo mode by checking if auth token starts with `'demo-'` | Must Have — added v1.3.5 |
| DEMO-06 | Dashboard in demo mode shows hardcoded stats and one active plan (Netcare Dental, R18,500) | Must Have — added v1.3.5 |
| DEMO-07 | Marketplace in demo mode returns computed preview offers from 3 fictional lenders | Must Have — added v1.3.5 |

### 2.8 Shield Underwriting Framework
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| SHIELD-01 | Five-gate underwriting framework: Provider Gate (1), Patient Gate (2), Lender Gate (3), Outcome Gate (4), Circuit Breakers (5) | Must Have |
| SHIELD-02 | Patient Gate hard floors: minimum income R4,000; max RTI 20%; max DTI 55% | Must Have |
| SHIELD-03 | Patient Gate amber thresholds: RTI > 15% triggers human review; DTI > 45% triggers human review | Must Have |
| SHIELD-04 | Borrower profile classification: convenience / planned_necessity / urgent_necessity | Must Have |
| SHIELD-05 | Elective procedures above R15,000 trigger 48-hour cooling-off period | Must Have |
| SHIELD-06 | All amber and red decisions require human review via /v2/shield/human-review/ | Must Have |
| SHIELD-07 | Every Patient Gate assessment persisted to loan_risk_assessments table | Must Have |
| SHIELD-08 | 10 circuit breakers monitor portfolio health (5 amber alerts, 5 red triggers) | Must Have |
| SHIELD-09 | All human decisions logged with 7-year retention in human_review_log | Must Have |
| SHIELD-10 | Shield Gate 2 is called for every marketplace application that includes income data | Must Have — activated v1.3.6 |
| SHIELD-11 | Declined applications show rationale and alternative loan suggestion in the UI | Must Have — added v1.3.6 |

### 2.9 Fee Service
*(Unchanged from v1.4.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| FEE-01 | All fee rates must be defined in `backend/src/services/fee.service.js` — no magic numbers scattered in routes | Must Have — added v1.4.0 |
| FEE-02 | `PROVIDER_SERVICE_FEE_PCT = 0.05` (5%) | Must Have — added v1.4.0 |
| FEE-03 | `PATIENT_LATE_FEE_PCT_PER_MONTH = 0.05` (5%) | Must Have — added v1.4.0 |
| FEE-04 | `PATIENT_BASE_INTEREST_RATE = 0.00` (zero interest) | Must Have — added v1.4.0 |
| FEE-05 | Late fee compounds monthly: `total_due = amount × (1.05)^months_late` | Must Have — added v1.4.0 |

---

## 3. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Node.js >= 18.0.0 |
| NFR-02 | Vercel serverless deployment via api/index.js |
| NFR-03 | PostgreSQL database with connection pooling |
| NFR-04 | 59 unit tests must pass (security-utils, security.service) |
| NFR-05 | All API routes covered by integration tests |
| NFR-06 | Shield database migration (004_shield_underwriting.sql) must be applied before Shield persistence is active |
| NFR-07 | No schema migration required for v1.4.1 — frontend-only patch |

---

## 4. Deprecated Features

None in this version.

---

## 5. Pending / Reserved

### Footer — Company Section

- Removed in: v1.4.1
- Last available in: v1.4.0 — see `code-backups/v1.4.0/snapshot/`
- Reason for removal: Placeholder links (About Us, Careers, Press, Contact) pointed to anchor `#about` with no real content. Section removed until content is defined.
- Replacement: Will be re-added in a future version once content is ready.
