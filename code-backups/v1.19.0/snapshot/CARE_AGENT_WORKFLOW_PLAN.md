# Care Agent: the patient's whole value chain (v1.18.0, revised in v1.19.0)

Until v1.17.1 the Care Agent took a patient from "I have a quote" to a
submitted application, then stopped. v1.18.0 carries it through everything
after: choosing a funder, repaying, changing a plan, getting through a
missed payment, and closing out. Every step is wired to the backend tables
it changes.

**v1.19.0 revision (owner direction):** the agent's decisions are pushed to
the backend, not to the patient's screen. The patient sees only confirmed
facts and statuses, so it never feels like an agent is working in the
background: the less the patient sees, the better.

The plan, with phone-screen designs for each step, was also published as a
page for review ("Care Agent Value Chain").

## What the patient sees, and what stays in the backend

| Patient sees | Backend only |
|--------------|--------------|
| A one-line status ("Your next payment of R1,200.00 is due on 14 November.") | Decisions, reason codes, rationales |
| Outstanding amounts, next payment, balance | Authority tiers (who may perform each action) |
| Funder offers in a neutral order, each with Accept | Journey and recovery stage, days-overdue thresholds |
| Plain options ("Pay an instalment now") | Offer ranking and the "lowest" pick |
| A confirm card: figures, consent box, one button | Affordability flags and the Shield Gate 2 result |
| The outcome: "Payment received", "Noted", "Request received" | Review routing, priority, response targets, re-check refusal reasons |

`backend/src/services/care-agent-patient-view.service.js` is the single filter
between the backend and the screen. It builds every patient response from an
allowlist, so a new internal field can't reach the screen by accident. Staff
read the decisions through the admin-only
`GET /api/care-agent/admin/sessions/:id/decisions`.

Patient-facing wording rules, enforced by tests and the LLM prompt:
- Facts and outcomes only.
- Never mention rules, reviews, checks, decisions, stages, risk, scores, or a
  team deciding.
- No narration ("let me check", "I've prepared"). A card simply appears with
  "Please check the details below."
- Never explain why an option is or isn't there.

## One rule for every action: who may do it

Every action has exactly one authority tier in
`backend/src/services/care-agent-actions.service.js` (`ACTION_REGISTRY`,
frozen at load). The tier is set by the registry and nothing else: the
language model and the request body can't change it. **Tiers are backend
only (v1.19.0):** the patient sees an option, a confirm card and an outcome,
never the tier.

| Tier | Staff label | What happens | Actions |
|------|-------|--------------|---------|
| `autonomous` | Agent does it | Read-only. The agent acts and records that it did. | `VIEW_ACCOUNT`, `COMPARE_OFFERS`, `EXPLAIN_FEE`, `START_CARE_REQUEST` |
| `patient_consent` | You approve | The agent prepares a card showing what will change. Nothing happens until the patient ticks the box and confirms. The figures are re-checked against live data at that moment. | `ACCEPT_OFFER`, `MAKE_PAYMENT`, `PROMISE_TO_PAY` |
| `human_review` | Team decides | The patient sends a complete request. The PaySick team decides, and the agent never promises an outcome. | `REQUEST_PAYMENT_DATE_CHANGE`, `REQUEST_RESTRUCTURE`, `REPORT_HARDSHIP` (8h, high), `DISPUTE_CHARGE`, `REQUEST_PLAN_ADJUSTMENT`, `REQUEST_CANCELLATION` |
| `prohibited` | Not in chat | Refused. The patient is sent to the right place. | `UPDATE_BANKING_DETAILS` (secure form), `CHANGE_AMOUNT_OWED`, `WRITE_OFF` |

The Make Payment and Accept Offer screens elsewhere on the site still work
as before. The Care Agent path to the same actions adds consent, re-checks
and an audit trail.

## The value chain

| Step | Patient action | Tier | Backend update |
|------|----------------|------|----------------|
| 1 Ask | Describes the need | Agent | `care_agent_sessions`, `SESSION_STARTED` |
| 2 Understand | Types details or uploads a quote | Agent | `structured_summary` via `update_care_summary` |
| 3 Plan | Confirms the summary, adds income (new) | You | Shield Gate 2; income now stored and sent at submit |
| 4 Apply | Consents and submits | You | `POST /api/marketplace/applications`; a Shield decline is now shown as a decision |
| 5 Choose funder | Compares offers, accepts one (new) | Agent + You | `acceptOffer()`: `lender_offers`, `loan_applications`, `marketplace_loans`, `loan_repayments` |
| 6 Treatment | Final bill differs, or a charge looks wrong (new) | Team | `manual_review_queue` + `care_agent_manage_requests` |
| 7 Repay | Checks what's due, pays an instalment (new) | Agent + You | `plan-payment.service.js`: `payments`, `payment_plans`, `transactions`, `notifications` |
| 8 Change | Moves the debit date, cancels (new) | Team | `care_agent_manage_requests` + `manual_review_queue` |
| 9 Recover | Missed a payment: pays, promises, restructures, reports hardship (new) | You + Team | `promise_to_pay`, `collection_actions`, `collections`; restructure preview from `buildRestructureOffer()` |
| 10 Close | Plan paid off | Agent | Collection resolved `paid`, promise `kept` |

