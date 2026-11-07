# Release Notes — v1.18.0

**Release Date**: 2026-10-27
**Version Type**: MINOR — Care Agent workflows across the whole patient value chain

## Summary
The Care Agent used to stop at a submitted application. It now covers the
rest of the patient's journey: choosing a funder, repaying, changing a plan,
getting through a missed payment, and closing out. Each step is wired to the
backend tables it changes. Every action has one authority tier: the agent
does it (read-only), the patient approves it, the team decides, or it is
never done in chat. The agent's decisions carry reason codes and are shown
on screen and in a "What the agent did" log.

Full plan: [`CARE_AGENT_WORKFLOW_PLAN.md`](./snapshot/CARE_AGENT_WORKFLOW_PLAN.md).

## Added
- `services/care-agent-actions.service.js`: action registry with authority
  tiers, decision rules (`SELF_CURE`, `HUMAN_GATE`, `RESOLUTION`,
  `OFFERS_AWAITING`, `DUE_SOON`, `HARDSHIP_REVIEW`, ...), offer ranking,
  proposal validation, banking-detail detection, and deterministic intent
  detection. Pure code with no database.
- `services/care-agent-account.service.js`: one read of a patient's plans,
  instalments, collection cases, promises, offers, funder schedules and open
  requests, in cents.
- `services/care-agent-action-executor.service.js`: propose, confirm and
  decline. Confirm needs consent, makes an atomic claim, expires after 30
  minutes and re-checks against live data (refusing if the amount changed).
  Each outcome writes its backend update, a notification and an audit row.
- `services/plan-payment.service.js`: instalment payment moved out of
  `routes/payments.js`, unchanged, so the Make Payment page and the agent
  share one code path for money.
- LLM tools `get_account_overview` (read-only) and `propose_account_action`
  (draft only).
- Routes: `GET …/account`, `POST …/actions`, `POST …/actions/:id/confirm`,
  `POST …/actions/:id/decline`, `GET …/decisions`.
- Migration `013_care_agent_actions.sql`.
- `care-agent.html`:
  - journey bar
  - account home with decision boxes and tier badges
  - proposal cards with their own consent box
  - detail forms, replacing `window.prompt`
  - optional income fields
  - the "What the agent did" log
- `PaySickAPI.careAgent`: `getAccount`, `proposeAction`, `confirmAction`,
  `declineAction`, `getDecisions`.

## Fixed (bug workflow: failing test first, fix by a subagent)
- `GET …/manage` selected `lr.amount` / `lr.due_date`, which
  `loan_repayments` does not have, so "When's my next payment?" always
  failed. It now reads `scheduled_amount` / `scheduled_date` and treats
  `SCHEDULED` as upcoming.
- Income given at `/confirm` was never stored, and `/approve` never sent it,
  so Shield Gate 2 never ran on Care Agent submissions. It is now stored and
  sent, along with `medicalAidCovered`.
- A Shield decline was shown as "I couldn't submit that". It is now shown as
  an affordability decision, and execution is never recorded without an
  `applicationId`.
- The integration test mock for `/manage` used the wrong columns too, so it
  now uses the real ones.

## Security review (MINOR bump, per CLAUDE.md)
- Rate limits: confirming an action gets its own bucket of 15 per 15 minutes
  (`careAgentActionLimiter`), on top of the Care Agent's 60.
- Bot blocklist: added `Meta-ExternalFetcher`, `FirecrawlAgent`,
  `Google-NotebookLM` (no "bot" token, so the generic pattern missed them).
- Every new route requires a login and session ownership, and sets
  `X-Robots-Tag` through the router.

## Tests
- New unit tests: 185 across 8 files, each written and seen failing
  before the code.
- 1249 unit tests, 1247 pass. The 2 failures are the existing
  missing-module ones (`nodemailer`, `pg` cannot be installed here).
- Jest integration tests are updated but not run here (npm registry
  unreachable).
- The page was driven in Chromium against the real action services and an
  in-memory database: account home, pay with consent, team request, banking
  block, decision log. No page errors.

## Removed
Nothing. `POST …/manage/payment-date-change` stays for existing callers; the
page now uses the governed `REQUEST_PAYMENT_DATE_CHANGE` action.
