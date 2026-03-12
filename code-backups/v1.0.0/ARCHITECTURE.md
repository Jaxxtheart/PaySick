# Architecture Diagrams — PaySick v1.0.0

**Version**: 1.0.0
**Date**: 2026-03-09

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INTERNET / USERS                               │
└──────────┬──────────────────────┬─────────────────┬────────────────────-┘
           │                      │                 │
      Patients               Lenders           Admins / Providers
           │                      │                 │
           ▼                      ▼                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        VERCEL CDN / HOSTING                              │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │                   FRONTEND (Static HTML/JS)                    │     │
│   │                                                                │     │
│   │   index.html          landing page                             │     │
│   │   login.html          auth                                     │     │
│   │   onboarding.html     patient registration                     │     │
│   │   dashboard.html      patient portal                           │     │
│   │   marketplace-offers  offer comparison                         │     │
│   │   marketplace-apply   application flow                         │     │
│   │   lender-dashboard    lender portal                            │     │
│   │   providers.html      provider directory                       │     │
│   │   provider-apply      provider onboarding                      │     │
│   │   admin-dashboard     admin portal                             │     │
│   │   admin-providers     provider mgmt                            │     │
│   │   collections.html    collections mgmt                         │     │
│   │   investor-deck       investor materials                       │     │
│   └────────────────────────────────────────────────────────────────┘     │
│                              │ Fetch API                                 │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │                BACKEND API (Express.js / Node.js)              │     │
│   │                                                                │     │
│   │   /api/users          auth, profiles, sessions                 │     │
│   │   /api/applications   payment applications                     │     │
│   │   /api/payments       plans, schedules, history                │     │
│   │   /api/providers      provider directory                       │     │
│   │   /api/marketplace    lender auction, offers                   │     │
│   │   /api/risk           PD/LGD scoring, portfolio                │     │
│   └────────────────────────────────────────────────────────────────┘     │
│                              │ SQL (pg)                                  │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │              VERCEL POSTGRES (PostgreSQL)                      │     │
│   │              19 tables, migrations-based schema                │     │
│   └────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Patient Application Flow

```
Patient                  Frontend               API                    Database
   │                        │                    │                        │
   │   Opens marketplace     │                    │                        │
   │──────────────────────►  │                    │                        │
   │                         │  POST /api/applications                     │
   │   Submits application    │──────────────────► │                        │
   │                         │                    │  INSERT applications   │
   │                         │                    │ ──────────────────────►│
   │                         │                    │                        │
   │                         │                    │  Trigger Risk Engine   │
   │                         │                    │ ─────────────┐         │
   │                         │                    │              │         │
   │                         │                    │  PD Calc     │         │
   │                         │                    │  LGD Calc    │         │
   │                         │                    │  EL = PD×LGD×EAD       │
   │                         │                    │ ◄────────────┘         │
   │                         │                    │                        │
   │                         │                    │  INSERT risk_assessment│
   │                         │                    │ ──────────────────────►│
   │                         │                    │                        │
   │                         │                    │  Route to Marketplace  │
   │                         │                    │ ─────────────┐         │
   │                         │                    │ Auction runs │         │
   │                         │                    │ Lenders bid  │         │
   │                         │                    │ ◄────────────┘         │
   │                         │  Returns offer list │                        │
   │   Views loan offers ◄── │ ◄──────────────────│                        │
   │                         │                    │                        │
   │   Accepts offer          │                    │                        │
   │──────────────────────►  │  POST /marketplace/accept/:offerId          │
   │                         │──────────────────► │                        │
   │                         │                    │  Create payment_plan   │
   │                         │                    │ ──────────────────────►│
   │                         │                    │  Create 3x payments    │
   │                         │                    │ ──────────────────────►│
   │                         │                    │  Provider settlement   │
   │                         │                    │ ──────────────────────►│
   │   Approval confirmed ◄──│ ◄──────────────────│                        │
   │                         │                    │                        │
```

---

## 3. Authentication Flow

