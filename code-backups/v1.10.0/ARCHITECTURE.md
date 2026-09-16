# Architecture — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-09-16

---

## Changes from v1.9.0

One structural addition: the Recovery Engine, a collections-capability layer
sitting above the existing messaging and outcome services, plus one new
provider-facing read endpoint. No existing request path, gate, or table is
altered in shape — only additive columns and new child tables.

---

## Recovery Engine — service composition

```
backend/src/services/recovery-engine.service.js
   RecoveryEngineService
      getCaseView(daysOverdue)
        │
        ├──▶ collections-messaging.service.js   [EXISTING, unchanged]
        │       CollectionsMessagingService.getStrategyForDaysOverdue()
        │       → { stage, messages, escalate, requiresHuman, description }
        │       FULL_SEQUENCE  → per-message-type channel list
        │
        └──▶ resolves: stage, gate ('human_review' | null),
                        selfCureEligible, channels, description

      resolveOutcome({ daysOverdue, paidInFull, restructureAccepted,
                        humanApprovedWriteOff })
        └──▶ 'cured' | 'restructured' | 'write_off' | 'open'
```

The engine does not replace `CollectionsMessagingService` or
`OutcomeGateService` — both continue to run exactly as they did in v1.9.0.
It composes the former for message/stage resolution and adds what neither
service had: a single `resolution` outcome contract, and the day-91+
terminal-stage boundary.

```
                     days overdue
   0 ────────┬────────┬─────────┬──────────┬──────────┬────▶
             1        8         31         61         91
        active │  pre-   │  early  │   mid    │   late   │ resolution
               │collect. │ (auto)  │ (GATE)   │  (GATE)  │  (GATE)
               └─────────┴─────────┴──────────┴──────────┴──────────
                                        ▲            ▲          ▲
                                        │            │          │
                               Human Review & Compliance gate
                               (mandatory from day 30; see
                               human-review.service.js discipline)
```

---

## New: case-lifecycle services

```
backend/src/services/
   ├── promise-to-pay.service.js
   │      createPromise({caseId, promisedAmountCents, promisedDate,
   │                      outstandingBalanceCents})
   │      evaluatePromise({promise, paidAmountCents, today})
   │        → pending | kept | broken
   │
   ├── restructure-offer.service.js
   │      buildRestructureOffer({originalOutstandingCents,
   │                              remainingBalanceCents, newTermMonths})
   │        → newMonthlyAmountCents, costIncreasePct, withinCap, approvable
   │      imports MAX_RESTRUCTURE_COST_INCREASE from ↓
   │
   ├── bureau-reporting.service.js
   │      isReportable(daysOverdue)         days >= 30
   │      reportIfDue({...})  ──▶ adapters/credit-bureau.adapter.js (mock)
   │
   └── external-referral.service.js
          isEligibleForReferral({daysOverdue, outstandingAmountCents,
                                  humanApproved})
            → requires_human_approval | not_yet_late_stage |
              balance_too_small_to_justify_cost | eligible
          referIfEligible({...})  ──▶ adapters/debt-collector.adapter.js (mock)

backend/src/utils/restructure-policy.js                              [NEW]
   MAX_RESTRUCTURE_COST_INCREASE = 0.25
      │
      ├──▶ services/outcome-gate.service.js     [CHANGED — was inline const]
      └──▶ services/restructure-offer.service.js
```

**Why `restructure-policy.js` exists**: `outcome-gate.service.js` requires
`config/database.js` (a live `pg` connection) at module load time, because
its class methods query the database. Before this release, the 25% cap was
a top-level constant in that same file — reusing it from
`restructure-offer.service.js` would have forced a pure-arithmetic module
to transitively require a database driver just to read a number. Extracting
the constant into a dependency-free utility keeps both call sites on one
shared rule with neither taking on the other's dependency footprint.

```
backend/src/adapters/                                                [NEW]
   ├── credit-bureau.adapter.js    submitArrearsReport(params) → mock
   └── debt-collector.adapter.js   referCase(params) → mock

   (same mock/production-swap-point pattern as the existing
    adapters/debicheck.adapter.js, dsp-check.adapter.js,
    income-verification.adapter.js)
```

---

## New: provider collections summary route

```
backend/src/routes/providers.js
   GET /dashboard/collections-summary
      authenticateToken → requireRole('provider') → resolveProviderId()
      │
      ▼
   SQL aggregate over applications → payment_plans → payments → collections
   (LEFT JOIN; a provider with zero collections history gets zero counts,
    cure_rate_pct: null)
      │
      ▼
   { provider_id, overdue_payments_count, open_collections_cases,
     cured_count, cure_rate_pct, note }
```

Registered in the same `/dashboard/*` block as `overview`, `patients`,
`settlements`, `trust-tier`, and `payment-performance` — before the public
`GET /:id` lookup, for the same reason those routes are: Express would
otherwise read `dashboard` as a `provider_id` path segment.

No new middleware was needed. Every CLAUDE.md bot-crawling protection
(`X-Robots-Tag`, global rate limiting, bot fingerprinting, honeypot) is
already applied ahead of all `/api/*` routes in `server.js`, so this route
inherits them automatically.

---

## New: schema (migration `010_recovery_engine.sql`)

```
collections                                          [EXISTING — extended]
   + gate_required       BOOLEAN
   + human_reviewed_at   TIMESTAMP
   + human_reviewed_by   VARCHAR(100)

promise_to_pay            ──▶ collections(collection_id)      [NEW]
restructure_offers        ──▶ collections(collection_id)      [NEW]
bureau_reports             ──▶ collections(collection_id)      [NEW]
external_referrals         ──▶ collections(collection_id)      [NEW]
```

Deliberately no new parallel "case" table — `collections` (schema.sql, line
357) already is the case record; this release extends it and hangs the new
lifecycle events off it as child tables, the same shape as
`settlements` / `settlement_items`.

---

## Test topology

```
tests/unit/
   ├── recovery-engine.test.js              [NEW] stage/gate/outcome logic
   ├── promise-to-pay.test.js               [NEW] create + evaluate
   ├── restructure-offer.test.js            [NEW] cap enforcement, shared constant
   ├── bureau-reporting.test.js             [NEW] threshold + adapter
   ├── external-referral.test.js            [NEW] proportionality + adapter
   ├── provider-collections-summary.test.js [NEW] route registration + contract
   └── ... (all v1.9.0 suites, unchanged)
```

Runner: `node --test` (`npm test` from `backend/`). Integration suites use Jest.

**Environmental note (unchanged from v1.9.0)**: `tests/unit/email-service.test.js`
cannot resolve `nodemailer` where `registry.npmjs.org` is unreachable, and
fails there regardless of application code. In this same sandbox, no
`node_modules` could be installed at all (`npm install` returned `403` from
the registry), so `provider-collections-summary.test.js` verifies route
registration, middleware, and response contract by parsing
`routes/providers.js` directly rather than requiring Express — every other
new test file (`recovery-engine`, `promise-to-pay`, `restructure-offer`,
`bureau-reporting`, `external-referral`) has zero third-party dependencies
and ran and passed directly.

---

## Platform architecture (unchanged from v1.9.0)

See [v1.9.0/ARCHITECTURE.md](../v1.9.0/ARCHITECTURE.md) for the full request
path, bot-protection layer, and `/api/v1` facilitation surface, which this
release inherits without modification.
