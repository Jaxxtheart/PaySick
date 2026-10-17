# Requirements & Specifications — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-10-17

Carries forward all requirements from v1.11.0 and its predecessors, and adds
the requirements below for the Shield Underwriting Module
(`backend/src/shield/`), built from an actuarial underwriting review of the
Shield framework, the affordability gates and the Medical Risk Score.

---

## New Requirements

### Decision engine (UW)

| ID | Requirement | Priority |
|----|-------------|----------|
| UW-01 | One underwriting engine and one versioned credit policy (`shield/policy.js`) decide every application on every channel (v1 API, marketplace) | Must Have |
| UW-02 | Every decision is deterministic: no clock reads or randomness inside the engine; the evaluation time is an explicit input | Must Have |
| UW-03 | Every stage runs on every application; the decision is the most severe stage result (DECLINED > REFER > APPROVED) | Must Have |
| UW-04 | Missing, stale or mock data yields REFER — never a pass, and never a decline on its own | Must Have |
| UW-05 | Only APPROVED / APPROVED_COOLING_OFF outcomes may reach funding partners; REFER is held for human sign-off | Must Have |
| UW-06 | Mock data sources are refused unless `NODE_ENV !== 'production'` and `SHIELD_ALLOW_MOCK_SOURCES=true` | Must Have |
| UW-07 | Every decision is written to the append-only `shield_decisions` log with input, feature vector, policy and model versions and SHA-256 hashes, before it is acted on | Must Have |
| UW-08 | Any stored decision can be replayed and proven to reproduce its outcome exactly | Must Have |
| UW-09 | Outcomes are reported in three separate sections — patient affordability, provider risk, Medical Risk Score — plus an outcome map stating which inputs feed the PD | Must Have |
| UW-10 | Gap financing (Segment 1) is disabled in policy until Phase 2; the gap amount is invoice − scheme-confirmed benefit, never a rate multiple treated as coverage | Must Have |

### Knock-outs (KO)

| ID | Requirement | Priority |
|----|-------------|----------|
| KO-01 | Hard decline: debt review, sequestration/administration, judgments, adverse listings, 3+ arrears cycles in 12 months, SAFPS match, identity not verified at Home Affairs, deceased | Must Have |
| KO-02 | Refer: enquiry velocity above policy, bureau report older than 30 days, bank account not AVS-verified | Must Have |
| KO-03 | Disbursement requires an authorised DebiCheck mandate | Must Have |

### Patient affordability (PA)

| ID | Requirement | Priority |
|----|-------------|----------|
| PA-01 | Verified income only: ≥3 months of gross and net income, ≤90 days old; self-declared income refers | Must Have |
| PA-02 | Obligations are the highest of bureau, declared and observed debit orders | Must Have |
| PA-03 | Expenses are the higher of declared expenses and the NCA minimum expense norm | Must Have |
| PA-04 | The all-in instalment (including every patient fee) must fit discretionary income, RTI ≤ 20% of net (15% tightened), DTI ≤ 55% of gross for every segment | Must Have |
| PA-05 | Affordability is never overridden by the Medical Risk Score or a reviewer | Must Have |
| PA-06 | A sizing decline offers the largest amount that fits | Should Have |

### Provider risk management (PR)

| ID | Requirement | Priority |
|----|-------------|----------|
| PR-01 | HPCSA, practice number and bank account verified, re-checked every 12 months | Must Have |
| PR-02 | Trust-tier per-patient caps, monthly volume caps and holdbacks enforced on every channel | Must Have |
| PR-03 | Concentration: absolute rand caps below a R20m book, then ≤5% per provider and ≤20% per procedure type | Must Have |
| PR-04 | Performance breakers apply only to credible samples (≥20 arrangements / ≥10 first instalments) | Must Have |
| PR-05 | First-instalment failure rate is monitored per provider as a collusion signal | Must Have |
| PR-06 | Payout: 80% on patient AND provider procedure confirmation; balance on first collection or EOB reconciliation; holdback after 90 days current; provider recourse on dispute | Must Have |

### Medical Risk Score (MRS)

| ID | Requirement | Priority |
|----|-------------|----------|
| MRS-01 | Every signal is declared in the feature registry with pillar, source and status (DECISIONING / SHADOW / PROHIBITED) | Must Have |
| MRS-02 | Models may reference only DECISIONING features; PROHIBITED inputs are stripped and recorded | Must Have |
| MRS-03 | Health-condition data (chronic medication, claims, diagnoses), scheme brand and protected attributes are PROHIBITED | Must Have |
| MRS-04 | The PD predicts a fixed outcome: 90+ days past due within 12 months of first instalment | Must Have |
| MRS-05 | Outputs: 12-month and lifetime PD, 300–900 score, grade, contributions, adverse reasons, expected loss at policy LGD | Must Have |
| MRS-06 | Lifecycle gates: intercept recalibration at ≥100 bads; challenger training at ≥300 bads; promotion requires independent validation, Gini ≥ 0.35, PSI ≤ 0.10 and a fairness review | Must Have |
| MRS-07 | Challenger models can be scored in shadow on every decision without affecting it | Should Have |

### Bot protection review (BOT) — MINOR bump review

| ID | Requirement | Priority |
|----|-------------|----------|
| BOT-12-01 | Underwriting decision POSTs are limited to 10 per 15 minutes per IP | Must Have |
| BOT-12-02 | Perplexity-User, MistralAI-User and Meta-ExternalFetcher are blocked by name | Must Have |

---

## Deprecated Features

### Legacy Shield v1 gate engine as the live decision path (`services/shield-gates.service.js`)
- Removed in: v1.12.0 (no longer wired to any route; file and its unit tests retained)
- Last available in: v1.11.0 — see code-backups/v1.11.0/snapshot/
- Reason for removal: failed open on missing tables/columns and ignored obligations
- Replacement: Shield Underwriting Module (`backend/src/shield/`)

### Legacy patient gate on the marketplace path (`services/patient-gate.service.js`)
- Removed in: v1.12.0 from `POST /api/marketplace/applications` (still serves `/v2/shield` routes)
- Last available in: v1.11.0 — see code-backups/v1.11.0/snapshot/
- Reason for removal: skipped when income omitted; treated self-declared income as verified
- Replacement: Shield Underwriting Module

### Medical-aid brand, chronic medication and time-of-day/device scoring (`services/healthcare-risk.service.js`)
- Removed in: v1.12.0
- Last available in: v1.11.0 — see code-backups/v1.11.0/snapshot/
- Reason for removal: random, unobtainable health data, unfair-discrimination risk
- Replacement: MRS feature registry (PROHIBITED / SHADOW statuses)
