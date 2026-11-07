# Release Notes — v1.12.0

**Release Date**: 2026-09-21
**Version Type**: MINOR — new user-facing product surface (PaySick Care Agent)

## Summary

Adds **PaySick Care Agent**, an AI-native alternative front door to PaySick,
reachable from a new secondary "Ask PaySick" link on the homepage hero
(`index.html`). The traditional apply-first journey (`login.html` →
`marketplace-apply.html` → offers → payments) is completely unchanged and
remains the primary CTA — the Care Agent is an additional path, not a
replacement.

Where the traditional journey is "apply → provide information → receive
options → select → repay", the Care Agent is organised around intent and
outcomes: "express need → understand situation → construct options →
approve → execute → manage" (`care-agent.html`, a six-stage conversational
UI, talking to a new `backend/src/routes/care-agent.js` API surface).

**Architecture principle, held throughout: "AI reasons, PaySick controls."**
The Care Agent's "AI" is a deterministic, rule-based extraction and
question-selection engine (`care-agent-nlp.service.js`,
`care-agent.service.js`) — regex and keyword matching, **not** a call to any
external LLM (none is wired into this repository, and none should be
assumed). It never invents a Rand figure, a procedure, or an affordability
threshold: every extracted field carries an explicit confidence flag, a
missing field is asked about rather than guessed, and the zero-interest
term options it builds reuse fee.service.js's existing 0%-patient-interest
policy and patient-gate.service.js's existing affordability comfort-zone
threshold (via a newly extracted, shared `utils/affordability-policy.js` —
see Changed below). The one real financial decision — Shield Gate 2's
approve/decline/refer recommendation — is still made by
`patientGateService.assessApplication()`, the same engine
`marketplace.js`'s application endpoint already uses. Execution is not
duplicated either: the Care Agent's Approve stage hands back the exact
payload for the **existing, unmodified** `POST /api/marketplace/applications`
endpoint; the frontend submits to that endpoint directly, and the Care
Agent only links the resulting application id back into its own audit
trail. No existing route, service, or page's behavior changed to make this
possible.

Built test-first per CLAUDE.md: the two pure-logic services
(`care-agent-nlp.service.js`, `care-agent.service.js`) have unit tests
written and confirmed failing before implementation, run via
`node --test` (36 tests, all passing, zero third-party dependencies). The
route layer (`routes/care-agent.js`) has a companion Jest/Supertest
integration suite (`tests/integration/care-agent.test.js`), also written
before the routes existed and mirroring `tests/integration/applications.test.js`'s
mocked-DB pattern. See "Environmental note" below — this session's sandbox
has no npm registry access, so the integration suite could be written and
manually traced against the implementation, but not executed here.

## Added

