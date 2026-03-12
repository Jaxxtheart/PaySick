# Requirements & Specifications — PaySick v1.0.0

**Version**: 1.0.0
**Date**: 2026-03-09
**Platform**: South African Healthcare Payment Platform
**Regulatory Context**: NCA (National Credit Act), POPIA (Protection of Personal Information Act), FICA

---

## 1. Product Overview

PaySick is a B2C2B fintech platform that enables South African patients to split their medical bills into manageable 3-month payment plans. The platform operates a multi-lender marketplace model where registered lenders fund patient applications, with healthcare providers acting as the point-of-sale channel.

### 1.1 Core Value Proposition

| Stakeholder | Value Delivered |
|------------|----------------|
| **Patients** | Access to medical care without lump-sum payment; instant approval; 3-month plans |
| **Healthcare Providers** | Upfront settlement; increased patient throughput; zero collections burden |
| **Lenders** | Curated healthcare loan book; proprietary risk scoring; automated auction matching |
| **Administrators** | Full operational control; risk monitoring; POPIA-compliant audit trail |

---

## 2. Functional Requirements

### 2.1 Patient Registration & Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | System shall collect full name, email, cell number, SA ID number (13 digits), postal code (4 digits), date of birth | Must Have |
| AUTH-02 | System shall validate SA ID number format (13 digits, Luhn-compliant) | Must Have |
| AUTH-03 | System shall require POPIA consent with timestamped record | Must Have |
| AUTH-04 | System shall require terms acceptance before account creation | Must Have |
| AUTH-05 | System shall use opaque token authentication (not JWT) with access and refresh tokens | Must Have |
| AUTH-06 | System shall lock accounts after repeated failed login attempts | Must Have |
| AUTH-07 | System shall enforce bcrypt password hashing (minimum 12 rounds) | Must Have |
| AUTH-08 | System shall support role-based access: user, admin, lender, provider | Must Have |
| AUTH-09 | Session tokens shall be stored as hashed values — never plain text | Must Have |

### 2.2 Payment Application Flow

| ID | Requirement | Priority |
|----|-------------|----------|
| APP-01 | Patient shall be able to submit a payment application for a healthcare procedure | Must Have |
| APP-02 | Application shall capture: provider, procedure type (ICD-10), amount requested, patient banking details | Must Have |
| APP-03 | System shall perform automated risk assessment on each application | Must Have |
| APP-04 | Risk assessment shall produce: PD score, LGD score, Expected Loss, risk tier, decision (approve/review/decline) | Must Have |
| APP-05 | Maximum credit limit at launch is R850.00 per patient | Must Have |
| APP-06 | System shall route approved applications to the lender marketplace auction | Must Have |
| APP-07 | Applications shall be visible in patient dashboard with real-time status | Must Have |

### 2.3 Payment Plans & Scheduling

| ID | Requirement | Priority |
|----|-------------|----------|
| PAY-01 | Approved applications shall generate a 3-month payment plan with equal monthly instalments | Must Have |
| PAY-02 | System shall track each payment's due date, amount, and status (pending/paid/overdue) | Must Have |
| PAY-03 | Patient dashboard shall display upcoming payments and payment history | Must Have |
| PAY-04 | System shall record every financial transaction in an immutable ledger | Must Have |
| PAY-05 | Overdue payments shall be escalated to the collections module | Must Have |
| PAY-06 | Payment gateway integration (debit orders, PayShap, card) — placeholder in v1.0.0; to be implemented | Should Have |

### 2.4 Multi-Lender Marketplace

| ID | Requirement | Priority |
|----|-------------|----------|
| MKT-01 | System shall support multiple registered lenders simultaneously | Must Have |
| MKT-02 | System shall run an auction matching patient applications to lender offers based on risk and rate criteria | Must Have |
| MKT-03 | Patients shall be presented with ranked loan offers and shall be able to accept one | Must Have |
| MKT-04 | Lenders shall have a dashboard to: view applications, make offers, track portfolio | Must Have |
| MKT-05 | Loan approval bridge service shall manage state transitions from application to funded loan | Must Have |
| MKT-06 | Marketplace shall support lender-configurable risk appetite and rate parameters | Must Have |

### 2.5 Healthcare Provider Network

| ID | Requirement | Priority |
|----|-------------|----------|
| PRV-01 | System shall maintain a searchable directory of registered healthcare providers | Must Have |
| PRV-02 | Providers shall be filterable by: type (GP, specialist, dentist, etc.), province, network status | Must Have |
| PRV-03 | Providers shall be able to apply to join the network via online form | Must Have |
| PRV-04 | Admin shall be able to approve/reject/manage providers via admin interface | Must Have |
| PRV-05 | Provider settlement shall be tracked per application | Must Have |
| PRV-06 | Provider performance data shall feed into the risk scoring engine | Should Have |

