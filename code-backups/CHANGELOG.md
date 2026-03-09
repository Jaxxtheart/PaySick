# PaySick Master Changelog

All notable changes to the PaySick platform are documented here in reverse chronological order.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and versioning follows [Semantic Versioning](https://semver.org/).

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