```
Client                    API                       Database
  │                         │                           │
  │  POST /api/users/login  │                           │
  │  {email, password}      │                           │
  │────────────────────────►│                           │
  │                         │  SELECT user WHERE email  │
  │                         │──────────────────────────►│
  │                         │◄──────────────────────────│
  │                         │                           │
  │                         │  bcrypt.compare(password) │
  │                         │  (fail → increment failed_login_attempts)
  │                         │                           │
  │                         │  Generate access_token (opaque, 32 bytes)
  │                         │  Generate refresh_token (opaque, 48 bytes)
  │                         │                           │
  │                         │  Hash both with SHA-256   │
  │                         │  INSERT user_sessions     │
  │                         │  {hashed_access, hashed_refresh, expiry, IP}
  │                         │──────────────────────────►│
  │                         │                           │
  │  {access_token,         │                           │
  │   refresh_token,        │                           │
  │   expires_in}           │                           │
  │◄────────────────────────│                           │
  │                         │                           │
  │  Subsequent requests:   │                           │
  │  Authorization: Bearer <access_token>               │
  │────────────────────────►│                           │
  │                         │  Hash token → SELECT session
  │                         │──────────────────────────►│
  │                         │  Verify not revoked, not expired
  │                         │◄──────────────────────────│
  │                         │  Attach user to request   │
  │  Protected response    ◄│                           │
```

---

## 4. Healthcare Risk Scoring Engine

```
Application
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│               HEALTHCARE RISK SERVICE                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         PD (Probability of Default)               │   │
│  │                                                   │   │
│  │  Component 1: Medical Aid Claims History (25%)    │   │
│  │  ├── Claim frequency                              │   │
│  │  └── Payment history with medical aids            │   │
│  │                                                   │   │
│  │  Component 2: Medication Adherence (20%)          │   │
│  │  ├── Chronic script refill regularity             │   │
│  │  └── Pharmacy dispensing records                  │   │
│  │                                                   │   │
│  │  Component 3: PaySick Payment History (30%)       │   │
│  │  ├── Internal repayment behaviour                 │   │
│  │  └── Previous plan performance                    │   │
│  │                                                   │   │
│  │  Component 4: ICD-10 Procedure Risk (15%)         │   │
│  │  └── Procedure-specific default rates             │   │
│  │                                                   │   │
│  │  Component 5: Provider Network Performance (10%)  │   │
│  │  └── Provider-level application outcomes          │   │
│  │                                                   │   │
│  │  PD SCORE ──────────────────────────────────────► │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │         LGD (Loss Given Default)                  │   │
│  │                                                   │   │
│  │  Mitigation 1: Provider Settlement Offset        │   │
│  │  Mitigation 2: Family Support Factor             │   │
│  │  Mitigation 3: Non-Discretionary Need Premium    │   │
│  │  Mitigation 4: Healthcare Outcome Correlation    │   │
│  │                                                   │   │
│  │  LGD SCORE ──────────────────────────────────────► │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  EL = PD × LGD × EAD (Exposure at Default)              │
│                                                          │
│  DECISION ENGINE:                                        │
│  ├── EL ≤ threshold → APPROVE                           │
│  ├── threshold < EL ≤ limit → MANUAL REVIEW             │
│  └── EL > limit → DECLINE                               │
└──────────────────────────────────────────────────────────┘
         │                  │                  │
      APPROVE           REVIEW             DECLINE
         │
         ▼
  MARKETPLACE AUCTION
  ├── Application broadcast to eligible lenders
  ├── Lenders submit offers (rate, amount, conditions)
  ├── Auction service ranks offers (best rate for patient)
  └── Patient selects offer → loan funded
```

---

## 5. Database Entity-Relationship Diagram

