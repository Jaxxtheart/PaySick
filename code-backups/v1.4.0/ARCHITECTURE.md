# Architecture — PaySick v1.4.0

**Version**: 1.4.0
**Date**: 2026-03-16

---

## System Overview

*(Unchanged from v1.3.6)*

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

## Fee Model (NEW in v1.4.0)

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

## Payment Flow with Late Fees (v1.4.0)

```
Patient schedules payment plan (3 instalments at 0% interest)
│
├── Instalment paid ON TIME
│     POST /api/payments/:id/pay
│       ├── daysOverdue = 0
│       ├── calculateLateFee(amount, 0) → late_fee = 0
│       ├── payments.late_fee = 0
│       └── transactions: { type: 'manual_payment', amount }
│
└── Instalment paid LATE (past due_date)
      POST /api/payments/:id/pay
        ├── daysOverdue = CURRENT_DATE - due_date
        ├── months_late = floor(daysOverdue / 30)
        ├── calculateLateFee(amount, daysOverdue)
        │     → late_fee_amount = amount × ((1.05)^months_late − 1)
        │     → total_due = amount + late_fee_amount
        ├── payments.late_fee = late_fee_amount (updated)
        ├── transactions: { type: 'manual_payment', amount }
        └── transactions: { type: 'fee', amount: late_fee_amount,
                            description: "Late payment fee — N month(s) overdue (5% per month)" }

Nightly cron → POST /api/payments/admin/process-overdue
  Bulk-marks all payments past due_date as 'overdue'
  and updates late_fee for each based on current days_overdue.

Fee preview → GET /api/payments/:id/fee-preview
  Returns { months_late, late_fee_amount, total_due, interest_rate: 0 }
```

---

## Provider Settlement Flow (v1.4.0)

```
Admin creates settlement → POST /api/providers/admin/:id/settle
  ├── Input: { period_start, period_end, application_ids[] }
  ├── Fetch approved applications for this provider
  ├── Sum gross_amount = Σ bill_amount
  ├── calculateProviderSettlement(grossAmount)
  │     → service_fee_amount = gross × 0.05
  │     → net_amount = gross × 0.95
  ├── INSERT INTO settlements (gross, commission_amount=fee, net_amount)
  ├── For each application:
  │     itemFee = calculateProviderSettlement(bill_amount)
  │     INSERT INTO settlement_items
  │       (commission_rate=5.00, commission_amount=itemFee.service_fee, net_amount)
  └── Response: { gross, service_fee_amount, net_amount, service_fee_pct: 5 }

Admin views settlements → GET /api/providers/admin/:id/settlements
  Returns all settlements with service_fee_pct: 5 in response.
```

---

## Patient Application Flow with Shield (v1.3.6+, unchanged)

*(Unchanged from v1.3.6)*

---

## Shield Framework Overview

*(Unchanged from v1.3.6)*

```
PaySick Shield — 5-Gate Underwriting Framework
│
├── Gate 1: Provider Gate (providerGateService)
│     Assesses provider trust tier (probation/standard/trusted/preferred),
│     default rate, cost variance from benchmark, and holdback requirements.
│     Called automatically if provider_id is included in Gate 2 input.
│
├── Gate 2: Patient Gate (patientGateService)
│     Core affordability engine (now active in marketplace flow).
│
├── Gate 3: Lender Gate (lenderGateService)
│
├── Gate 4: Outcome Gate (outcomeGateService)
│
└── Gate 5: Circuit Breakers (circuitBreakerService)
```

---

## API Endpoints Summary (v1.4.0 additions)

```
Payments:
  POST /api/payments/:id/pay           ← now applies 5% late fee if overdue
  GET  /api/payments/:id/fee-preview   ← NEW: returns late fee preview
  POST /api/payments/admin/process-overdue  ← NEW: bulk overdue + late fee update (admin)

Providers:
  GET  /api/providers/admin/:id/settlements  ← NEW: list provider settlements
  POST /api/providers/admin/:id/settle       ← NEW: create settlement with 5% fee
```

---

## Fee Service Module (NEW)

```
backend/src/services/fee.service.js
│
├── Exports:
│   ├── PROVIDER_SERVICE_FEE_PCT        (0.05)
│   ├── PATIENT_LATE_FEE_PCT_PER_MONTH  (0.05)
│   ├── PATIENT_BASE_INTEREST_RATE      (0.00)
│   ├── calculateLateFee(amount, daysOverdue) → { months_late, late_fee_amount, total_due }
│   └── calculateProviderSettlement(grossAmount) → { gross, service_fee_amount, net_amount, service_fee_pct }
│
└── Imported by:
    ├── backend/src/routes/payments.js
    └── backend/src/routes/providers.js
```

---

## Frontend Pages (v1.4.0)

| Page | Change |
|------|--------|
| `provider-apply.html` | Added "How You Get Paid" section: tier table + 5% fee disclosure box + updated consent checkbox |
| `payments.html` | Added fee policy banner (0% interest, 5% late fee) + overdue card late fee display + history late fee line |
| All other pages | Unchanged from v1.3.6 |