### 2.6 Healthcare Risk Scoring Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| RSK-01 | System shall calculate a proprietary PD (Probability of Default) score per application | Must Have |
| RSK-02 | PD model shall incorporate 5 component scores: medical aid claims history, medication adherence, PaySick payment history, ICD-10 procedure risk, provider network performance | Must Have |
| RSK-03 | System shall calculate LGD (Loss Given Default) with 4 mitigation components | Must Have |
| RSK-04 | System shall calculate Expected Loss: EL = PD × LGD × EAD | Must Have |
| RSK-05 | System shall produce risk-adjusted pricing recommendations for lenders | Must Have |
| RSK-06 | System shall maintain a patient health score (analogous to a healthcare bureau score) | Must Have |
| RSK-07 | ICD-10 procedure risk weights shall be configurable in the database | Must Have |
| RSK-08 | Risk model performance shall be tracked over time (AUC-ROC, Gini coefficient, KS statistic) | Must Have |
| RSK-09 | Target metrics: PD ≤ 3.2%, LGD ≤ 45%, Net Loss Rate ≤ 1.4% | Must Have |
| RSK-10 | Healthcare data sources (Discovery, Bonitas, Momentum, MedCredits SA) — integration placeholders in v1.0.0 | Should Have |

### 2.7 Admin Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| ADM-01 | Admin shall view platform-wide metrics: total users, active plans, approval rate, collection rate | Must Have |
| ADM-02 | Admin shall view risk portfolio: average PD, average LGD, EL vs target, risk band distribution | Must Have |
| ADM-03 | Admin shall monitor healthcare data source status | Must Have |
| ADM-04 | Admin shall view model performance metrics (AUC-ROC, Gini, KS) | Must Have |
| ADM-05 | Admin shall manage all providers (CRUD) | Must Have |
| ADM-06 | Admin shall manage collections cases | Must Have |
| ADM-07 | Admin access shall be restricted to users with `role = 'admin'` | Must Have |

### 2.8 Collections Management

| ID | Requirement | Priority |
|----|-------------|----------|
| COL-01 | Overdue payments shall be automatically escalated to collections after missed due date | Must Have |
| COL-02 | Collections dashboard shall show all open cases with aging, amounts, and status | Must Have |
| COL-03 | System shall track collection actions and outcomes | Must Have |

### 2.9 POPIA & Compliance

| ID | Requirement | Priority |
|----|-------------|----------|
| CMP-01 | System shall log all data access operations in `popia_access_log` table | Must Have |
| CMP-02 | System shall maintain a full `audit_log` for all material system events | Must Have |
| CMP-03 | Banking details shall be encrypted at rest (AES-256-GCM) | Must Have |
| CMP-04 | System shall record POPIA consent with timestamp per user | Must Have |
| CMP-05 | System shall comply with NCA credit agreement disclosure requirements | Must Have |
| CMP-06 | System shall comply with FICA identity verification (SA ID number, date of birth) | Must Have |

---

## 3. Non-Functional Requirements

### 3.1 Security

