# Architecture — PaySick v1.19.0

**Version**: 1.19.0
**Date**: 2026-10-27

## Changes from v1.18.0
A patient-view filter now sits between the governed action layer and the
page. Decisions stay on the backend side of it.

```
care-agent.html  (facts, plain options, confirm card, outcome text)
        ▲  patient view only
        │
care-agent-patient-view.service.js   (allowlist; INTERNAL_KEYS never pass)
        ▲                    ▲
        │ patientAccountView │ patientActionView
routes/care-agent.js
  GET  /sessions/:id/account   ─▶ recordAgentDecisions ─▶ AGENT_DECISION (audit)
  POST /sessions/:id/messages  ─▶ proposals.map(patientActionView)
  POST /sessions/:id/actions[/:pid/confirm|decline] ─▶ sendResult ─▶ patientActionView
  GET  /admin/sessions/:id/decisions  [requireAdmin]  ─▶ staff decision log
        │
        ▼  (unchanged from v1.18.0)
care-agent-action-executor.service.js ─▶ backend updates + audit
care-agent-actions.service.js         ─▶ registry, tiers, decision rules
care-agent-llm.service.js             ─▶ get_account_overview returns the patient view;
                                         prompt forbids narrating the process

BACKEND ONLY: decisions · reason codes · rationales · tiers · stages ·
offer ranking · affordability flags · review routing · refusal reasons
```

Removed from the page: the journey bar, decision boxes, authority badges,
and the "What the agent did" log.

The rest is as in [v1.18.0/ARCHITECTURE.md](../v1.18.0/ARCHITECTURE.md).