```
users
─────
user_id (PK)
full_name
email
cell_number
password_hash
role  ──────────────────────────────────────────────┐
sa_id_number                                        │
postal_code                                         │
date_of_birth                              (admin, lender, provider, user)
status
risk_tier
credit_limit
popia_consent
created_at

    │1                            │1
    │                             │
    │N                            │N
    ▼                             ▼
applications               user_sessions
──────────────             ─────────────
application_id (PK)        session_id (PK)
user_id (FK → users)       user_id (FK → users)
provider_id (FK → providers) access_token_hash
procedure_code             refresh_token_hash
amount_requested           access_expires_at
status                     refresh_expires_at
risk_tier                  ip_address
created_at                 revoked

    │1
    │
    │1
    ▼
healthcare_risk_assessments
───────────────────────────
assessment_id (PK)
application_id (FK → applications)
pd_score
lgd_score
expected_loss
risk_band
decision
component_scores (JSON)
created_at

    │1
    │
    │1
    ▼
payment_plans
─────────────
plan_id (PK)
application_id (FK → applications)
user_id (FK → users)
total_amount
monthly_instalment
months_remaining
status
created_at

    │1
    │
    │N
    ▼
payments
────────
payment_id (PK)
plan_id (FK → payment_plans)
due_date
amount
status (pending/paid/overdue)
paid_at

    │1 (overdue payments)
    │
    │1
    ▼
collections
───────────
collection_id (PK)
payment_id (FK → payments)
user_id (FK → users)
amount_owed
status
created_at

providers
─────────
provider_id (PK)
name
type (gp/specialist/dentist/...)
province
city
is_network_partner
settlement_rate
created_at

marketplace_lenders
────────────────────
lender_id (PK)
user_id (FK → users)
company_name
risk_appetite_config (JSON)
max_loan_amount
min_credit_score
created_at

marketplace_offers
──────────────────
offer_id (PK)
application_id (FK → applications)
lender_id (FK → marketplace_lenders)
interest_rate
monthly_instalment
total_repayable
status (pending/accepted/expired)
expires_at
created_at

transactions
────────────
transaction_id (PK)
reference_type (plan/payment/collection)
reference_id
amount
direction (debit/credit)
description
created_at

audit_log
─────────
log_id (PK)
user_id (FK → users, nullable)
action
entity_type
entity_id
details (JSON)
ip_address
created_at

popia_access_log
────────────────
access_id (PK)
accessor_user_id (FK → users)
subject_user_id (FK → users)
data_fields_accessed
purpose
created_at
```

---

## 6. Multi-Lender Marketplace Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│    PATIENT   │     │  MARKETPLACE    │     │    LENDERS       │
│              │     │  AUCTION SVC    │     │                  │
│ Applies for  │────►│                 │     │                  │
│ R850 loan    │     │ Risk score >    │     │                  │
│              │     │ threshold?      │     │                  │
│              │     │    │ YES        │     │                  │
│              │     │    ▼            │     │                  │
│              │     │ Broadcast to    │────►│ Lender A         │
│              │     │ eligible        │────►│ Lender B         │
│              │     │ lenders         │────►│ Lender C         │
│              │     │                 │     │                  │
│              │     │ Receive offers  │◄────│ Submit offers    │
│              │     │ Rank by rate    │     │ with rates &     │
│              │     │ (patient-first) │     │ conditions       │
│              │     │                 │     │                  │
│ Views ranked │◄────│ Return ranked   │     │                  │
│ offers       │     │ offer list      │     │                  │
│              │     │                 │     │                  │
│ Accepts      │────►│ Approve bridge: │     │                  │
│ best offer   │     │ - Create plan   │     │                  │
│              │     │ - Schedule pmts │     │                  │
│              │     │ - Notify lender │────►│ Funded           │
│              │     │ - Settle prvdr  │     │                  │
└──────────────┘     └─────────────────┘     └──────────────────┘
```

---

## 7. Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      REQUEST PIPELINE                           │
│                                                                 │
│  Incoming Request                                               │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                            │
│  │   Helmet.js     │  HSTS, X-Frame-Options, nosniff,           │
│  │  (sec headers)  │  XSS-Protection, Referrer-Policy           │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │  CORS Middleware│  Whitelist: configured origins +           │
│  │                 │  *.vercel.app + localhost (dev only)        │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │  Rate Limiter   │  Global: 100 req/15min                     │
│  │                 │  Auth endpoints: 10 req/15min              │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │  Auth Middleware│  Hash token → lookup in user_sessions      │
│  │  (protected     │  Check: not revoked, not expired,          │
│  │   routes only)  │  update last_activity                      │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │  Route Handler  │  Parameterized SQL queries only            │
│  │                 │  No raw string concatenation               │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │  Error Handler  │  Stack traces stripped in production       │
│  │                 │  Generic 500 messages only                 │
│  └─────────────────┘                                            │
│                                                                 │
│  DATA ENCRYPTION (at rest)                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  banking_details encrypted with AES-256-GCM              │   │
│  │  Key: ENCRYPTION_KEY env var (32-byte hex)               │   │
│  │  IV: random per record                                   │   │
│  │  Auth tag stored alongside ciphertext                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Architecture (Vercel)

```
                    GitHub Repository
                          │
                     git push main
                          │
                          ▼
                   ┌─────────────┐
                   │  Vercel CI  │
                   │  Auto-build │
                   └──────┬──────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌─────────────────────┐        ┌──────────────────────┐
