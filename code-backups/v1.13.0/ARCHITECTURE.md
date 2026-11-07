# Architecture — PaySick v1.13.0

**Version**: 1.13.0
**Date**: 2026-10-26

## Changes from v1.12.2

```
index.html hero
  [NEW] Ask PaySick search bar ──▶ care-agent.html?q=…
                                      │ signed out ─▶ "Log in to talk to PaySick" ─▶ login.html
                                      │ signed in
                                      ▼
                        PaySickAPI.careAgent.*  (api-client.js)
                                      │  Bearer token
                                      ▼
  /api/care-agent/*  (auth required, 60 req / 15 min)   routes/care-agent.js
     POST /sessions ─────────────── create session (care_agent_sessions)
     POST /sessions/:id/messages ── ANTHROPIC_API_KEY set?
                                     ├─ yes ─▶ care-agent-llm.service  (Claude tool loop, claude-opus-5-5)
                                     │           tools: update_care_summary · get_shortfall · build_term_options
                                     │           └─ each tool → care-agent.service (pure, validated)
                                     │           error / refusal / empty reply ─┐
                                     └─ no ────────────────────────────────────┴▶ care-agent-nlp.service (deterministic)
     POST /sessions/:id/documents ─ care-agent-document.service (Claude reads quote/invoice/statement)
                                     └─ fields re-validated through update_care_summary
     POST /sessions/:id/confirm ─── patientGateService (Shield Gate 2, shared affordability-policy.js)
     POST /sessions/:id/approve ─── returns payload for existing POST /api/marketplace/applications
     POST /sessions/:id/execute ─── links the created application to the session audit trail
     GET|POST /sessions/:id/manage… change requests (care_agent_manage_requests)
  every transition ─▶ care_agent_audit_log

care-agent-anthropic-client.js ─▶ POST https://api.anthropic.com/v1/messages
  (fetch, anthropic-version 2023-06-01, model ANTHROPIC_MODEL || claude-opus-5-5, max_tokens 16000)
```

Migration `012_care_agent.sql` adds the three `care_agent_*` tables.

## Unchanged
The rest of the platform is as in [v1.12.2/ARCHITECTURE.md](../v1.12.2/ARCHITECTURE.md) and its references.