| ID | Requirement |
|----|-------------|
| SEC-01 | All API endpoints shall require authentication except: GET /api/providers, POST /api/users/register, POST /api/users/login, GET /health |
| SEC-02 | Authentication tokens shall be opaque (hashed in DB, never stored plain) |
| SEC-03 | Passwords shall use bcrypt with minimum 12 salt rounds |
| SEC-04 | Banking details shall be encrypted with AES-256-GCM before storage |
| SEC-05 | SQL injection shall be prevented via parameterized queries throughout |
| SEC-06 | API rate limiting: 100 req/15 min global; 10 req/15 min for auth endpoints |
| SEC-07 | Security headers: HSTS (1 year, includeSubDomains, preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, X-XSS-Protection |
| SEC-08 | CORS shall restrict origins to configured production domains |
| SEC-09 | Error responses shall never expose stack traces or internal details in production |
| SEC-10 | Environment validation at startup — server shall refuse to start in production with missing secrets |

### 3.2 Performance

| ID | Requirement |
|----|-------------|
| PERF-01 | API responses shall be ≤ 500ms for read operations under normal load |
| PERF-02 | Database queries shall use indexed columns for all lookups on users, applications, payments |
| PERF-03 | Application approval decision shall be returned within 3 seconds |

### 3.3 Availability & Deployment

| ID | Requirement |
|----|-------------|
| DEP-01 | Platform shall deploy to Vercel (frontend static + backend serverless) |
| DEP-02 | Database shall be Vercel Postgres (managed PostgreSQL) in production |
| DEP-03 | Environment variables: TOKEN_SECRET, ENCRYPTION_KEY, CORS_ORIGIN, DATABASE_URL |
| DEP-04 | Auto-deploy on push to main branch via Vercel CI |

### 3.4 Supported Browsers & Devices

| ID | Requirement |
|----|-------------|
| UX-01 | Frontend shall be functional on modern mobile browsers (iOS Safari, Android Chrome) |
| UX-02 | Frontend shall be functional on desktop browsers (Chrome, Firefox, Safari, Edge) |
| UX-03 | Forms shall be usable on screens ≥ 320px wide |

---

## 4. Technology Stack

### Frontend
| Component | Technology |
|-----------|-----------|
| Markup | HTML5 |
| Styling | CSS3 (inline, no external framework) |
| Scripts | Vanilla JavaScript (ES6+) |
| HTTP Client | Fetch API |
| Icons | Custom SVG library (29 icons) |

### Backend
| Component | Technology |
|-----------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL |
| ORM/Query | Raw SQL with parameterized queries (pg library) |
| Auth | Opaque token sessions (SHA-256 hashed) |
| Encryption | AES-256-GCM (Node.js crypto) |
| Password Hashing | bcrypt |
| Security Headers | Helmet.js |
| Rate Limiting | express-rate-limit |
| Logging | Morgan |
| CORS | cors package |

### Infrastructure
| Component | Technology |
|-----------|-----------|
| Hosting | Vercel |
| Database Hosting | Vercel Postgres |
| Environment Config | dotenv |

---

## 5. Database Schema Summary

| Table | Description |
|-------|-------------|
| `users` | Patient/admin/lender/provider accounts |
| `user_sessions` | Opaque token session store |
| `banking_details` | AES-256-GCM encrypted banking info |
| `providers` | Healthcare provider directory (21 columns) |
| `applications` | Payment applications |
| `payment_plans` | Active 3-month payment plans |
| `payments` | Individual scheduled payments |
| `transactions` | Immutable financial ledger |
| `collections` | Overdue payment escalation cases |
| `audit_log` | System-wide audit trail |
| `popia_access_log` | POPIA data access log |
| `marketplace_lenders` | Registered lenders (from migration 001) |
| `marketplace_offers` | Lender offers per application (from migration 001) |
| `health_data_sources` | Healthcare data provider config (from migration 002) |
| `procedure_risk_weights` | ICD-10 procedure risk profiles (from migration 002) |
| `patient_health_scores` | Bureau-like patient health scores (from migration 002) |
| `healthcare_risk_assessments` | PD/LGD/EL calculations per application (from migration 002) |
| `risk_model_performance` | Model accuracy tracking (from migration 002) |
| `healthcare_affordability` | Healthcare-specific DTI (from migration 002) |

---

## 6. API Endpoints Summary

### Authentication & Users (`/api/users`)
```
POST   /register              Register new patient
POST   /login                 Login (returns opaque tokens)
POST   /logout                Logout (revokes session)
POST   /refresh               Refresh access token
GET    /profile               Get own profile (auth)
PUT    /profile               Update profile (auth)
GET    /admin/users           List all users (admin only)
POST   /demo-login            Demo login for testing
```

### Applications (`/api/applications`)
```
POST   /                      Submit new application (auth)
GET    /                      Get own applications (auth)
GET    /:id                   Get specific application (auth)
```

### Payments (`/api/payments`)
```
GET    /plans                 Get all payment plans (auth)
GET    /upcoming              Get upcoming payments (auth)
GET    /history               Get payment history (auth)
POST   /:id/pay               Make a payment (auth)
```

### Providers (`/api/providers`)
```
GET    /                      Get all providers (public)
GET    /:id                   Get single provider (public)
GET    /search/:term          Full-text search (public)
```

### Marketplace (`/api/marketplace`)
```
GET    /applications          Get applications for lender review (lender auth)
POST   /offer                 Submit loan offer (lender auth)
GET    /offers/:applicationId Get offers for an application (auth)
POST   /accept/:offerId       Accept a loan offer (auth)
GET    /lender/portfolio      Lender portfolio summary (lender auth)
```

### Risk (`/api/risk`)
```
GET    /portfolio-summary     Overall risk portfolio metrics (admin)
GET    /distribution          Risk distribution by PD band (admin)
GET    /health-score-distribution Patient health score distribution (admin)
GET    /procedure-risk        Risk by procedure type (admin)
GET    /data-sources          Data sources configuration (admin)
GET    /assessment/:id        Risk assessment for application (auth)
POST   /recalculate/:id       Recalculate risk for application (admin)
```

---

## 7. Deprecated Features

*None in v1.0.0 — this is the initial release.*

---

## 8. Out of Scope (Planned for Future Versions)

- Payment gateway integration (debit orders, PayShap, card payments)
- SMS notifications via Twilio
- Email notifications
- Mobile app (React Native)
- Biometric authentication
- ML-based fraud detection
- Multi-language support (Zulu, Xhosa, Afrikaans)
- Live external data source integrations (Discovery API, MedCredits SA, Bonitas)
- Admin approval workflow for manual risk review cases