│   Static Assets     │        │  Serverless Function  │
│   (Vercel CDN)      │        │  (Node.js/Express)    │
│                     │        │                        │
│  *.html             │        │  /api/* routes        │
│  *.js (frontend)    │        │  Runs on Vercel Edge  │
│  vercel.json routing│        │                        │
└─────────────────────┘        └──────────┬───────────-┘
                                           │
                                           │ SSL/TLS
                                           ▼
                               ┌──────────────────────┐
                               │   Vercel Postgres     │
                               │   (Managed PostgreSQL)│
                               │                       │
                               │   Connection pooling  │
                               │   Automatic SSL       │
                               │   Daily backups       │
                               └──────────────────────-┘

Environment Variables (Vercel Dashboard):
  TOKEN_SECRET         — 64-byte hex token signing secret
  ENCRYPTION_KEY       — 32-byte hex AES key
  CORS_ORIGIN          — comma-separated allowed origins
  DATABASE_URL         — auto-injected by Vercel Postgres
  NODE_ENV             — production
```

---

## 9. File Structure Map

```
PaySick/
│
├── Frontend (Vercel static hosting)
│   ├── index.html                  Landing page
│   ├── login.html                  Auth (login + registration entry)
│   ├── onboarding.html             Patient registration flow
│   ├── dashboard.html              Patient dashboard
│   ├── marketplace-offers.html     Loan offer comparison
│   ├── marketplace-apply.html      Application flow
│   ├── lender-dashboard.html       Lender portal
│   ├── providers.html              Provider directory (public)
│   ├── provider-apply.html         Provider onboarding
│   ├── admin-dashboard.html        Admin portal
│   ├── admin-providers.html        Provider management
│   ├── collections.html            Collections management
│   ├── investor-deck.html          Investor presentation
│   ├── api-client.js               Frontend HTTP client (dynamic baseURL)
│   └── js/
│       └── security-utils.js       Client-side security helpers
│
├── backend/                        Vercel serverless function
│   ├── src/
│   │   ├── server.js               Express app entry point
│   │   ├── config/
│   │   │   └── database.js         PostgreSQL connection (Vercel Postgres)
│   │   ├── middleware/
│   │   │   └── auth.middleware.js  Opaque token auth
│   │   ├── routes/
│   │   │   ├── users.js            Auth + profile endpoints
│   │   │   ├── applications.js     Application CRUD
│   │   │   ├── payments.js         Payment plan endpoints
│   │   │   ├── providers.js        Provider directory endpoints
│   │   │   ├── marketplace.js      Marketplace + auction endpoints
│   │   │   └── risk.js             Risk scoring endpoints
│   │   ├── services/
│   │   │   ├── healthcare-risk.service.js     PD/LGD engine
│   │   │   ├── marketplace-auction.service.js Auction matching
│   │   │   ├── loan-approval-bridge.service.js Approval state machine
│   │   │   └── security.service.js            Encryption/hashing
│   │   ├── utils/
│   │   │   └── setupDatabase.js    DB init utility
│   │   └── migrations/
│   │       └── 003_security_tables.sql Security schema
│   ├── database/
│   │   ├── schema.sql              Core schema
│   │   └── migrations/
│   │       ├── 001_marketplace_tables.sql
│   │       ├── 002_healthcare_risk_scoring.sql
│   │       └── 002_seed_marketplace.sql
│   ├── .env.example                Environment template
│   └── package.json
│
├── vercel.json                      Routing + build config
├── .vercelignore                    Vercel exclude rules
├── package.json                     Root package (if any)
│
├── Documentation
│   ├── README.md                    Main readme
│   ├── DASHBOARD_README.md          Dashboard guide
│   ├── DATABASE_SETUP.md            Local DB setup
│   ├── DESIGN_SYSTEM.md             SVG icon library + design tokens
│   ├── INSTALLATION_NOTES.md        Quick setup reference
│   ├── VERCEL_DEPLOYMENT.md         Vercel deployment guide
│   └── progress.md                  Development milestone log
│
└── code-backups/                    [THIS FOLDER] Versioned archive
    ├── README.md
    ├── VERSIONING_GUIDE.md
    ├── CHANGELOG.md
    └── v1.0.0/
        ├── RELEASE_NOTES.md
        ├── REQUIREMENTS.md
        ├── ARCHITECTURE.md          (this file)
        └── snapshot/                Full source code snapshot
```
