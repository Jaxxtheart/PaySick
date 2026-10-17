# Release Notes — v1.12.0

**Release Date**: 2026-10-17
**Version Type**: MINOR — new module (Shield Underwriting Module) plus fail-open fixes

## Summary

An actuarial underwriting review of the Shield framework found that the policy
design was sound but the code enforced much less than the investor deck
claimed: three parallel engines with different thresholds, gates that failed
open on missing tables, self-declared income treated as verified, no bureau
pull or knock-outs, and a "Medical Risk Score" built on `Math.random()`, scheme
brand and chronic-medication data.

v1.12.0 replaces all of that with one module, `backend/src/shield/`: one
versioned credit policy, one deterministic engine, three clearly separated
outcomes (patient affordability, provider risk management, Medical Risk Score
PD), an immutable decision log and a governed model lifecycle that turns the
Medical Risk Score into trainable proprietary IP from day one.

Everything was built test-first per CLAUDE.md. New-module tests were written
and confirmed failing before implementation. The five route/service bugs were
reproduced by failing tests (`tests/unit/shield-route-integration.test.js`)
and fixed by subagents, one per disjoint file set, until those tests passed.

## Added

- **`backend/src/shield/`** — the Shield Underwriting Module (see its README.md)
  - `policy.js` — single versioned credit policy (`SHIELD-POL-2026.10.0`), NCA expense-norm table, `derivePolicy()` that forces a new version string
  - `knockouts.js` — debt review, sequestration, judgments, adverse listings, severe arrears, SAFPS, Home Affairs identity, enquiry velocity, AVS
  - `affordability.js` — NCA-style assessment: 3-month verified income, highest-of obligations, expense norm, discretionary income, RTI on net, DTI on gross (all segments)
  - `provider-risk.js` — verification, tiers, ramp-up-aware concentration, credible-sample performance breakers, first-instalment collusion signal, tariff control, 80/20 two-sided-confirmation payout plan
  - `medical-risk-score/` — feature registry (DECISIONING / SHADOW / PROHIBITED), model registry with expert-prior champion `MRS-EXPERT-0.1.0`, PD / lifetime PD / score / grade / adverse reasons / expected loss, challenger scoring, readiness and promotion gates, intercept recalibration
  - `engine.js` — orchestrator; every stage always runs; most-severe-wins precedence; explicit `outcomeMap`
  - `decision-record.js` — canonical SHA-256 hashing, decision records, exact replay
  - `context-builder.js` — DB + adapter assembly that never substitutes zeros for missing data
  - `persistence.js`, `procedure-catalogue.js`, `terms.js`, `provenance.js`
- **Adapters (mock, `source.isMock = true`)**: `credit-bureau.adapter.fetchConsumerReport`, `identity-verification.adapter.js` (Home Affairs, SAFPS, AVS), `scheme-benefit.adapter.js`
- **Migration `012_shield_underwriting_module.sql`**: `patient_income_verification`, `portfolio_metrics` (both previously queried but never created), provider verification + scoring columns, append-only `shield_decisions` (trigger-guarded), `shield_performance_events`, `shield_model_registry`
- **Decision rate limiter**: 10 underwriting POSTs / 15 min / IP on `/api/marketplace/applications` and `/api/v1/decisions`
- **Bot blocklist**: Perplexity-User, MistralAI-User, Meta-ExternalFetcher
- 10 new test files, 167 new tests (692 → 859 unit tests); route harness `tests/unit/helpers/route-harness.js`

## Fixed

- **Marketplace gate skipped without income** — `POST /api/marketplace/applications` ran Shield only `if (monthlyIncome)`, swallowed errors and let REFER through to funding partners. Now always underwritten; only APPROVED reaches funding partners; errors fail closed to review.
- **v1 decisions failed open** — `POST /api/v1/decisions/:id` COALESCEd failed queries to 0, so concentration, provider and portfolio breakers always passed; it also used a scheme-rate multiple as coverage. Now uses the module; decision recorded before status change.
- **Legacy patient gate** exempted gap financing from the 55% DTI ceiling.
- **Legacy healthcare risk score** used `Math.random()`, scheme brand, chronic medication, time of day and device type.
- **Legacy `/api/applications`** defaulted missing income to R15,000 and could approve and create a payment plan.

## Behaviour changes to note

- Terms above 36 months are declined by policy (`APPLICATION_TERM_OUT_OF_POLICY`); the marketplace route still accepts 3–60.
- Gap financing (Segment 1) is disabled in policy until Phase 2.
- With mock data sources, production decisions REFER until live bureau, identity, SAFPS, AVS and scheme integrations replace the adapters.

## Removed

- No files deleted. `services/shield-gates.service.js` is no longer wired to a route (its unit tests remain).

## Test results

`node --test tests/unit/*.test.js`: 859 tests, 857 pass. The 2 failures (`email-service.test.js`, `marketplace-lender-gate.test.js`) are pre-existing: the sandbox cannot install `nodemailer`/`pg`.
