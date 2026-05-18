# Architecture — v1.8.0

## High-level data flow

```
                   ┌──────────────────────────────────────────┐
                   │  Patient / Provider / Partner client     │
                   └────────────────┬─────────────────────────┘
                                    │ HTTPS + Bearer
                                    ▼
              ┌──────────────────────────────────────────────────┐
              │  Express app (backend/src/server.js)             │
              │   Helmet | CORS | rate limit | X-Robots-Tag      │
              └────────────────┬─────────────────────────────────┘
                                    │ authenticateToken
   ┌────────────────────────────────┼──────────────────────────────────────┐
   │ Existing surfaces (unchanged)  │                                      │
   │   /api/applications            │   NEW: /api/v1 facilitation surface  │
   │   /v2/shield/*                 │     POST   /applications             │
   │   /api/v1/underwriting/*       │     POST   /decisions/:id            │
   │   /api/v1/payouts/* (admin)    │     POST   /payouts/:id              │
   │                                │     GET    /schedules/:id            │
   └────────────────────────────────┴──────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────────────┐
              │ services/                                          │
              │   shield-gates.service     ← pure 5-gate engine    │
              │   schedule.service         ← pure schedule builder │
              │   provider-scoring.service ← tier + status logic   │
              │   webhook-dispatcher.service                       │
              └─────────────────────┬──────────────────────────────┘
                                    │
              ┌─────────────────────┴──────────────────────────────┐
              │ adapters/  (mock + production swap point)          │
              │   income-verification (Stitch / Gathr)             │
              │   dsp-check          (scheme DSP registry)         │
              │   debicheck          (debit-order rails)           │
              └─────────────────────┬──────────────────────────────┘
                                    │ pg
                                    ▼
                       ┌────────────────────────┐
                       │ Postgres               │
                       │  v1_applications       │
                       │  v1_payouts            │
                       │  v1_instalment_schedules
                       │  v1_instalments        │
                       │  provider_holdback_ledger
                       │  webhook_events        │
                       │  provider_scoring_snapshot
                       │  (+ all legacy tables) │
                       └────────────────────────┘
```

## Shield Framework — gate execution order

```
  ┌───────────────────────────────────────────────────────────────────┐
  │ POST /api/v1/decisions/:applicationId                             │
  └─────────────────────────────────────┬─────────────────────────────┘
                                        │
                                        ▼
         ┌────────────────────────────────────────────────────────┐
         │ Build in-memory context (single function, no DB inside) │
         │   - application snapshot                                │
         │   - provider snapshot (scoring + concentration)         │
         │   - patient income verification                         │
         │   - portfolio metrics                                   │
         │   - segment1: benchmark + DSP                           │
         └────────────────────────────────┬───────────────────────┘
                                          ▼
                ┌─── Pure runShieldDecision(ctx) ────┐
                │                                    │
                │ Pre-check: Gate 5 hard stops       │
                │   (provider PD > 8%, BS > 40%)     │
                │             │                       │
                │             ▼  DECLINED?  → return  │
                │ Gate 1   provider concentration     │
                │             │                       │
                │             ▼  DECLINED?  → return  │
                │ Gate 3   urgency / cooling-off      │
                │             │                       │
                │             ▼                       │
                │ Gate 2   affordability (with        │
                │            tightened ceiling)        │
                │             │                       │
                │             ▼  DECLINED?  → return  │
                │ Gate 4   tariff (Segment 1)         │
                │             │                       │
                │             ▼  MANUAL_REVIEW? → return
                │                                    │
                │ Final assembly:                    │
                │   APPROVED | COOLING_OFF           │
                └────────────────────────────────────┘
                                          │
                                          ▼
              UPDATE v1_applications + fire webhooks
```

## Payout state machine

```
  SUBMITTED ──► (decisions) ──► APPROVED ──► (payouts stage=PROVISIONAL) ──► DISBURSED
                    │                                            │
                    ├──► DECLINED                                 │
                    ├──► MANUAL_REVIEW                            │
                    └──► COOLING_OFF ─── 48h ─── ► APPROVED       │
                                                                  ▼
                                                  Segment 1 only:
                                                  (payouts stage=FINAL, body.schemeActualPayment)
                                                                  │
                                                                  ▼
                                                          FINAL payout record
                                                          + invoice.exceeded_ceiling
                                                            (if applicable)
```

## Money invariant

All monetary values are stored, computed, and compared as **integer cents**.
Floats only appear at I/O boundaries (parsing rand input, formatting display).
This is enforced by `backend/src/utils/money.js` and by `BIGINT` columns on
all `*_cents` fields in migration `008_v1_api_surface.sql`.

## Terminology invariant

No string surfaced by the API may contain `loan`, `lend`, `borrower`,
`default`, `interest`, or `credit agreement`. Validated by the terminology
compliance tests in `tests/unit/v1-shield-gates.test.js`.