## Decisions the agent makes

`decideNextBestActions(account)` runs plain rules on live account data. Each
decision has a reason code and a rationale. Each one is written to
`care_agent_audit_log` as `AGENT_DECISION` for staff. It decides which
options the patient sees; the patient never sees the decision itself. The recovery thresholds come from
`recovery-engine.service.js`, so the agent and the collections team always
see the same stage.

| Reason code | When | What the agent offers |
|-------------|------|-----------------------|
| `NO_ACCOUNT` | Nothing on the account | Start a care request |
| `APPLICATION_IN_PROGRESS` | Submitted, no offers yet | Wait; offers appear here |
| `OFFERS_AWAITING` | Pending funder offers | Compare (Agent), accept the lowest total to repay (You) |
| `HARDSHIP_REVIEW` | Open hardship request | No payment prompts at all |
| `PROMISE_ACTIVE` | A live promise covers the overdue instalment | Pay now only; no second promise |
| `SELF_CURE` | Overdue 1 to 29 days | Pay, promise (You); hardship (Team) |
| `HUMAN_GATE` | Overdue 30 to 90 days | Pay, promise (You); restructure, hardship (Team) |
| `RESOLUTION` | Overdue 91+ days | Pay (You); restructure, hardship (Team); no new promises |
| `DUE_SOON` | Next instalment within 5 days | Pay early (You), move the date (Team) |
| `ON_TRACK` | Active plan, nothing due soon | See schedule (Agent), move the date (Team) |
| `PLAN_COMPLETE` | All plans paid | Start a new care request |
| `REQUEST_PENDING` | Any request with the team | Status line only; never says "approved" |

A team action already with the team is not suggested again. Offers are
ranked by total to repay, with the shorter term winning a tie. The agent
marks the lowest offer but never picks one for the patient.

## Guardrails on every proposal

`evaluateProposal()` checks every proposed action, whether it came from the
model, a tap or a crafted request:

- **Amounts always come from PaySick.** Instalment amounts come from the
  plan, late fees from `fee.service.js`, and offer figures from the offer on
  file. Amounts in `params` are ignored.
- **Promise to pay**: needs an open collection case, must be under 91 days
  overdue (Recovery Engine `selfCureEligible`), no more than what is owed,
  not in the past, and within 30 days.
- **Restructure**: 1 to 24 months. The preview uses `buildRestructureOffer()`,
  and a term over the 25% cost cap is refused.
- **Banking details** in any free text (an account number, a branch code,
  9 to 12 digits) are refused, and the patient is sent to the secure form.
- **Free text** is trimmed and capped at 500 characters.

`care-agent-action-executor.service.js` then:

1. Requires `consent === true`.
2. Claims the proposal atomically (`awaiting_consent -> confirming`), so a
   double tap executes once.
3. Expires proposals after 30 minutes.
4. Re-checks the proposal against live data. It refuses if the instalment
   was already paid, the offer is gone, or **the amount changed since the
   patient agreed**.
5. Executes, notifies, audits.

The language model has two new tools. `get_account_overview` is read-only.
`propose_account_action` only drafts a card. The LLM service doesn't import
the executor, the payment service or the marketplace, and a test checks
that.

## Screens (all inside `care-agent.html`)

1. **Account card**: a one-line status, the facts (outstanding, next payment,
   balance, requests as "Received"), and plain option buttons. It is hidden
   when there's nothing on the account.
2. **Choosing a plan**: 0% plans and optional income fields. The pressure
   flag and the Shield note stay in the backend.
3. **Funder offers**: listed by total to repay, each with Accept, then a
   confirm card. Nothing is marked as recommended.
4. **Paying**: a confirm card (amount, late fee, consent box, "Pay
   R1,200.00"), then "Payment received: R1,200.00."
5. **Change request**: a short form, a "Send request" card, then "Request
   received. We'll let you know once it's done."
6. **Decision log (staff only)**: every read, decision, proposal and
   outcome, tagged by who acted. Admin API only.

## Endpoints (all require a login; patient routes also require session ownership)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/care-agent/sessions/:id/account` | Snapshot, journey stage, decisions, actions |
| POST | `/api/care-agent/sessions/:id/actions` | Propose `{ actionType, params }` |
| POST | `/api/care-agent/sessions/:id/actions/:proposalId/confirm` | `{ consent: true }`; own rate limit (15 per 15 min) |
| POST | `/api/care-agent/sessions/:id/actions/:proposalId/decline` | Decline |
| GET | `/api/care-agent/admin/sessions/:id/decisions` | Staff only (`requireAdmin`): timeline and proposals |

Migration `013_care_agent_actions.sql` adds `care_agent_action_proposals`, and
adds `details`, `review_queue_id` and `resolved_at` to
`care_agent_manage_requests`.

## Not in this release

- Paying a **funder's** schedule (`loan_repayments`) in chat. That money
  goes to the funder and no collection endpoint exists to reuse, so the agent
  shows that schedule but doesn't take payment for it.
- A dedicated staff screen for the new `CARE_AGENT_*` review types. They land
  in the existing `manual_review_queue`.
- Resolving a request back to the patient. Staff set
  `care_agent_manage_requests.status` and the patient sees it on next load;
  there is no push update yet.
