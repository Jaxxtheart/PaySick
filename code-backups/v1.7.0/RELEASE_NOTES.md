# Release Notes — v1.7.0

**Release Date**: 2026-04-10
**Type**: MINOR — New feature set: Shield Framework v5.0 Segment 1 Tariff Billing Risk Controls
**Branch**: `claude/shield-framework-v5-controls-S40Y1`

---

## Summary

Implements the five Segment 1 tariff billing risk controls defined in Shield Framework Version 5.0. These controls govern the complete lifecycle of a tariff gap facilitation from DSP status check through to post-procedure EOB reconciliation and final payout.

---

## Added

### Backend — Database Migration

- `backend/src/migrations/007_shield_v5_controls.sql` — New tables:
  - `system_config` — platform configuration key-value store with default payout percentages
  - `dsp_registry` — Designated Service Provider (DSP) registry cache
  - `procedure_benchmarks` — procedure cost benchmarks by code and metro region
  - `facilitation_ceiling_calculations` — audit trail for ceiling calculation decisions
  - `provider_billing_agreements` — provider billing agreement contracts
  - `tariff_disclosures` — patient tariff gap disclosure records with acknowledgement tracking
  - `provider_bank_accounts` — provider bank account details for payouts
  - `payout_stages` — PROVISIONAL and FINAL payout stage records
  - `eob_submissions` — Explanation of Benefits submission records
  - `manual_review_queue` — underwriting manual review queue
  - `underwriting_audit_log` — Shield v5.0 underwriting decision audit trail
  - `notification_log` — outbound notification log
  - `portfolio_circuit_breaker_log` — portfolio circuit breaker event log
  - `messaging_queue` — messaging queue (if not exists)
- Column additions to `applications` table: `segment`, `dsp_verified_at`, `dsp_status`, `dsp_verification_source`, `conservative_gap_applied`, `dsp_check_scheme_code`, `dsp_check_plan_code`, `facilitation_ceiling`, `provider_submitted_amount`, `on_manual_hold`, `hold_reason`, `tariff_disclosure_id`, `disclosure_acknowledged`, `provisional_payout_id`, `final_payout_id`, `eob_submission_id`, `payout_model`, `provider_hpcsa_number`, `above_30pct_threshold`, `procedure_date`
- Column additions to `providers` table: `gap_financing_enabled`, `billing_agreement_id`, `billing_agreement_checked_at`, `hpcsa_number`

### Backend — Underwriting Service

- `backend/src/services/underwriting.service.js` — Shield v5.0 underwriting service implementing:
  - `dspCheck()` — Control 1: DSP status verification against DSP registry
  - `calculateCeiling()` — Control 2: Tariff-anchored facilitation ceiling calculation
  - `checkBillingAgreement()` — Control 3: Provider billing agreement gate
  - `createDisclosure()` / `acknowledgeDisclosure()` / `checkDisclosureGate()` — Control 4: Tariff disclosure screen
  - `triggerProvisionalPayout()` / `submitEob()` / `reconcileEob()` — Control 5: Post-procedure EOB reconciliation
  - Shared: `addToManualReviewQueue()`, `logAuditEvent()`, `DISCLOSURE_TEXT` constant

### Backend — API Routes

- `backend/src/routes/underwriting.js` — 17 new API endpoints:
  - `POST /api/v1/underwriting/dsp-check`
  - `POST /api/v1/underwriting/calculate-ceiling`
  - `GET  /api/v1/underwriting/procedure-benchmark`
  - `POST /api/admin/procedure-benchmarks`
  - `GET  /api/v1/providers/:providerId/billing-agreement-status`
  - `POST /api/admin/providers/:providerId/billing-agreement`
  - `POST /api/admin/providers/:providerId/billing-agreement/suspend`
  - `POST /api/admin/providers/:providerId/billing-agreement/reinstate`
  - `POST /api/v1/underwriting/disclosure/create`
  - `POST /api/v1/underwriting/disclosure/:disclosureId/acknowledge`
  - `GET  /api/v1/underwriting/disclosure/gate-check/:applicationId`
  - `POST /api/v1/payouts/trigger-provisional`
  - `POST /api/v1/payouts/submit-eob`
  - `POST /api/v1/payouts/reconcile`
  - `GET  /api/admin/underwriting/review-queue`
  - `POST /api/admin/underwriting/review-queue/:id/resolve`
  - `GET  /api/admin/eob-reconciliation`
  - `GET  /api/admin/benchmarks`

### Backend — Server

- `backend/src/server.js` — registered `underwritingRoutes` at `/api`; added global `X-Robots-Tag` header

### Frontend — Admin Pages

- `admin-review-queue.html` — Manual review queue with priority badges, SLA countdowns, Approve/Reject/Escalate actions
- `admin-billing-agreements.html` — Provider billing agreements: status, suspend/reinstate actions
- `admin-benchmarks.html` — Procedure benchmark CRUD table by code + region + date
- `admin-eob-reconciliation.html` — EOB submissions pending reconciliation: variance display, one-click reconcile
- `admin-circuit-breaker.html` — Segment 1 tariff inflation monitor and active circuit breaker events

### Frontend — Provider and Patient Pages

- `provider-billing-agreement.html` — Provider onboarding: agreement terms, digital signature form
- `tariff-disclosure.html` — Full-screen patient tariff gap disclosure with checkbox confirmation

### Tests

- `tests/integration/shield-v5.test.js` — 25 integration tests covering all five controls (written before implementation per test-first policy)

---

## Security & Compliance

- All new API routes include `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` via router middleware
- Global `X-Robots-Tag` header added to all server responses
- No credit/loan/lend/borrow/interest language used in any user-facing code
- All endpoints require authentication; admin endpoints require admin role
- Patient acknowledgements include IP address, User-Agent, and session ID capture

---

## Business Logic

- **DSP Status**: DSP = standard gap; NON_DSP = 10% upfront increase + disclosure; UNKNOWN = 5% increase + manual review
- **Facilitation Ceiling**: `ceiling = benchmark × (1 - coverage_multiplier)`; multiplier ≥ 1.0 → rejected (full coverage); invoice > 130% of benchmark → manual hold
- **Billing Agreement Gate**: Segment 1 providers must have ACTIVE agreement; Segment 2 bypasses gate
- **Disclosure Gate**: Applications cannot transition to APPROVED without acknowledged disclosure
- **Payout Model**: Provisional = 80% of ceiling; Final = MIN(remaining approved, scheme residual); excess withheld if invoice > ceiling

---

## Breaking Changes

None. All new routes and tables use `IF NOT EXISTS` patterns. No existing routes modified.
