# PaySick Development Progress

This document tracks the development progress of the PaySick healthcare payment platform.

## CORE FUNCTIONALITY - DO NOT REMOVE

### Demo Access System (Password-Gated)
This is production-critical functionality for investor demos, partner onboarding, and development.

**Architecture:**
- `login.html` - Clean production login page for real users. Contains only a subtle, near-invisible "Demo" link at the very bottom pointing to `demo-login.html`.
- `demo-login.html` - Password-gated demo page. Password: `PaySick-demo-2026`. After correct password entry, reveals one-click role buttons (Patient, Provider, Lender, Admin) that call `/api/users/demo-login`.
- `backend/src/routes/users.js` - `POST /api/users/demo-login` endpoint with 4 hardcoded demo accounts. Controlled by `ALLOW_DEMO_LOGIN=true` env var (auto-enabled in non-production).
- `backend/src/server.js` - Demo-login rate limiter applied.

**Marketplace Preview Mode:**
- `backend/src/routes/marketplace.js` - When no active lenders exist, returns preview offers (MediFinance SA 16.5%, HealthCredit Plus 18.5%, CareCapital 19.5%) with `demo: true` flag.
- `marketplace-apply.html` - Renders preview offer cards with "Preview Only - Not a Real Offer" disclaimers, next steps, and "Notify Me" button.

**Dashboard defaults:**
- `dashboard.html` - Default sidebar: John Doe / user@paysick.com
- `admin-dashboard.html` - Default sidebar: Admin User / admin@paysick.com
- `onboarding.html` - Falls back gracefully in demo mode if API registration fails

---

## Latest Updates

### 2026-03-09 - Demo Access Redesign (Production Push)

Upgraded demo access from exposed credentials on login page to a proper password-gated system per the design from `claude/add-login-functionality-FEn61`.

