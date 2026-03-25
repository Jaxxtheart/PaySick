# Architecture — PaySick v1.4.1

**Version**: 1.4.1
**Date**: 2026-03-24

---

## System Overview

*(Unchanged from v1.4.0)*

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

## Footer Layout (UPDATED in v1.4.1)

```
Footer columns (all pages):
  BEFORE v1.4.1:  [ Logo/tagline ] [ Product ] [ Company ] [ Legal ]
  FROM v1.4.1:    [ Logo/tagline ] [ Product ] [ Legal ]

Company column removed (About Us, Careers, Press, Contact) — pending content.
CSS grid uses repeat(auto-fit, minmax(200px, 1fr)) — reflows automatically.
```

---

## Login Page Mobile Layout (UPDATED in v1.4.1)

```
login.html responsive breakpoints:

  Default (desktop):
    body: padding 20px, centered (align-items: center)
    .login-container: max-width 440px, padding 48px, border-radius 16px
    inputs/selects: padding 14px 16px, font-size 15px
    logo SVG: 64px

  @media (max-width: 768px) — tablets and large phones:
    body: padding 16px, top-aligned (align-items: flex-start), padding-top 32px
    .login-container: padding 32px 24px, border-radius 12px
    inputs/selects: font-size 16px (prevents iOS zoom)
    logo SVG: 52px, logo text: 26px

  @media (max-width: 480px) — small phones:
    body: padding 12px horizontal, padding-top 24px
    .login-container: padding 28px 18px
    logo: margin-bottom 24px, gap 12px
    logo SVG: 44px, logo text: 24px
```

---

## Fee Model

*(Unchanged from v1.4.0)*

```
fee.service.js — Central fee configuration
│
├── PROVIDER_SERVICE_FEE_PCT = 0.05 (5%)
│     Applied to every provider settlement payout.
│     gross_amount × 0.95 = net_amount paid to provider.
│
├── PATIENT_LATE_FEE_PCT_PER_MONTH = 0.05 (5%)
│     Applied when a scheduled patient payment is overdue.
│     Charged per FULL calendar month (floor(days_overdue / 30)).
│     Compounds monthly: total_due = amount × (1.05)^months_late
│
└── PATIENT_BASE_INTEREST_RATE = 0.00 (zero)
      On-time patients pay exactly bill_amount ÷ 3 per instalment.
      No interest, no hidden fees.
```

---

## Payment Flow with Late Fees

*(Unchanged from v1.4.0)*

---

## Provider Settlement Flow

*(Unchanged from v1.4.0)*

---

## Patient Application Flow with Shield

*(Unchanged from v1.3.6)*

---

## Shield Framework Overview

*(Unchanged from v1.3.6)*

---

## API Endpoints Summary

*(Unchanged from v1.4.0 — no new or modified endpoints in v1.4.1)*

---

## Frontend Pages (v1.4.1)

| Page | Change |
|------|--------|
| `index.html` | Removed Company footer section |
| `login.html` | Removed Company footer section; added mobile CSS breakpoints (768px, 480px) |
| `onboarding.html` | Removed Company footer section |
| `provider-apply.html` | Removed Company footer section |
| `providers.html` | Removed Company footer section |
| All other pages | Unchanged from v1.4.0 |
