# Release Notes — v1.8.0

**Date**: 2026-05-18
**Type**: MINOR — New `/api/v1` API surface for PaySick facilitation pipeline.

## Summary

Introduces the **four-endpoint v1 facilitation API** that sits on top of the
existing PaySick scaffolding. The endpoints implement the full Shield Framework
5-gate underwriting decision flow, two-stage provider disbursement, and patient
instalment schedule generation.

Existing endpoints (`/api/applications`, `/v2/shield/*`, `/api/v1/underwriting/*`,
`/api/v1/payouts/*` admin endpoints) are unchanged. The new surface is namespaced
under `/api/v1/{applications,decisions,payouts,schedules}` and uses brand-new
tables (`v1_applications`, `v1_payouts`, `v1_instalment_schedules`,
`v1_instalments`, `provider_holdback_ledger`, `webhook_events`,
`provider_scoring_snapshot`) so it can be rolled out (and back) independently.

## Added

### API endpoints
- `POST /api/v1/applications` — submit a new payment facilitation request
- `POST /api/v1/decisions/:applicationId` — run the 5 Shield gates
- `POST /api/v1/payouts/:applicationId` — provisional / final disbursement
- `GET  /api/v1/schedules/:applicationId` — patient instalment schedule

### Services
- `backend/src/services/shield-gates.service.js` — pure 5-gate engine
- `backend/src/services/schedule.service.js` — pure schedule generator
- `backend/src/services/provider-scoring.service.js` — tier + status logic
  and nightly recalc job
- `backend/src/services/webhook-dispatcher.service.js` — queue-backed event fan-out

### Adapters (with deterministic mocks for development & tests)
- `backend/src/adapters/income-verification.adapter.js` — Stitch / Gathr
- `backend/src/adapters/dsp-check.adapter.js` — scheme DSP registry
- `backend/src/adapters/debicheck.adapter.js` — DebiCheck debit-order rails

### Utilities
- `backend/src/utils/money.js` — cents-only integer arithmetic
  (`toCents`, `toRands`, `formatRands`, `calculateMdr`, `affordabilityRatio`)

### Migration
- `backend/src/migrations/008_v1_api_surface.sql` — 7 new tables + provider
  scoring columns (`tier`, `payout_delay_days`, `holdback_applications_remaining`)

### Webhook events
- `application.{approved,declined,manual_review,cooling_off}`
- `payout.disbursed_{provisional,final}`
- `repayment.{collected,missed}`
- `provider.{throttled,suspended}`
- `invoice.{flagged_above_tariff,exceeded_ceiling}`
- `circuit_breaker.{triggered,reserve_fund_triggered}`
- `holdback.released`

### Tests (54 total, all green)
- `tests/unit/v1-money.test.js`
- `tests/unit/v1-schedule.test.js`
- `tests/unit/v1-shield-gates.test.js`
- `tests/unit/v1-adapters.test.js`
- `tests/unit/v1-provider-scoring.test.js`

Tests use Node's built-in `node:test` runner (no Jest required) and cover:
- All 5 Shield gates (provider, affordability, cooling-off, tariff, circuit breakers)
- Terminology compliance — zero prohibited terms in any decision response
- Schedule generation (last-instalment remainder absorption)
- Provider tier + status calculation
- Adapter interfaces

## Changed

- `backend/src/server.js` — mounts the new v1 router under `/api/v1` and lists
  it in the root endpoint manifest.

## Compliance

- All money handled as integer cents — no floating-point in any monetary path.
- Compliant language enforced: zero occurrences of `loan`, `interest`,
  `borrower`, `default`, `lend`, or `credit agreement` in any API response.
- `X-Robots-Tag: noindex, nofollow, ...` set on every v1 response.
- All endpoints require authentication (`authenticateToken` middleware).
- All v1 tables use BIGINT for monetary values (cents).
