# PaySick Development Progress

This document tracks the development progress of the PaySick healthcare payment platform.

## Latest Updates

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

### 2026-03-07 - Email Verification & Optimized Onboarding Journey

Added a mandatory email confirmation step to the 'Get Started' flow and split the onboarding into two optimized paths based on how the user arrived.

#### Problems (Mistakes Never to Repeat)

**Rule: Never issue an authenticated session to an unverified email address.**
The original registration endpoint created an `active` account and issued an `accessToken` immediately — with no proof the user owned the email. This allows impersonation.

**Rule: Never call `POST /api/users/register` from the onboarding page when the user is already registered.**
`onboarding.html` submitted a second registration at the end — which 409s for users arriving via `register.html`. The onboarding must branch based on source.

**Rule: Never use `data.token` when the API returns `data.accessToken`.**
The banking API call used `Authorization: Bearer ${data.token}` — always `undefined`.

#### New Get-Started Flow
```
register.html → [status='pending', verification email sent]
             → verify-email.html?email=...   (check inbox)
             ← user clicks link in email
             → verify-email.html?token=...   (auto-verify → session issued)
             → onboarding.html?from=register  (pre-populated mode)
             → dashboard.html
```

#### What Changed
- `POST /api/users/register` — creates user as `status='pending'`, sends email, returns `requiresEmailVerification: true` (no token)
- `POST /api/users/verify-email` (new) — validates token, activates account, issues session
- `POST /api/users/resend-verification` (new) — resends link, generic response (no user enumeration)
- `POST /api/users/login` — blocks `status='pending'` with `EMAIL_UNVERIFIED` code
- `backend/src/services/email.service.js` (new) — branded HTML email via nodemailer; Ethereal fallback in dev
- `verify-email.html` (new) — 4-state page: check inbox / verifying / success / error; 60s resend countdown
- `register.html` — saves `paysick_registration_data` + redirects to `verify-email.html`
- `onboarding.html` — dual-mode: post-registration (pre-filled, no re-register, uses stored token) vs legacy (full form, existing behaviour); token bug fixed (`data.accessToken`)
- Schema: `email_verified`, `email_verification_token`, `email_verification_expires` added to users table
- `backend/.env.example` — SMTP_* and APP_URL vars documented

#### Files Changed
`backend/package.json`, `backend/.env.example`, `backend/database/schema.sql`,
`backend/src/migrations/004_email_verification.sql`, `backend/src/services/email.service.js`,
`backend/src/routes/users.js`, `verify-email.html`, `register.html`, `onboarding.html`, `login.html`

---

### 2026-03-03 - Legal Pages, Footer Hygiene & Comprehensive Compliance Docs

Added all required legal and compliance pages and permanently fixed footer navigation so dead links can never ship again.

#### Problem (Mistakes Never to Repeat)

**Rule: Every footer link must point to a real, committed file. Dead `#anchor` links in the footer are launch-blockers — always verify each link resolves before committing.**

The `index.html` footer listed 4 Legal pages (Privacy Policy, Terms of Service, Licenses, Accessibility) and several Company links. Every single one was either:
1. Pointing to `#about` — a section ID that does not exist on `index.html`
2. Pointing to pages (`accessibility.html`, `privacy-policy.html`, `terms-of-service.html`, `licenses.html`) that did not exist in the repository

Additionally the footer advertised "Careers" and "Press" links — pages that were never built and never planned.

**Secondary Rule: Never create an external link to a page that does not exist. If the page is not built, remove the link entirely rather than leaving a dead anchor.**

#### What Was Fixed

**`index.html` footer:**
- Product: "Mobile App" (`#about`) → "Get Started" (`#start`)
- Company: Removed "Careers" and "Press" entries entirely (pages never existed); "About Us" → `#how-it-works`; "Contact" → `mailto:hello@paysick.co.za`
- Legal: All 4 links fixed from dead `#about` to real pages: `privacy-policy.html`, `terms-of-service.html`, `licenses.html`, `accessibility.html`

**`register.html`:**
- Terms link fixed from dead `index.html#terms` → `terms-of-service.html`
- Privacy link fixed from dead `index.html#privacy` → `privacy-policy.html`

#### Legal Pages Created

All four pages built to production standard for a South African fintech company:

