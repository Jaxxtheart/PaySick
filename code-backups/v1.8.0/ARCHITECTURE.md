# Architecture — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-07-26

---

## Changes from v1.7.5

Additive backend module + one new admin page. No existing table, route, or
frontend flow was altered destructively.

### New: Daily Provider Outreach Agent

```
                          Vercel Cron (0 5 * * *)
                                   │  Authorization: Bearer $CRON_SECRET
                                   ▼
                   GET/POST /api/outreach/daily        ── backend/src/routes/outreach.js
                                   │
                                   ▼
                   runDailyPipeline()                  ── services/outreach/pipeline.service.js
                                   │
   ┌───────────────┬──────────────┼───────────────┬────────────────┐
   ▼               ▼              ▼                ▼                ▼
 Stage 1         Stage 2       Stage 3          Stage 4          Stage 5
 Source          Enrich        Score & Draft    Follow-up        Brief
 (Places         (Places       (fitScore +      (sequence        (brief.service
  textSearch)     details +     Claude draft +   next step)       → SMTP + dashboard)
                  public email  linter gate)
                  derivation)
   │               │              │                │                │
   └───────────────┴──────────────┴────────────────┴────────────────┘
                                   │
                                   ▼
                       outreach_runs (one row / run)

 Stage 3 writes outreach_touches as `draft` (clean) or `compliance_hold`
 (denied term). NOTHING here sends. All leads live in outreach_providers.
```

### Human gate (the only send path)

```
admin-approve-queue.html ──(PaySickAPI.outreach.*)──► /api/outreach/*  (requireAdmin)
        │
        ├── GET  /queue                  list draft / compliance_hold touches
        ├── GET  /brief                  funnel snapshot + brief HTML (sends nothing)
        ├── POST /touches/:id/edit       re-run linter; clean clears the hold
        ├── POST /touches/:id/reject     status → rejected
        ├── POST /touches/:id/approve    ►►► ONLY path that sets status='sent'
        │                                     then lead.stage → contacted,
        │                                     next_action_at → next sequence step
        └── POST /providers/:id/mark-replied   halt sequence (§5 stub)
```

### Data model (additive migration 008)

```
providers (existing) ◄────────── outreach_providers.provider_id  (set on signing)
                                        │
                                        │ 1
                                        │
                                        ▼ N
                                 outreach_touches   (channel, direction, sequence_step,
                                                     subject, body, status, compliance_flags)

outreach_runs   (run_date, leads_sourced, drafts_created, followups_due,
                 compliance_holds, errors)   — observability, one row per run
```

Lifecycle (`outreach_providers.stage`):
`sourced → enriched → drafted → approved → contacted → replied → demo → signed → live`,
plus terminal `disqualified`. `signed` sets `provider_id` and hands off to the
existing onboarding flow.

### Integration points (reused, not duplicated)

- **DB client** — `backend/src/config/database.js` (`query`, `transaction`).
- **Admin auth** — `backend/src/middleware/auth.middleware.js`
  (`authenticateToken`, `requireAdmin`, `optionalAuth`).
- **Email** — `backend/src/services/email.service.js` (`sendJourneyEmail`).
- **Migration runner** — startup loop in `server.js` picks up
  `backend/src/migrations/008_outreach_agent.sql` automatically.
- **Frontend client** — `api-client.js` `PaySickAPI.outreach.*`.

### External services

- **Google Places** (Text Search + Details) — sourcing/enrichment, via native `fetch`.
- **Anthropic Messages API** — drafting, via native `fetch` (no new npm dependency);
  model behind `ANTHROPIC_MODEL` (default `claude-sonnet-5`).
