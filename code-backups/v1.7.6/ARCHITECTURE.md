# Architecture — PaySick v1.7.6

**Version**: 1.7.6
**Date**: 2026-04-20

No architectural changes in this version. Inherits all architecture from v1.7.5.

---

## Investor Deck Structure

The `investor-deck.html` is a 15-slide interactive HTML presentation. Slide order and count are unchanged from v1.7.5. The following slides have updated content:

```
Slide  1 — Cover                          (unchanged)
Slide  2 — The Universal Problem          ← UPDATED: universal framing + revised problem bullets
Slide  3 — Market Opportunity             (unchanged)
Slide  4 — Why Now                        (unchanged)
Slide  5 — The Solution                   (unchanged)
Slide  6 — Product / How It Works         (unchanged)
Slide  7 — Business Model                 (unchanged)
Slide  8 — Shield™ AI Framework           ← UPDATED: Shield as primary AI risk IP
Slide  9 — Competitive Advantages / Moats (unchanged)
Slide 10 — Defensibility                  (unchanged)
Slide 11 — Shield™ Intelligence Engine    ← UPDATED: renamed + Shield-framed
Slide 12 — Team                           (unchanged)
Slide 13 — Roadmap                        (unchanged)
Slide 14 — Two-Part Capital Structure     ← UPDATED: two-part funding ask
Slide 15 — Vision & Close                 (unchanged)
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
│  │  Provider Gate → Patient Gate → Lender Gate →        │      │
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

## Funding Structure (v1.7.6)

```
Total Capital Ask: R25M
        │
        ├── Part 1: R15M Institutional Disbursement Facility
        │     • Structure: Revolving facility / senior debt
        │     • Purpose: Patient payment arrangement disbursements
        │     • Turns: ~3× per year
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

## Platform Architecture (unchanged from v1.7.5)

See [v1.7.5/ARCHITECTURE.md](../v1.7.5/ARCHITECTURE.md) for the full platform diagram.