- **`care-agent.html`** — the Care Agent conversational UI. Six stages:
  Need (free-text/suggested-prompt entry), Understand (progressive
  extraction into an editable, Confirm/Edit summary card — never proceeds
  on a guess), Construct (zero-interest 3/6/12-month term options, each
  captioned with a Shield-derived affordability note when income is
  known), Approve (explicit data-sharing disclosure + consent checkbox,
  required before anything is submitted), Execute (submits through the
  existing marketplace endpoint, not a new one), Manage (persistent
  post-arrangement chat: "when's my next payment?", "change my payment
  date" — the latter is logged for human review, not self-actioned).
  Auth-gated: an unauthenticated visitor sees a locked state and a link to
  `login.html`, never Care Agent business logic (CLAUDE.md API-auth
  requirement). Ships with the same bot-crawling protections as every
  other entry point: a hidden honeypot link to `/api/hp-check`, JS-required
  rendering, and the global `X-Robots-Tag` header (`vercel.json`, already
  catch-all). (`tests/unit/static-bot-protection.test.js` extended to
  cover it.)
- **`backend/src/routes/care-agent.js`** — new `/api/care-agent/*` surface,
  every route behind `authenticateToken`: `POST /sessions`,
  `GET /sessions/:id`, `POST /sessions/:id/messages`,
  `POST /sessions/:id/confirm`, `POST /sessions/:id/approve`,
  `POST /sessions/:id/execute`, `GET /sessions/:id/manage`,
  `POST /sessions/:id/manage/payment-date-change`. Registered in
  `server.js` behind its own rate-limit bucket (60 req/15min — tighter
  than a plain read endpoint, since each turn does extraction + a DB
  write).
- **`backend/src/services/care-agent-nlp.service.js`** — deterministic
  extraction: quoted amount, treatment/procedure guess (keyword
  dictionary), provider name, explicit scheme-contribution amount (only
  when stated, never inferred), and intent classification against the
  product spec's five suggested prompts. Every field carries a
  `confidence: 'high'|'low'`.
- **`backend/src/services/care-agent.service.js`** — summary merge
  (patient edits always win over a later extraction), missing-field
  detection, progressive next-question selection (amount → treatment →
  medical-aid status → ready to confirm), shortfall computation (only
  from confirmed figures, never estimated), and zero-interest term-option
  construction with instalments rounded up so a plan never under-collects
  (same rounding rule as `restructure-offer.service.js`).
- **`backend/src/migrations/012_care_agent.sql`** — `care_agent_sessions`,
  `care_agent_audit_log` (full audit trail: every extraction, question,
  confirmation, approval and execution is written here, per the "always
  preserve an audit trail" product principle), and
  `care_agent_manage_requests` (Stage 6 requests the agent cannot execute
  itself, e.g. a payment-date change — logged for human follow-up).
- **`PaySickAPI.careAgent`** in `api-client.js` — `startSession`,
  `getSession`, `sendMessage`, `confirmSummary`, `approve`,
  `recordExecution`, `getManageStatus`, `requestPaymentDateChange`,
  matching the existing `PaySickAPI.marketplace` namespace's style.
- **Homepage entry point** — a secondary, non-destructive "Ask PaySick"
  link added below the existing hero CTAs on `index.html`. The primary
  "Get Started" button, the "Learn More" button, and the entire
  traditional application journey are byte-for-byte unchanged.

## Changed (hygiene)

- **`utils/affordability-policy.js` extracted from `patient-gate.service.js`.**
  `HARD_FLOORS` and `AMBER_THRESHOLDS` were previously defined inline in
  `patient-gate.service.js`, which requires `config/database.js` (and
  therefore the `pg` driver) at module load. The Care Agent needed the
  same affordability comfort-zone threshold Shield Gate 2 uses, without
  pulling a database dependency into its pure, `node --test`-friendly
  service. Mirrors the existing `utils/restructure-policy.js` pattern
  (shared between `outcome-gate.service.js` and
  `restructure-offer.service.js`). `patient-gate.service.js` now imports
  from it; its own exports (`HARD_FLOORS`, `AMBER_THRESHOLDS`) are
  unchanged in name and value, so nothing that imported them before needs
  to change.

## Honesty notes (deliberate scope decisions)

These aren't bugs — they're places the implementation says plainly what it
does *not* do, per the product spec's "never hide uncertainty" principle:

- **No document parsing/OCR.** A patient can attach a file, but the Care
  Agent cannot read inside it (no OCR/document-extraction library exists
  in this repository). It says so directly and asks the patient to state
  the amount/treatment in their own words instead of silently ignoring
  the attachment or fabricating extracted values.
- **No external LLM.** All "AI reasoning" is the deterministic
  regex/keyword engine described above. Nothing in this release calls a
  third-party language-model API.
- **Payment-date changes are logged, not actioned.** No self-service
  date-change capability exists elsewhere in the codebase to reuse, so
  the Manage stage logs the request (`care_agent_manage_requests`) for
  human review and says so, rather than pretending to change it.

## Removed / Deprecated

None. No existing route, page, table, or behavior was removed or changed.

## Breaking Changes

None. All existing endpoints, pages, and the `patient-gate.service.js`
public API are unchanged.

## Migration Notes

Run `012_care_agent.sql` (applied automatically on server startup by
`server.js`'s migration runner, like all migrations in
`backend/src/migrations/`). No data backfill required — this is new,
empty tables only.

## Environmental note (test execution)

This session's sandbox has no npm registry access (`npm install` returns
403 Forbidden) and no `node_modules` anywhere in the repo, consistent with
the note carried in v1.9.0 through v1.11.0's own release notes. The pure
unit tests (`tests/unit/care-agent-nlp.test.js`,
`tests/unit/care-agent.test.js`, 36 tests total) were written first,
confirmed failing, then confirmed passing via `node --test` — no
third-party dependency required. Full `node --test tests/unit/*.test.js`
after these changes: 730 tests, 728 pass, 2 fail — the same two
pre-existing, unrelated failures noted in every release since v1.9.0
(`email-service.test.js` needs `nodemailer`; `marketplace-lender-gate.test.js`
needs `pg`), reproduced identically before this release's changes. The new
Jest/Supertest integration suite
(`tests/integration/care-agent.test.js`) was written test-first and traced
carefully by hand against `routes/care-agent.js`'s exact query sequence,
but — like every other file under `tests/integration/` — could not be
executed in this sandbox, since Jest itself is not installed and cannot be
fetched here. Run `npm install && npx jest tests/integration/care-agent.test.js`
in an environment with registry access to confirm it green before this
lands on a branch that deploys.