#### Changes
1. **`login.html`** - Cleaned for real users. Removed all demo credentials display, auto-fill, and demo-login fallback. Added subtle "Demo" link at bottom (color: #D0D0D0, 11px) pointing to `demo-login.html`.
2. **`demo-login.html`** (NEW) - Password-gated demo page:
   - Dark theme (#2C3E50) to visually distinguish from production login
   - Password gate: `PaySick-demo-2026` required to reveal role buttons
   - 4 one-click role buttons (Patient, Provider, Lender, Admin) with custom SVG icons
   - Calls `POST /api/users/demo-login` directly
   - Shake animation on wrong password
   - Loading states and error handling

#### Backend (Preserved from previous commit)
- `POST /api/users/demo-login` endpoint in users.js (4 demo accounts)
- Demo-login rate limiter in server.js
- Marketplace preview offers in marketplace.js (3 preview lenders)
- Preview container rendering in marketplace-apply.html

#### Files Modified
1. `login.html` - Removed demo section, added subtle demo link
2. `demo-login.html` - NEW: password-gated demo access page

#### Security Hardening Preserved
- Timing-safe webhook signatures, graceful shutdown, production CORS, Shield validation

---

### 2026-02-06 - Healthcare Risk Scoring System Implementation

Built comprehensive proprietary PD (Probability of Default) and LGD (Loss Given Default) models specifically designed for healthcare financing.

#### Database Schema Created
- `health_data_sources` - Configuration for healthcare data providers
- `procedure_risk_weights` - ICD-10 procedure-specific risk profiles
- `patient_health_scores` - Healthcare bureau-like score for patients
- `healthcare_risk_assessments` - Comprehensive PD/LGD calculations per application
- `risk_model_performance` - Track model accuracy over time
- `healthcare_affordability` - Healthcare-specific DTI and affordability

#### Healthcare Data Sources Integrated
1. **Medical Aid Claims History** - Discovery, Bonitas, Momentum integration
2. **Chronic Medication Adherence** - Pharmacy dispensing records
3. **Healthcare Payment History** - PaySick internal payment behavior
4. **Medical Credit Bureau** - MedCredits SA (pending integration)
5. **ICD-10 Procedure Risk Profiles** - Procedure-specific risk weighting
6. **Provider Network Performance** - Network partner performance data

#### Risk Service Features
- Automated PD calculation with 5 component scores
- LGD calculation with 4 mitigation components
- Expected Loss calculation (PD x LGD x EAD)
- Risk-adjusted pricing recommendations
- Automated risk decision (approve/review/decline)
- Healthcare-specific affordability assessment

#### Admin Dashboard Updates
- Risk Portfolio section with real-time metrics
- PD/LGD/Expected Loss tracking vs targets
- Healthcare data source status monitoring
- Model performance metrics (AUC-ROC, Gini, KS)
- Risk distribution visualization by band

#### API Endpoints Added
- `GET /api/risk/portfolio-summary` - Overall risk portfolio metrics
- `GET /api/risk/distribution` - Risk distribution by PD band
- `GET /api/risk/health-score-distribution` - Patient health score distribution
- `GET /api/risk/procedure-risk` - Risk by procedure type
- `GET /api/risk/data-sources` - Data sources configuration
- `GET /api/risk/assessment/:id` - Get risk assessment for application
- `POST /api/risk/recalculate/:id` - Recalculate risk for application

#### Investor Deck Updated
- Replaced soft collection LGD mitigations with healthcare data sources
- Added "Healthcare Bureau Score" section highlighting proprietary data

---

### 2026-02-05 - Investor Deck Risk Management Slide

Added comprehensive Risk Management slide (Slide 8) to address investor concerns about healthcare financing risk.

#### Investor Concerns Addressed
1. **Actuarial risk differences** - Healthcare financing vs retail BNPL risk profiles
2. **Higher loan amounts** - Healthcare quantum substantially higher than retail BNPL
3. **Need-based lending** - Historically lower repayment rates for desperate customers
4. **Payback uncertainty** - LGD concerns without strong underwriting

#### Key Messaging Added
- **Non-discretionary need**: Patients finance essential procedures, not impulse purchases
- **Higher ticket sizes**: R18K avg. loan spreads underwriting costs efficiently
- **Provider partnership**: Healthcare providers become soft collection partners
- **Family support**: Medical debt attracts family payment commitment

#### Proprietary Risk Models Highlighted
- Healthcare-specific PD (Probability of Default) models
- Procedure type risk weighting
- Provider network performance data
- Healthcare-specific affordability ratios
- Medical outcome correlation factors

#### Healthcare Data Sources (Updated)
- Medical Aid Claims History (Discovery, Bonitas, Momentum)
- Chronic Medication Adherence (Pharmacy records)
- Healthcare Payment History (PaySick internal)
- ICD-10 Procedure Risk Profiles
- Medical Credit Bureau (MedCredits SA)

#### Target Metrics Presented
| Metric | Target | vs Retail BNPL |
|--------|--------|----------------|
| PD | 3.2% | vs 8%+ |
| LGD | 45% | - |
| Net Loss Rate | 1.4% | vs 8%+ |

---

### 2026-02-03 - Provider Network Pages Restored

Restored and updated the Provider Network functionality including all provider-related pages.

#### Pages Restored from Git History
- `providers.html` - Healthcare Provider Directory (public-facing)
  - Search and filter providers by type, province, network status
  - Network effects CTA banners for provider recruitment
  - Provider cards with contact info and "Apply with Provider" action
- `admin-providers.html` - Provider Management (admin interface)
  - Full provider CRUD operations
  - Provider statistics and metrics
  - Network partner management
- `provider-apply.html` - Provider Application Form
  - Multi-step provider onboarding
  - Business information collection
  - Banking details for settlements

#### Navigation Updates
- Updated `admin-dashboard.html` Provider Network link to route to `admin-providers.html`
- Updated `index.html` "For Providers" and "Find Providers" links to route to `providers.html`
- Applied custom SVG icons to all restored provider pages

#### Backend Support (Already Present)
- `GET /api/providers` - List all providers with filtering
- `GET /api/providers/:id` - Get single provider
- `GET /api/providers/search/:term` - Full-text search
- Database: `providers` table with 21 columns

---

### 2026-02-03 - Custom SVG Icon System Implementation

Replaced all iPhone emoji/favicon icons with custom SVG icons following the "Steve Jobs & Jony Ive meets Airbnb" design philosophy.

#### Design Principles Applied
- **Minimalist line art** with 2px stroke weight
- **Clean, geometric shapes** with rounded corners (stroke-linecap: round, stroke-linejoin: round)
- **PaySick brand colors** (#FF4757 to #E01E37) for active/hover states
- **Smooth transitions** (0.3s ease) on hover
- **Consistent sizing** across all pages

#### Files Updated
- `index.html` - Landing page feature icons, hamburger menu
- `dashboard.html` - Navigation menu, stat cards, quick actions, welcome wave
- `login.html` - Back arrow navigation
- `onboarding.html` - Payment method icons (bank, card, payshap), lock, success checkmark
- `collections.html` - Page title icon, back navigation
- `admin-dashboard.html` - Full navigation menu, stat card icons, page title
- `lender-dashboard.html` - Navigation menu, empty state icons (inbox, warning)
- `DESIGN_SYSTEM.md` - Updated icon documentation with complete SVG library

#### Icon Library Created
| Icon | Usage |
|------|-------|
| Home | Dashboard navigation |
| Credit Card | Payment plans |
| Calendar | Upcoming payments |
| Document | Statements, reports |
| Bar Chart | Collections, analytics |
| Line Chart | Payment trends |
| Globe | Main site link |
| Question | How it works |
| Star | Features |
| Settings | Account settings |
| Bell | Notifications |
| Chat | Support |
| Logout | Exit/logout |
| Currency | Revenue, balance |
| Checkmark | Success, paid status |
| Users | User management |
| Bank | Banking, marketplace |
| Hospital | Provider network |
| Tools | Admin tools |
| Clock | Pending items |
| Lightning | Quick actions |
| Lock | Security |
| Mobile | Mobile features |
| Arrow | Back navigation |
| Clipboard | Applications |
| Menu | Hamburger menu |
| Close | Close button |
| Warning | Error states |
| Empty | No data states |

---

### 2026-02-03 - Marketplace API Fix

Fixed "Failed to fetch" error on the lender marketplace.

#### Problem
- API calls were failing on Vercel deployment
- `api-client.js` had hardcoded `baseURL: 'http://localhost:3000/api'`
- This didn't work in production where the API is at `/api`

#### Solution
Made baseURL dynamic to detect environment:
```javascript
baseURL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'
  : '/api',
```

#### Files Updated
- `api-client.js` - Dynamic baseURL configuration

---

### Previous Milestones

#### Investor Deck (2026-02-02)
- Created 12-slide investor presentation for seed stage fundraising
- Updated to PPTX download format
- Available at `/investor-deck.html`

#### Multi-Lender Marketplace (2026-01-xx)
- Database tables for marketplace functionality
- Lender management and loan offers
- Risk assessment scoring
- Patient application flow
- Lender dashboard for reviewing applications

#### Core Platform
- PostgreSQL database with complete schema
- User authentication with JWT
- Payment application workflow
- Payment plans and scheduling
- Collections management
- POPIA compliance logging
- Provider network directory

---

## Current Status

### Completed
- Database schema
- Backend API (Express.js)
- User authentication
- Frontend UI (all pages)
- Vercel deployment configuration
- Multi-lender marketplace
- Custom SVG icon system
- Investor presentation deck
- Provider Network (directory, admin, application pages)
- Healthcare Risk Scoring System (PD/LGD models)
- Admin Risk Portfolio Dashboard

### In Progress
- Payment gateway integration
- SMS/Email notifications

### Planned
- Mobile app (React Native)
- Biometric authentication
- ML-based fraud detection
- Multi-language support
- External data source integrations (MedCredits, Discovery API)

---

---

## Standing Rules

1. **progress.md MUST be updated every time we promote to production.** No exceptions. Every production push must have a corresponding entry documenting what changed, what was added/removed, and the audit results.
2. **Never remove functionality without explicit permission.** Demo access, preview modes, and fallback behaviors are features — not technical debt.

---

**Last Updated**: 2026-03-09
