# Release Notes — v1.19.0

**Release Date**: 2026-10-27
**Version Type**: MINOR — Care Agent decisions moved to the backend; the patient sees outcomes only

## Summary
Owner direction: push the agent's decisions to the backend, not to the
patient-facing screen. The patient should see only confirmed statuses, not
the backend's decision processes, and it should not feel like an agent is
working in the background. The less the patient sees, the better.

Nothing about how the backend decides has changed. The registry, the
authority tiers, the decision rules, proposals, re-checks and audit trail
all work exactly as in v1.18.0. What changed is what reaches the patient.

## Added
- `services/care-agent-patient-view.service.js`: the single filter between
  the backend and the screen. `patientAccountView()` and
  `patientActionView()` are allowlists, and `INTERNAL_KEYS` lists what must
  never leak.
- `GET /api/care-agent/admin/sessions/:id/decisions` (`requireAdmin`): the
  agent's decision log, for staff.
- LLM prompt section "WHAT THE PATIENT SEES". It tells the model to state
  facts and outcomes only, never mention rules, reviews, checks, decisions,
  stages, risk or a team deciding, and never narrate what it's doing.

## Changed
- Every patient route returns only the patient view: `/account`,
  `/actions`, confirm, decline, and the proposals in `/messages`.
- The LLM's `get_account_overview` returns facts and options only, so the
  model has no rationale to repeat.
- Patient-facing wording is rewritten as plain facts and outcomes, for
  example:
  - "Payment received: R1,200.00."
  - "Noted: R1,200.00 by …"
  - "Request received. We'll let you know once it's done."
  - "Cancelled."
  - "That payment is not due."
- `care-agent.html`:
  - The account card shows a status line, outstanding and next payment,
    balance, requests as "Received", offers with Accept, and plain option
    buttons.
  - The confirm card shows the figures, a consent box and the server's
    button label ("Pay R1,200.00", "Send request").
  - Money uses the same "R1,200.00" format as the server.
  - The plan options no longer show the affordability-pressure flag or the
    Shield note.
  - The consent disclosure says "With whom: PaySick, to process your
    application". It keeps its stated purpose, because data-protection law
    requires one.
- `CARE_AGENT_WORKFLOW_PLAN.md` and the published plan are revised: each
  screen shows only what the patient sees, with a "Backend only" panel
  beside it.

## Removed (patient-facing)
- The journey bar (10-step stage tracker).
- "Agent decision" boxes with reason codes and rationales.
- Authority badges ("Agent does it", "You approve", "Team decides",
  "Not in chat").
- The "What the agent did" log and `PaySickAPI.careAgent.getDecisions`.
  `GET /api/care-agent/sessions/:id/decisions` is removed, and the staff
  route replaces it.
- The "Lowest" marker on offers.
- "Will change: …" system descriptions on confirm cards.

## Tests
- Test-first: `care-agent-patient-view.test.js` (27 tests) was new, and
  `care-agent-account-ui.test.js`, `care-agent-actions-wiring.test.js` and
  `care-agent-llm-account-tools.test.js` were updated. All were seen
  failing before the change.
- The patient-view tests scan every patient-facing refusal, consent text and
  outcome message for process words and first-person agent voice.
- 1284 unit tests, 1282 pass. The 2 failures are the existing
  missing-module ones (`nodemailer`, `pg`).
- The page was driven in Chromium against the real services through the
  patient filter. No process words appear on screen, the backend audit still
  records every decision, and there are no page errors.

## Security review (MINOR bump, per CLAUDE.md)
- The new admin route needs both a login and an admin role, and it sits
  under the Care Agent's existing rate limit.
- The bot blocklist and rate limits were reviewed. They were already updated
  in v1.18.0 the same day, so no further change was needed.
