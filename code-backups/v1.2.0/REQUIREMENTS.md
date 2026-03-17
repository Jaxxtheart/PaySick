# Requirements & Specifications — PaySick v1.2.0

**Version**: 1.2.0
**Date**: 2026-03-12
**Platform**: South African Healthcare Payment Platform
**Regulatory Context**: NCA (National Credit Act), POPIA (Protection of Personal Information Act), FICA

---

## 1. Product Overview

PaySick is a B2C2B fintech platform that enables South African patients to split their medical bills into manageable 3-month payment plans. The platform operates a multi-lender marketplace model where registered lenders fund patient applications, with healthcare providers acting as the point-of-sale channel.

---

## 2. Functional Requirements

### 2.1 Patient Registration & Authentication
*(Unchanged from v1.1.0)*

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
| AUTH-09 | Session tokens stored as hashed values (never plain text) | Must Have |
| AUTH-10 | Email verification required before account activation | Must Have |

### 2.2 Payment Application Flow
*(Unchanged from v1.1.0)*

| ID | Requirement | Priority |
|----|-------------|----------|
| APP-01 | Patient submits payment application for healthcare procedure | Must Have |
| APP-02 | Captures: provider, procedure type (ICD-10), amount, banking details | Must Have |
| APP-03 | Automated risk assessment per application | Must Have |
| APP-04 | Risk output: PD score, LGD score, Expected Loss, risk tier, decision | Must Have |
| APP-05 | Maximum credit limit R850.00 per patient at launch | Must Have |
| APP-06 | Approved applications routed to lender marketplace auction | Must Have |
| APP-07 | Applications visible in patient dashboard with real-time status | Must Have |

### 2.3 Payment Plans, Scheduling & UI *(v1.2.0: UI added)*

| ID | Requirement | Priority |
|----|-------------|----------|
| PAY-01 | Approved applications generate 3-month plan with equal monthly instalments | Must Have |
| PAY-02 | Track each payment's due date, amount, status (pending/paid/overdue) | Must Have |
| PAY-03 | Patient dashboard displays upcoming payments and payment history | Must Have |
| PAY-04 | Immutable financial transaction ledger | Must Have |
| PAY-05 | Overdue payments escalated to collections | Must Have |
| PAY-06 | Payment gateway integration (debit orders, PayShap, card) — active placeholder | Should Have |
| **PAY-07** | **`payments.html` — My Payments page with tabs: active plans, upcoming, history** | **Must Have** |
| **PAY-08** | **`make-payment.html` — Payment execution: plan selection, confirmation, API submission** | **Must Have** |
| **PAY-09** | **`payment-success.html` — Post-payment confirmation screen** | **Must Have** |

### 2.4 Multi-Lender Marketplace
*(Unchanged from v1.1.0)*

### 2.5 Healthcare Provider Network *(v1.2.0: extended API + self-service apply)*

| ID | Requirement | Priority |
|----|-------------|----------|
| PRV-01 | Searchable directory of registered healthcare providers | Must Have |
| PRV-02 | Filterable by type, province, network status | Must Have |
| **PRV-03** | **`POST /api/providers/apply` — self-service provider application; banking data encrypted with AES-256-GCM** | **Must Have** |
| PRV-04 | Admin CRUD for providers (approve, reject, update, delete, suspend) — all routes require admin auth | Must Have |
| PRV-05 | Provider settlement tracked per application | Must Have |
| PRV-06 | Provider performance feeds into risk scoring | Should Have |
| **PRV-07** | **`POST /api/providers/track-cta` — analytics tracking; never fails caller** | **Should Have** |
| **PRV-08** | **Provider network section visible on homepage (`index.html`)** | **Should Have** |
| **PRV-09** | **`backend/database/seed-providers.sql` — seed data for development and demo** | **Should Have** |

### 2.6 Healthcare Risk Scoring Engine
*(Unchanged from v1.1.0)*

### 2.7 Admin Dashboard
*(Unchanged from v1.1.0)*

### 2.8 Collections Management
*(Unchanged from v1.1.0)*

### 2.9 POPIA & Compliance

| ID | Requirement | Priority |
|----|-------------|----------|
| CMP-01 | Log all data access in `popia_access_log` | Must Have |
| CMP-02 | Full `audit_log` for all material system events (now includes CTA clicks) | Must Have |
| CMP-03 | Banking details encrypted at rest (AES-256-GCM) — **now enforced in provider apply route** | Must Have |
| CMP-04 | POPIA consent with timestamp per user | Must Have |
| CMP-05 | NCA credit agreement disclosure compliance | Must Have |
| CMP-06 | FICA identity verification (SA ID, DOB) | Must Have |

---

## 3. Non-Functional Requirements

### 3.1 Security

| ID | Requirement |
|----|-------------|
| SEC-01 | AES-256-GCM encryption for all banking data (user + provider) |
| SEC-02 | scrypt for password hashing |
| SEC-03 | Opaque session tokens |
| SEC-04 | All admin API routes require authenticateToken + requireRole('admin') |
| SEC-05 | Rate limiting on auth endpoints |
| SEC-06 | Helmet.js security headers |
| SEC-07 | CORS restricted to paysick.co.za and www.paysick.co.za in production |

### 3.2 Deployment

| ID | Requirement |
|----|-------------|
| DEP-01 | Express app guards `app.listen()` with `VERCEL !== '1'` for serverless compatibility |
| DEP-02 | `api/index.js` exports Express app as Vercel serverless function |
| DEP-03 | `vercel.json` uses modern `rewrites` syntax |
| DEP-04 | `NODE_ENV=production`, `ALLOW_DEMO_LOGIN=true`, `CORS_ORIGIN` set in vercel.json env |

---

## 4. Deprecated Features

None deprecated in v1.2.0.

*For previously deprecated features see v1.1.0 REQUIREMENTS.md.*
