# Architecture — PaySick v1.7.7

**Version**: 1.7.7
**Date**: 2026-04-20

No platform architectural changes in this version. Inherits all architecture from v1.7.6.

---

## Investor Deck Structure

The `investor-deck.html` is a 15-slide interactive HTML presentation. Slide order and count are unchanged from v1.7.6. The following slides have updated content:

```
Slide  1 — Cover                          (unchanged)
Slide  2 — The Universal Problem          (unchanged)
Slide  3 — Market Opportunity             (unchanged)
Slide  4 — Why Now                        (unchanged)
Slide  5 — The Solution                   ← UPDATED: "PaySick Direct Funding" replaces marketplace card
Slide  6 — Product / How It Works         ← UPDATED: timeline + patient benefits reflect direct funding
Slide  7 — Business Model                 ← UPDATED: three-stream revenue model + R8K unit economics
Slide  8 — Shield™ AI Framework           ← UPDATED: "Lender Gate" → "Capital Gate"
Slide  9 — Competitive Advantages / Moats ← UPDATED: table row + network effects text
Slide 10 — Defensibility                  ← UPDATED: "Vertically Integrated Capital" moat
Slide 11 — Shield™ Intelligence Engine    (unchanged)
Slide 12 — Team                           ← UPDATED: "marketplace businesses" removed from description
Slide 13 — Roadmap                        ← UPDATED: Q4 2026 milestone
Slide 14 — Two-Part Capital Structure     ← UPDATED: R20M / R30M total, direct funding description
Slide 15 — Vision & Close                 (unchanged)
```

---

## Capital Structure (v1.7.7)

```
Total Capital Ask: R30M
        │
        ├── Part 1: R20M Balance Sheet Arrangement Capital
        │     • Structure: Revolving facility / senior debt
        │     • Purpose: Fund patient payment arrangements directly from PaySick balance sheet
        │     • Avg arrangement: R8,000 | Term: 3 months | Velocity: ~4× per year
        │     • Dilution: Non-dilutive to equity
        │     • Target investors: DFIs, impact capital, institutional lenders
        │
        └── Part 2: R10M Equity Seed Round
              • Structure: Equity
              • Purpose: Operational run rate (18 months)
                  40% Product & Tech (R4M)
                  30% Go-to-Market (R3M)
                  20% Regulatory & Legal (R2M)
                  10% Operations (R1M)
              • Pre-money: R50M
              • Equity offered: 17%
              • Target investors: Seed VCs, angel investors
```

---

## Revenue Model (v1.7.7)

```
Revenue Streams
        │
        ├── Patient Service Fee (60% of Revenue)
        │     8-10% of arrangement value, charged across 3-month term
        │
        ├── Provider Service Fee (25% of Revenue)
        │     5% on settlement, deducted from disbursement
        │
        └── Late Payment Income (15% of Revenue)
              5%/month on overdue balances
```

---

## Shield Framework Architecture (unchanged from v1.7.0)

```
Patient Application
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SHIELD™ v5.0                                 │
│                                                                 │
│  Control 1: DSP Status Verification                             │
│  Control 2: Tariff-Anchored Facilitation Ceiling                │
│  Control 3: Provider Billing Agreement Gate                     │
│  Control 4: Tariff Disclosure Screen (patient acknowledgement)  │
│  Control 5: Post-Procedure EOB Reconciliation                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐      │
│  │             Four-Gate Assessment                     │      │
│  │  Provider Gate → Patient Gate → Capital Gate →       │      │
│  │  Outcome Gate                                        │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                 │
│  Disbursement: Provisional 80% ──► Final 20% (post-EOB)        │
│  Circuit Breaker: halts on anomaly detection                    │
│  Human Review Queue: escalation path for edge cases            │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
Provider Settlement (within 24 hours)
```

---

## Platform Architecture (unchanged from v1.7.5)

See [v1.7.5/ARCHITECTURE.md](../v1.7.5/ARCHITECTURE.md) for the full platform diagram.