**`privacy-policy.html`** — POPIA-comprehensive (18 sections):
- Prominent Non-Credit Liability notice (first content shown)
- POPIA 8 Conditions of Lawful Processing with card grid
- Legal framework table: POPIA, NCA, FICA, CPA, ECTA, PAIA
- Special personal information (POPIA s26 health data)
- Data processing purposes with POPIA s11 legal bases
- Cross-border data transfer compliance (POPIA s72) for Vercel/Neon
- Retention periods table with statutory citations
- Security safeguards (AES-256-GCM, scrypt, opaque tokens)
- Breach notification obligations (POPIA s22)
- Data subject rights grid — all 8 rights with section references
- FICA obligations, Information Regulator contact

**`terms-of-service.html`** — Strong financial services tone (18 sections):
- Prominent Non-Credit Liability dark callout box (PaySick as payment facilitator, not a bank)
- Eligibility criteria card grid (6 cards)
- Underwriting Policy section — proprietary PD/LGD models as trade secrets; NCA affordability assessment ss80-82; explicit policy to decline borderline applications
- Fees table with NCA regulatory cap references
- DebiCheck mandate section and reversal consequences
- IP section protecting platform, risk models, brand, data
- Limitation of liability (aggregate cap = 12-month fees paid)
- Indemnification clause
- Dispute resolution: NCR, Credit Ombud, NCT, AFSA arbitration

**`licenses.html`** — SaaS IP protection (6 sections):
- Proprietary software ownership notice (dark callout box)
- 6 IP category cards: Platform Software, Risk Scoring Models (trade secrets), Trademarks, Database Contents, UI Design, Documentation
- SaaS usage grant — what users ARE permitted to do
- POPIA operator agreement context for SaaS data handling
- Third-party open source components with full MIT and BSD-2-Clause license text

**`accessibility.html`** — WCAG 2.1 Level AA commitment:
- 4-card conformance status grid (Perceivable/Operable/Understandable/Robust)
- Known limitations documented (screen reader gaps, keyboard trap, contrast)
- Alternative formats and telephone assistance (0800 000 000)
- accessibility@paysick.co.za with 2-business-day SLA

#### Files Changed
- `index.html` — Footer links fixed, Careers/Press removed
- `register.html` — Legal links fixed
- `privacy-policy.html` — New file (comprehensive POPIA-compliant)
- `terms-of-service.html` — New file (financial services tone, non-credit liability)
- `licenses.html` — New file (SaaS IP protections + OSS attributions)
- `accessibility.html` — New file (WCAG 2.1 AA commitment)

#### Lessons Learned
1. **Footer links must be verified against real files before every commit.** Run `git ls-files | grep -E "\.html$"` and cross-check against every href in the footer.
2. **Never ship a footer link to a page that does not exist.** Remove the link; do not leave a dead anchor.
3. **Legal pages are not optional.** POPIA requires a public privacy policy. NCA and CPA require accessible terms. These are compliance obligations, not marketing copy.
4. **Proprietary IP (especially risk models) must be explicitly designated as trade secrets** in both the ToS and licenses page to receive legal protection.

---

### 2026-03-03 - New User Registration Flow

Added production-ready registration page so new users can self-onboard without any demo credentials or back-door workarounds.

#### Problem (Mistake Never to Repeat)

The platform had **no self-service registration path for real users**. The only way to access any dashboard was via hardcoded demo credentials exposed in the HTML source of `login.html`. The `POST /api/users/register` backend endpoint was fully implemented and secured but completely unreachable from the frontend — a gap that would have forced every launch user to be manually seeded in the database.

**Rule**: Every authenticated endpoint must have a corresponding, accessible frontend entry point before launch. Backend-only features are not shipped features.

#### What Was Built

**`register.html`** — Complete self-service registration page:

- Collects all fields required by `POST /api/users/register`:
  - Full name, email, SA cell number
  - 13-digit SA ID number (with Luhn checksum validation client-side)
  - Date of birth (auto-extracted from ID number), postal code
  - Password (min 8 chars, uppercase + lowercase + numeric enforced)
  - Confirm password
  - Terms & Conditions acceptance
  - POPIA consent (required by South African law)
- **Live SA ID validation**: Luhn algorithm verifies checksum before submission
- **Auto-fill DOB**: When a valid ID number is entered, date of birth is extracted and pre-populated
- **Password strength meter**: Real-time feedback (Very Weak → Very Strong) with colour coding
- **Inline field errors**: Each field shows specific, contextual error text without a full-page reload
- **API integration**: POSTs to `/api/users/register`, stores `accessToken` in `localStorage`, redirects new users to `onboarding.html`
- **409 conflict handling**: Clear message if email/ID already registered ("Try signing in instead")
- **18+ age gate**: Date-of-birth input has `max` set to today minus 18 years

