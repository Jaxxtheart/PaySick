# Release Notes — v1.10.0
**Release Date**: 2026-09-16
**Version Type**: MINOR — new API module

## Summary

Ships the **PaySick Recovery Engine**: the automated collections capability
designed so a partner medical provider never has to build, staff, or operate
a collections desk of its own. Consolidates the case-lifecycle decision
(stage, human-review gate, self-cure eligibility) behind one authoritative
service that composes the existing `collections-messaging.service.js`
cadence, and adds the case-lifecycle mechanics that service never had:
promise-to-pay tracking, restructure offers (sharing the existing 25%
cost-increase cap), credit bureau reporting, and a proportionality-gated
external referral path for the rare case that needs one. Providers get a
single new read-only, aggregate-only dashboard endpoint — no case list, no
action items.

This release implements the design captured in the "PaySick Recovery Engine"
capability document and flow diagram produced earlier in this engagement.

## New Features

- **`recovery-engine.service.js`** — `RecoveryEngineService`, the single
  authoritative case state machine. `getCaseView(daysOverdue)` resolves
  stage (`active` → `pre_collections` → `collections_early` →
  `collections_mid` → `collections_late` → `resolution`), the mandatory
  Human Review & Compliance gate (from day 30), self-cure eligibility, and
  the message channels due, by composing the existing
  `CollectionsMessagingService`. `resolveOutcome(...)` resolves a case to
  exactly one of `cured`, `restructured`, `write_off`, or `open`; write-off
  always requires both the day-91+ resolution threshold and an explicit
  human approval.
- **`promise-to-pay.service.js`** — self-service promise capture
  (`createPromise`) and kept/broken evaluation (`evaluatePromise`) for the
  Early/Mid Collections self-service portal. Cents-only integer money,
  rejects promises exceeding the outstanding balance or dated in the past.
- **`restructure-offer.service.js`** — `buildRestructureOffer(...)` spreads
  a remaining balance across a new term and enforces the same 25%
  cost-increase cap `OutcomeGateService` already enforces post-disbursement.
- **`backend/src/utils/restructure-policy.js`** — extracts
  `MAX_RESTRUCTURE_COST_INCREASE` (0.25) out of `outcome-gate.service.js`
  into a small, dependency-free shared constant, so both the post-
  disbursement outcome monitor and the new collections restructure offer
  enforce one rule from one place, without a pure-arithmetic module having
  to pull in a live database connection to read a constant.
- **`bureau-reporting.service.js`** + **`adapters/credit-bureau.adapter.js`**
  (mock) — reports arrears to an NCR-registered credit bureau once a case
  reaches 30+ days overdue. For a book with a ≤R850 average facility, this
  is the strongest available recovery lever; litigation rarely clears its
  own cost at this ticket size.
- **`external-referral.service.js`** + **`adapters/debt-collector.adapter.js`**
  (mock) — the rare, most expensive lever. `isEligibleForReferral(...)`
  enforces a proportionality rule: never automatic, always requires human
  approval, only once a case is 90+ days overdue, and only above a R500
  outstanding-balance floor (below which an external partner's fee would
  exceed the recoverable amount). Partner type is restricted to
  `registered_debt_collector` or `attorney` (Debt Collectors Act 114 of
  1998).
- **`GET /api/providers/dashboard/collections-summary`** (new route,
  `backend/src/routes/providers.js`) — `authenticateToken` +
  `requireRole('provider')`, same pattern as the existing
  `/dashboard/*` routes. Returns `overdue_payments_count`,
  `open_collections_cases`, `cured_count`, `cure_rate_pct`, and an explicit
  `note` stating this is aggregate-only. No patient name, ID number, cell
  number, or per-patient balance is ever returned — the provider has
  nothing to action.
- **Migration `010_recovery_engine.sql`** — extends the existing
  `collections` table with `gate_required`, `human_reviewed_at`,
  `human_reviewed_by`; adds `promise_to_pay`, `restructure_offers`,
  `bureau_reports`, and `external_referrals`, all referencing
  `collections(collection_id)`. Deliberately does *not* introduce a
  parallel case table — the existing `collections` table already is the
  case record.

## Bug Fixes

None.

## Removed / Deprecated

None. All existing collections logic (`collections-messaging.service.js`,
`outcome-gate.service.js`, the `collections` table) is unchanged and still
in active use — this release composes it, not replaces it.

## Breaking Changes

None. `outcome-gate.service.js` now imports `MAX_RESTRUCTURE_COST_INCREASE`
from the new `utils/restructure-policy.js` instead of defining it inline;
the exported value and every existing call site are unchanged.

## Migration Notes

- Run `010_recovery_engine.sql` after `009_v1_api_surface.sql`.
- No data backfill required — new tables start empty; `gate_required`,
  `human_reviewed_at`, `human_reviewed_by` default to unset on existing
  `collections` rows.

## Test-First Workflow (CLAUDE.md)

Six new test files were written and confirmed **failing** (module not
found) before any implementation code existed:
`tests/unit/recovery-engine.test.js`,
`tests/unit/promise-to-pay.test.js`,
`tests/unit/restructure-offer.test.js`,
`tests/unit/bureau-reporting.test.js`,
`tests/unit/external-referral.test.js`,
`tests/unit/provider-collections-summary.test.js`.

56 new assertions now pass (51 pure-logic + 5 route-registration/contract).
Full suite: 666 tests, 665 passing. The one failure
(`tests/unit/email-service.test.js`) is pre-existing and unrelated — it
requires `nodemailer`, which cannot resolve in a sandbox with no
`npm install` access to `registry.npmjs.org` (documented already in
v1.9.0/ARCHITECTURE.md's environmental note; confirmed unrelated to this
release by `git status`, which shows that file untouched).

The provider route test could not exercise the live Express router in
this sandbox either, for the same reason (`require('express')` itself
cannot resolve without `node_modules`) — it instead verifies route
registration, middleware order, and the response contract by parsing
`providers.js` directly, a stricter check than the existing
`provider-dashboard.test.js` convention it otherwise follows.

## Bot Crawling Prevention Review (CLAUDE.md — required at every MINOR/MAJOR bump)

The new route inherits every existing protection automatically — no route-
level changes were needed:
- `X-Robots-Tag` — applied globally in `server.js` ahead of all routes.
- Rate limiting — covered by the global `/api/` limiter (100/15min);
  read-only and low-traffic, so it does not warrant its own stricter
  bucket the way `/api/v1` does.
- Bot fingerprinting / honeypot — `botBlocker` and honeypot middleware
  apply globally.
- Authentication — `authenticateToken` + `requireRole('provider')` gate
  every field this endpoint returns; nothing is reachable unauthenticated.
- No source maps — unaffected (backend-only change).

Blocklist and rate-limit thresholds were reviewed as part of this MINOR
bump; no changes were needed (the v1.9.0 review already covers `/api/`).
