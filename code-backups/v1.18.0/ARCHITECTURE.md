# Architecture — PaySick v1.18.0

**Version**: 1.18.0
**Date**: 2026-10-27

## Changes from v1.17.1
A governed action layer sits between the Care Agent and the existing
money and collections services.

```
care-agent.html
  journey bar · account home · proposal cards · detail forms · decision log
        │  PaySickAPI.careAgent.{getAccount, proposeAction, confirmAction, declineAction, getDecisions}
        ▼
routes/care-agent.js  (authenticateToken + getOwnedSession on every route)
  POST /messages ──▶ loadAccountSnapshot ──▶ runCareAgentTurn({ account })
  │                                           ├─ get_account_overview   (read)
  │                                           └─ propose_account_action (draft only)
  │                  no LLM: detectAccountIntent ─▶ draft or detail form
  │                  drafts ─▶ executor.propose(proposedBy: 'agent')
  GET  /account ─────▶ executor.recordAgentDecisions ─▶ AGENT_DECISION audit
  POST /actions ─────▶ executor.propose(proposedBy: 'patient')
  POST /actions/:id/confirm ─▶ executor.confirm   [careAgentActionLimiter 15/15min]
  POST /actions/:id/decline ─▶ executor.decline
  GET  /decisions ───▶ care_agent_audit_log + care_agent_action_proposals
        │
        ▼
care-agent-action-executor.service.js
  propose: evaluateProposal ─┬─ autonomous ─────▶ run now (read-only)
                             ├─ consent / team ─▶ care_agent_action_proposals (awaiting_consent, 30 min)
                             └─ prohibited/bad ─▶ refused (+ redirect)
  confirm: consent===true ─▶ atomic claim ─▶ expiry ─▶ live re-check (amount unchanged)
           ├─ ACCEPT_OFFER   ─▶ marketplaceAuctionService.acceptOffer
           │                     (lender_offers, loan_applications, marketplace_loans, loan_repayments)
           ├─ MAKE_PAYMENT   ─▶ plan-payment.service ─▶ payments, payment_plans, transactions
           │                     then collections → resolved/paid, promise_to_pay → kept
           ├─ PROMISE_TO_PAY ─▶ promise_to_pay, collection_actions, collections → in_progress
           └─ team request   ─▶ manual_review_queue (CARE_AGENT_*) + care_agent_manage_requests
           + notifications (in_app) + care_agent_audit_log
        │
        ▼
care-agent-actions.service.js (pure)
  ACTION_REGISTRY · decideNextBestActions · evaluateProposal · rankOffers
  reuses: recovery-engine (stage thresholds) · fee.service (late fee)
          promise-to-pay.service · restructure-offer.service (25% cap)

routes/payments.js POST /:id/pay ─▶ plan-payment.service (same path as the agent)
```

## Data
- New: `care_agent_action_proposals` (migration 013).
- Changed: `care_agent_manage_requests` gains `details`, `review_queue_id`,
  `resolved_at`.

The rest is as in [v1.17.1/ARCHITECTURE.md](../v1.17.1/ARCHITECTURE.md).