**`login.html`** fixes for production safety:

- Added **"New to PaySick? Create an account"** link pointing to `register.html`
- Removed **auto-fill of demo credentials** on page load — previously the form loaded with `user@paysick.com` / `password123` pre-populated, which is misleading and insecure in production. Demo credentials table remains visible for developers/testers but no longer auto-injects values into the live form.

#### Files Changed
- `register.html` — New file (production registration page)
- `login.html` — Added register CTA, removed credential auto-fill

#### Lessons Learned
1. **Never launch a guarded page without a registration path.** If users need an account to use the app, they need a way to create one.
2. **Hardcoded credential auto-fill is a production bug.** Demo helpers must be clearly separated from production UX flows.
3. **Backend endpoints are not features until the frontend exposes them.** Always cross-check every API route against whether it is reachable by an end user.

---

---

### 2026-03-07 - Legal Documentation Cleanup: IP Protection, Credit Licensing, Writing Rules

Rewrote all four legal pages to remove internal IP methodology details, remove references implying a credit provider licence, and remove all em dashes throughout.

#### Problem (Mistakes Never to Repeat)

**Rule: Never use em dashes (-- or &mdash;) in any written content, ever.** Use colons, commas, parentheses, or restructure the sentence. This applies to all HTML pages, markdown, email templates, and any other written output.

**Rule: Never describe PaySick as a registered credit provider, NCR-registered entity, or imply credit licensing obligations that do not apply.** PaySick is a healthcare payment facilitation platform. Use NCA references only with "where applicable" or "where a payment arrangement constitutes a credit agreement" qualifiers. Never cite NCR, Credit Ombud, NCT, or NCA Section 80-82/129/130 as mandatory PaySick obligations.

**Rule: Never disclose specific risk model names, parameters, or methodology in public-facing legal or marketing documents.** Describe internal models only as "proprietary assessment models, scoring methodology, and decision logic." Never publish PD, LGD, HPS, EL model names, weighting matrices, calibration data, or scoring bands in any public document.

#### What Changed

**`terms-of-service.html`** (v1.2 to v1.3):
- Section 1: Removed "registered credit provider under NCA / regulated by NCR"
- Section 4: Renamed "Underwriting Policy and Credit Assessment" to "Application Assessment"; all model specifics removed; rewritten to high-level only
- Section 4.4: Renamed from "Pre-Agreement Statement and Quotation" to "Pre-Agreement Disclosure"; NCA s92 reference removed
- Fees table: "NCA cap" column renamed to "Limit"; NCA regulation references removed
- Section 10: Renamed "Credit Bureau Reporting" to "Payment Conduct Reporting"; reframed as conditional
- Section 11.3: NCA Section 129/130 specific references removed
- Section 15: Removed NCT, NCR, Credit Ombud; replaced with NCC, CGSO
- Footer: Removed "Registered Credit Provider | NCA Compliant"
- All em dashes removed throughout

**`privacy-policy.html`** (v1.2 to v1.3):
- Section 1: Removed "registered credit provider under NCA" bullet; replaced with payment facilitation description
- Legal framework table: All em dashes in legislation names removed
- NCA table entry: Softened to "where applicable" qualifier
- Section 5: Removed "specifically, NCA affordability assessment" from legal basis
- Section 6: Removed "Legal obligation - NCA s80" and "NCR" references
- Section 7: Removed "National Credit Regulator (NCR)" from third-party recipients
- Security section: Removed specific implementation parameters
- Contact box: NCR removed entirely
- All em dashes removed throughout

**`licenses.html`**:
- IP Notice box: Removed em dash; removed "underwriting algorithms, pricing engine" from description
- Healthcare Risk Scoring section: Removed PD, LGD, HPS, EL model names; replaced with "proprietary application assessment models, scoring methodology, and decision logic"
- SaaS heading: Em dash removed
- SaaS body: Em dash removed
- Node.js description: Em dash removed

**`accessibility.html`**:
- "Partial - In Progress" x2: Changed to "Partial (In Progress)"
- "Colour contrast - secondary text": Changed to "Colour contrast (secondary text)"
- "alternative format - such as large print": Changed to parenthetical

#### Files Changed
`terms-of-service.html`, `privacy-policy.html`, `licenses.html`, `accessibility.html`

---

**Last Updated**: 2026-03-07
