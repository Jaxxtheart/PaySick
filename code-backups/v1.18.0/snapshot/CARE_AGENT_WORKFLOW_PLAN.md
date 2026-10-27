# Care Agent: the patient's whole value chain (v1.18.0)

Until v1.17.1 the Care Agent took a patient from "I have a quote" to a
submitted application, then stopped. v1.18.0 carries it through everything
after: choosing a funder, repaying, changing a plan, getting through a
missed payment, and closing out. Every step is wired to the backend tables
it changes, and every action the agent takes or recommends is visible to the
patient.

The plan, with phone-screen designs for each step, was also published as a
page for review ("Care Agent Value Chain").

## One rule for every action: who may do it

Every action has exactly one authority tier in
`backend/src/services/care-agent-actions.service.js` (`ACTION_REGISTRY`,
frozen at load). The tier is set by the registry and nothing else: the
language model and the request body can't change it.

| Tier | Badge | What happens | Actions |
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
decision has a reason code and a plain-language rationale. Each one is
written to `care_agent_audit_log` as `AGENT_DECISION` and shown on screen in
a dashed teal box. The recovery thresholds come from
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

1. **Account home**: journey bar (10 steps), the agent's decision boxes, and
   next actions with tier badges. Opens whenever the account has activity.
2. **Plan and affordability**: the summary card gains optional income and
   debt fields, so Shield runs now and again at submission.
3. **Choose a funder**: offers ranked by total, the lowest marked, then an
   Accept card.
4. **Pay an instalment**: a card with the instalment number, amount, late
   fee, the new balance after paying, and a consent box.
5. **Missed payment**: the stage-appropriate options with tiers.
6. **Change request**: an in-page form (replacing `window.prompt`), then a
   "Send request" card.
7. **What the agent did**: a timeline from the audit log, each line tagged
   Agent / You / Team / Not done / PaySick.

## Endpoints (all require a login and session ownership)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/care-agent/sessions/:id/account` | Snapshot, journey stage, decisions, actions |
| POST | `/api/care-agent/sessions/:id/actions` | Propose `{ actionType, params }` |
| POST | `/api/care-agent/sessions/:id/actions/:proposalId/confirm` | `{ consent: true }`; own rate limit (15 per 15 min) |
| POST | `/api/care-agent/sessions/:id/actions/:proposalId/decline` | Decline |
| GET | `/api/care-agent/sessions/:id/decisions` | Timeline and proposals |

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
