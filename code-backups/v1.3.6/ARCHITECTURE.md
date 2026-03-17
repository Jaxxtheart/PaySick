# Architecture — PaySick v1.3.6

**Version**: 1.3.6
**Date**: 2026-03-13

---

## System Overview

*(Unchanged from v1.3.5)*

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (CDN + Serverless)              │
│  Static HTML → /api/* → api/index.js → Express App       │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                   Express App (server.js)                 │
│  /api/users, /api/applications, /api/payments,           │
│  /api/providers, /api/marketplace, /api/risk             │
│  /v2/shield  ← Shield framework endpoints                │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL — pool errors logged only, no process.exit() │
└─────────────────────────────────────────────────────────┘
```

---

## Patient Application Flow with Shield (v1.3.6)

```
marketplace-apply.html
  │
  ├── Step 1: Select procedure type
  │
  ├── Step 2: Loan amount + repayment term
  │
  ├── Step 3: Income details (NEW Shield fields highlighted)
  │     ├── Employment status + duration
  │     ├── Monthly income (before tax)        ← Shield: income_verified
  │     ├── Existing monthly repayments        ← Shield: monthly_obligations (NEW)
  │     ├── Medical aid cover amount           ← Shield: medical_aid_covered (NEW)
  │     ├── Procedure urgency (required)       ← Shield: urgency_classification (NEW)
  │     └── Healthcare provider (optional)
  │
  ├── Step 4: Review & submit
  │
  └── POST /api/marketplace/applications
        │
        ├── Validate fields (loanAmount, requestedTerm, procedureType)
        │
        ├── ── SHIELD GATE 2 ───────────────────────────────────
        │   patientGateService.assessApplication({
        │     patient_id, procedure_type, procedure_description,
        │     quoted_amount, medical_aid_covered,
        │     loan_amount_requested, loan_term_months,
        │     urgency_classification, monthly_income_verified,
        │     monthly_obligations, income_verification: 'manual_verified',
        │     segment: gap_financing | full_procedure
        │   })
        │   │
        │   ├── DECLINE (red) ─────────────────────────────────
        │   │   return { success:false, shield_declined:true, shield }
        │   │   │
        │   │   └── Frontend: showShieldDecline(shield)
        │   │         ├── Decline card with rationale bullets
        │   │         ├── Alternative loan suggestion (if available)
        │   │         └── "Adjust amount/term" + "Back to dashboard"
        │   │
        │   └── APPROVE / REFER_TO_HUMAN (green/amber) ────────
        │       Proceed to marketplace logic
        │ ───────────────────────────────────────────────────────
        │
        ├── Check for active lenders
        │   └── No lenders → preview response (with Shield assessment attached)
        │
        └── Active lenders → LoanApprovalBridge → lender matching
```

---

## Shield Framework Overview

```
PaySick Shield — 5-Gate Underwriting Framework
│
├── Gate 1: Provider Gate (providerGateService)
│     Assesses provider trust tier (probation/standard/trusted/preferred),
│     default rate, cost variance from benchmark, and holdback requirements.
│     Called automatically if provider_id is included in Gate 2 input.
│
├── Gate 2: Patient Gate (patientGateService) ← NOW ACTIVE in marketplace flow
│     Core affordability engine. Hard rules:
│       • Income ≥ R4,000 (ethical safeguard — absolute, no override)
│       • RTI ≤ 20% (repayment-to-income — absolute ceiling)
│       • DTI ≤ 55% post-loan (for full-procedure financing)
│     Amber thresholds (trigger human review):
│       • RTI > 15%
│       • DTI > 45% post-loan
│     Borrower classification:
│       • convenience — elective procedures, low DTI, medical aid, planned ahead
│       • planned_necessity — scheduled necessary care
│       • urgent_necessity — emergency care, income instability (tighter controls)
│     Output: APPROVE | APPROVE_WITH_CONDITIONS | REFER_TO_HUMAN | DECLINE
│
├── Gate 3: Lender Gate (lenderGateService)
│     Matches approved loans to lenders, manages concentration limits,
│     and tracks portfolio allocation.
│
├── Gate 4: Outcome Gate (outcomeGateService)
│     Post-disbursement monitoring: day-3, day-30, day-90 surveys,
│     arrears detection, and restructuring proposals.
│
└── Gate 5: Circuit Breakers (circuitBreakerService)
      10 automated portfolio monitors (5 amber, 5 red):
        Amber: arrears > 4.5%, balance sheet > 35%, provider cluster > 4%,
               segment drift < 55% convenience, reserve fund < 18%
        Red:   arrears > 6%, balance sheet > 40%, single-provider default > 8%,
               reserve < 15%, monthly losses > 3%
```

---

## Shield API Endpoints (/v2/shield/)

All endpoints require authentication. Admin endpoints require `requireAdmin`.

```
Provider Gate:  POST /provider-gate/assess
                GET  /provider-gate/tier-check/:providerId
                POST /provider-gate/tier-upgrade  (admin)
                POST /provider-gate/cost-benchmark
                GET  /provider-gate/providers  (admin)
                GET  /provider-gate/score-history/:providerId  (admin)

Patient Gate:   POST /patient-gate/assess

Lender Gate:    POST /lender-gate/match  (admin)
                GET  /lender-gate/allocation  (admin)

Outcome Gate:   POST /outcome/survey
                GET  /outcome/surveys/pending  (admin)
                GET  /outcome/arrears  (admin)
                POST /outcome/restructure/:loanId  (admin)

Circuit Breakers: GET  /circuit-breakers/status  (admin)
                  POST /circuit-breakers/evaluate  (admin)
                  POST /circuit-breakers/override  (admin)
                  POST /circuit-breakers/resolve  (admin)

Dashboard:      GET  /dashboard/portfolio  (admin)
                GET  /dashboard/providers  (admin)

Health Line:    GET  /health-line/eligibility/:patientId
                POST /health-line/activate  (admin)
                POST /health-line/draw
                GET  /health-line/account/:patientId

Human Review:   GET  /human-review/queue  (admin)
                GET  /human-review/detail/:assessmentId  (admin)
                POST /human-review/decide  (admin)
                GET  /human-review/audit/:entityType/:entityId  (admin)
                GET  /human-review/overrides  (admin)
                GET  /human-review/stats  (admin)
```

---

## Frontend Pages (v1.3.6)

*(Unchanged from v1.3.5)*

| Page | Route | Auth Required |
|------|-------|---------------|
| index.html | / | No |
| about.html | /about | No |
| contact.html | /contact | No |
| demo-login.html | /demo-login | No (password-gated) |
| login.html | /login | No |
| register.html | /register | No |
| onboarding.html | /onboarding | Yes (user) |
| dashboard.html | /dashboard | Yes (user) |
| marketplace-apply.html | /marketplace-apply | Yes (user) |
| marketplace-offers.html | /marketplace-offers | Yes (user) |
| providers.html | /providers | No |
| provider-apply.html | /provider-apply | No |
| admin-dashboard.html | /admin-dashboard | Yes (admin) |
| privacy-policy.html | /privacy-policy | No |
| terms-of-service.html | /terms-of-service | No |

---

## Changes from v1.3.5

- `marketplace-apply.html`: Added `monthlyObligations`, `medicalAidCovered`, `urgencyClassification` fields to Step 3; added `showShieldDecline()` and `applyWithAlternative()` for decline UX; `buildDemoResponse()` now includes simulated Shield assessment
- `backend/src/routes/marketplace.js`: Imported `patientGateService`; POST `/applications` now runs Shield Gate 2 and returns `shield_declined` response on DECLINE
