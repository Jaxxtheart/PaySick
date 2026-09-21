# Architecture — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-09-21

---

## Changes from v1.11.0

Adds one new, fully additive product surface — the PaySick Care Agent —
alongside the existing platform. No existing route, service, table, or
page's behavior changed. New: 1 route file, 2 pure services, 1 migration,
1 HTML page, `api-client.js` additions, and a small extraction refactor
(`utils/affordability-policy.js`) that patient-gate.service.js now sources
its constants from.

```
                      ┌─────────────────────────────┐
                      │        index.html            │
                      │  (unchanged primary CTA)      │
                      │  [NEW] "Ask PaySick" link      │
                      └───────────┬─────────────┬────┘
                                  │             │
                     traditional  │             │  new
                        journey   ▼             ▼  journey
              ┌──────────────────────┐   ┌──────────────────────┐
              │ login → marketplace- │   │   care-agent.html      │
              │ apply.html → offers  │   │  (auth-gated; locked   │
              │ → payments           │   │   state if signed out) │
              │  [UNCHANGED]         │   └───────────┬────────────┘
              └──────────┬───────────┘               │
                         │                            │ /api/care-agent/*
                         │                            ▼
                         │              ┌───────────────────────────────┐
                         │              │  routes/care-agent.js          │
                         │              │  (authenticateToken on every    │
                         │              │   route; own rate-limit bucket) │
                         │              └───────────┬────────────────────┘
                         │                          │
                         │      ┌───────────────────┼─────────────────────┐
                         │      ▼                   ▼                     ▼
                         │ care-agent-nlp.   care-agent.service.js   patientGateService
                         │ service.js        (merge / missing-fields /  (Shield Gate 2 —
                         │ (extraction,      next-question / term       UNCHANGED, reused
                         │ intent — pure,    options — pure, no DB)     as-is for the
                         │ no DB, no LLM)                               authoritative
                         │                                              recommendation)
                         │
                         │  Stage 4 (Approve) hands back a payload;
                         │  the frontend then calls the EXISTING:
                         └─────────────────▶ POST /api/marketplace/applications
                                                  [UNCHANGED — no new
                                                   execution path]
```

## care-agent.html — six conversational stages

```
Stage 1 Need         free text / suggested prompts / file attach
                      (attach ≠ parsed — no OCR; agent says so and asks
                       the patient to describe it)
        │
        ▼  POST /api/care-agent/sessions/:id/messages  (per turn)
Stage 2 Understand    care-agent-nlp.service.extractCareRequest() + detectIntent()
                          │
                          ▼
                      care-agent.service.mergeCareSummary()
                      (patient-confirmed fields always win over a later
                       extraction; a "not found" field is never recorded)
                          │
                          ▼
                      missingFieldsFor() → nextQuestion()
                      (amount → treatment → medical-aid status → confirm)
                          │
                          ▼
                      editable summary card — Confirm / Edit
                      (never proceeds past this on a guess)
        │
        ▼  POST /api/care-agent/sessions/:id/confirm
Stage 3 Construct     computeShortfallCents() (confirmed figures only)
                          │
                          ▼
                      buildTermOptions() → 3/6/12-month, 0% interest,
                      rounded up (never under-collects)
                          │
                          ▼ (if monthlyIncome supplied)
                      patientGateService.assessApplication()
                      → APPROVE / DECLINE / REFER_TO_HUMAN + rationale
                      (Care Agent never computes its own decision)
        │
        ▼  user selects a term
Stage 4 Approve        discloses what/whom/why → explicit consent checkbox
                        POST /api/care-agent/sessions/:id/approve
                        → 400 without confirmed summary + explicit consent
                        → 200 { applicationPayload, executeEndpoint }
        │
        ▼  frontend calls the payload against the EXISTING endpoint
Stage 5 Execute        PaySickAPI.marketplace.submitApplication(payload)
                        [UNCHANGED endpoint/service — see marketplace.js]
                          │
                          ▼
                        POST /api/care-agent/sessions/:id/execute
                        (links applicationId to this session's audit trail
                         only — performs no execution itself)
        │
        ▼  conversation stays open
Stage 6 Manage          GET  /api/care-agent/sessions/:id/manage
                        → reads loan_repayments/marketplace_loans directly
                          (same tables GET /api/marketplace/loans/:id/repayments
                           reads) — no separate source of truth
                        POST /api/care-agent/sessions/:id/manage/payment-date-change
                        → logs to care_agent_manage_requests for human
                          review; does not change the date itself (no
                          self-service capability exists elsewhere to call)
```

## Data model — new tables (`012_care_agent.sql`)

```
care_agent_sessions
  session_id (PK) · user_id (FK users) · stage · structured_summary JSONB
  · confirmed · approved · selected_term_months · application_id
  · created_at · updated_at

care_agent_audit_log
  audit_id (PK) · session_id (FK) · event_type · actor (patient|agent|system)
  · payload JSONB · created_at
  — every extraction, question, confirmation, approval, execution

care_agent_manage_requests
  request_id (PK) · session_id (FK) · request_type · reason · status
  · created_at
  — Stage 6 asks the agent cannot self-serve (payment-date change)
```

No foreign key from `care_agent_sessions.application_id` to
`loan_applications` — it's a plain string recording whatever id
`POST /api/marketplace/applications` returned, since that endpoint (and
its `loan_applications` table) remain entirely outside this migration's
ownership.

## utils/affordability-policy.js — shared constant extraction

```
BEFORE:
  patient-gate.service.js
    requires config/database.js (→ pg)
    defines HARD_FLOORS, AMBER_THRESHOLDS inline

AFTER:
  utils/affordability-policy.js   [NEW]
    HARD_FLOORS, AMBER_THRESHOLDS (pure constants, no DB dependency)
        │                    │
        ▼                    ▼
  patient-gate.service.js   care-agent.service.js
  (imports, re-exports —     (imports AMBER_THRESHOLDS.rti_comfort_zone
   same names/values,         for the Construct-stage pressure warning —
   no external change)        stays DB-free and node --test-runnable)
```

Same pattern already used by `utils/restructure-policy.js`
(`MAX_RESTRUCTURE_COST_INCREASE`, shared between `outcome-gate.service.js`
and `restructure-offer.service.js`) — this release follows existing
convention rather than introducing a new one.

## Test topology

```
tests/unit/
   ├── care-agent-nlp.test.js         [NEW] — extraction, no DB/LLM dependency
   ├── care-agent.test.js             [NEW] — merge/missing/options, no DB dependency
   └── static-bot-protection.test.js  [CHANGED] — care-agent.html added to HONEYPOT_PAGES

tests/integration/
   └── care-agent.test.js             [NEW] — Jest/Supertest, mocked DB + mocked
                                        patient-gate.service, mirrors
                                        applications.test.js's pattern
```

Runner (unit): `node --test tests/unit/*.test.js` — 730 tests, 728 pass, 2
fail (both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note, consistent with every release since v1.9.0).

Runner (integration): `npx jest tests/integration/` — not executable in
this session's sandbox (no npm registry access to install Jest itself);
written test-first and traced by hand against `routes/care-agent.js`'s
exact query sequence. Run it in an environment with registry access before
this lands on a branch that deploys.

---

## Platform architecture (unchanged from v1.11.0)

See [v1.11.0/ARCHITECTURE.md](../v1.11.0/ARCHITECTURE.md) for the full
request path, Recovery Engine, bot-protection layer, and `/api/v1`
facilitation surface, which this release inherits without modification.
