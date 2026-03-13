# Requirements & Specifications — PaySick v1.3.2

**Version**: 1.3.2
**Date**: 2026-03-13
**Platform**: South African Healthcare Payment Platform
**Regulatory Context**: NCA (National Credit Act), POPIA (Protection of Personal Information Act), FICA

---

## 1. Product Overview

PaySick is a B2C2B fintech platform that enables South African patients to split their medical bills into manageable 3-month payment plans. The platform operates a multi-lender marketplace model where registered lenders fund patient applications, with healthcare providers acting as the point-of-sale channel.

---

## 2. Functional Requirements

### 2.1 Patient Registration & Authentication
*(Unchanged from v1.3.1)*

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

### 2.2 Payment Plans
*(Unchanged from v1.3.1)*

| ID | Requirement | Priority |
|----|-------------|----------|
| PAY-01 | Split medical bills into 3-month instalments | Must Have |
| PAY-02 | Display upcoming payment schedule | Must Have |
| PAY-03 | Payment history view | Must Have |
| PAY-04 | Active plan overview | Must Have |

### 2.3 Provider Directory & Registration

| ID | Requirement | Priority |
|----|-------------|----------|
| PROV-01 | Public list of participating healthcare providers | Must Have |
| PROV-02 | Filter by type, city, network partner status | Must Have |
| PROV-03 | Provider search by name | Must Have |
| PROV-04 | Provider detail page | Must Have |
| PROV-05 | Provider registration application via provider-apply.html | Must Have |
| PROV-06 | Admin approval workflow for providers | Must Have |
| PROV-07 | Bank details encrypted with AES-256-GCM | Must Have |
| PROV-08 | Provider application errors displayed inline — no alert() | Must Have — added v1.3.2 |
| PROV-09 | Provider application form resilient to non-JSON server responses (server crash / hosting error) | Must Have — added v1.3.2 |

### 2.4 Public Website
*(Unchanged from v1.3.1)*

| ID | Requirement | Priority |
|----|-------------|----------|
| WEB-01 | Landing page with generic provider network statement (no specific brand names) | Must Have |
| WEB-02 | About Us page with company mission and stats | Should Have |
| WEB-03 | Contact page with form and contact details | Should Have |
| WEB-04 | Privacy Policy page (canonical: privacy-policy.html) | Must Have |
| WEB-05 | Terms of Service page (canonical: terms-of-service.html) | Must Have |
| WEB-06 | Contact form must use fetch() — no alert() in production | Must Have |

### 2.5 Security & Infrastructure
*(Unchanged from v1.3.1)*

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

---

## 3. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Node.js >= 18.0.0 |
| NFR-02 | Vercel serverless deployment via api/index.js |
| NFR-03 | PostgreSQL database with connection pooling |
| NFR-04 | 59 unit tests must pass (security-utils, security.service) |
| NFR-05 | All API routes covered by integration tests |

---

## 4. Deprecated Features

None in this version.
