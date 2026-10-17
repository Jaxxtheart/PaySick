# Architecture — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-10-17

---

## Changes from v1.11.0

New backend module `backend/src/shield/` becomes the single underwriting
engine for both decision channels. Migration `012`. No frontend changes.

```
 POST /api/marketplace/applications          POST /api/v1/decisions/:id
   [decisionLimiter 10/15min]                  [decisionLimiter 10/15min]
              │                                          │
              └──────────────┬───────────────────────────┘
                             ▼
              shield.buildUnderwritingInput()   ── DB: users, patient_income_verification,
                             │                       providers, provider_scoring_snapshot,
                             │                       portfolio_metrics, payments, procedure_benchmarks
                             │                  ── adapters (mock → isMock): bureau, Home Affairs,
                             │                       SAFPS, AVS, scheme benefit
                             │                  failures → null blocks (never zeros)
                             ▼
              shield.underwrite(input, { now })   — pure, deterministic
   ┌──────────────┬──────────┬──────────┬─────────┬──────────┬───────────────┬────────────────────┐
   │ APPLICATION  │PORTFOLIO │ KNOCKOUT │ SEGMENT │ PROVIDER │ AFFORDABILITY │ MEDICAL RISK SCORE │
   │ amount/term  │breakers  │ bureau,  │ gap off │ verify,  │ income, norm, │ registry → features│
   │              │          │ identity │ (Ph. 2) │ tiers,   │ obligations,  │ → PD, score, grade │
   │              │          │ SAFPS,AVS│         │ conc.,   │ DI, RTI, DTI  │ → expected loss    │
   │              │          │          │         │ payout   │               │                    │
   └──────────────┴──────────┴──────────┴─────────┴────┬─────┴───────┬───────┴─────────▲──────────┘
                                                       │ provider    │ capacity        │
                                                       │ grade ──────┼─────────────────┤
                                                       │             └─ measures ──────┘
                             ▼
     decision = most severe stage   DECLINED > REFER > APPROVED(_COOLING_OFF)
                             ▼
     buildDecisionRecord() → recordDecision() → shield_decisions (append-only)
                             ▼
     APPROVED → marketplace / status APPROVED      REFER → human review (MANUAL_REVIEW)
     DECLINED → declined (+ affordable alternative)
```

### Medical Risk Score lifecycle

```
 shield_decisions (features)  +  shield_performance_events (90+ DPD in 12m)
              │
   EXPERT_PRIOR ──≥100 bads──▶ INTERCEPT_RECALIBRATION ──≥300 bads──▶ CHALLENGER_TRAINABLE
                                                                         │ shadow scoring
                                                                         ▼
                                       canPromote(): validation, Gini, PSI, fairness ──▶ CHAMPION
```

### Retired from the live decision path
- `services/shield-gates.service.js` (v1) — not wired; retained with tests
- `services/patient-gate.service.js` on the marketplace path — still serves `/v2/shield`
- `services/healthcare-risk.service.js` — still serves `/api/risk` and `/api/applications`; prohibited signals neutralised
