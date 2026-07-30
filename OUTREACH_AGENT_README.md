# PaySick — Daily Provider Outreach Agent

A daily, human-gated agent that fills the top of the provider-acquisition funnel
and hands the founder a morning approve-queue. Each run it **sources** target
practices → **enriches** them → **scores** them for fit → **drafts** compliant,
personalised outreach → **schedules follow-ups** → **compiles a daily brief**.

**The send is human-gated.** The agent never sends outbound messages
autonomously. It only ever produces `draft` / `compliance_hold` touches. A message
becomes `sent` exclusively by approving it in the admin Approve Queue.

This is a **non-destructive, additive** module layered onto the existing PaySick
platform (static HTML frontend + Express/`pg` backend on Vercel). It references
the existing `providers` entity — a target practice becomes a real PaySick
provider once it signs and onboards.

---

## What was added

| File | Purpose |
|------|---------|
| `backend/src/migrations/008_outreach_agent.sql` | Additive tables: `outreach_providers`, `outreach_touches`, `outreach_runs` (+ indexes). Auto-applied on server startup. |
| `backend/src/config/outreach.config.js` | `OUTREACH_CONFIG` — verticals, metros, caps, sequence cadence, sender/brief recipients. |
| `backend/src/services/outreach/compliance.service.js` | Terminology linter (§6.3) — the compliance gate. |
| `backend/src/services/outreach/scoring.service.js` | Transparent fit scoring (§6.2). |
| `backend/src/services/outreach/claude.service.js` | Anthropic Messages API drafting wrapper (§6.1). |
| `backend/src/services/outreach/places.service.js` | Google Places sourcing + enrichment (Stages 1-2). |
| `backend/src/services/outreach/sequence.service.js` | Follow-up sequence copy + scheduling (§6.4). |
| `backend/src/services/outreach/brief.service.js` | Daily brief composer + delivery (§6.5). |
| `backend/src/services/outreach/repo.js` | Data-access layer over the existing `pg` client. |
| `backend/src/services/outreach/pipeline.service.js` | The 5-stage orchestrator. |
| `backend/src/routes/outreach.js` | Cron route + admin Approve-Queue API. |
| `admin-approve-queue.html` | The human gate: Approve / Edit / Reject / Mark-replied. |
| `tests/unit/outreach-*.test.js` | Test-first coverage for the linter, scorer, and pipeline. |

No existing table or route was altered destructively.

---

## Environment variables

Add these (the existing ones are untouched). They're documented in
`backend/.env.example`:

| Var | Used by |
|-----|---------|
| `GOOGLE_PLACES_API_KEY` | Sourcing + enrichment |
| `ANTHROPIC_API_KEY` | Claude drafting |
| `ANTHROPIC_MODEL` | Model string (default `claude-sonnet-5`) |
| `ANTHROPIC_TEMPERATURE` | *Optional.* Only set for a model that accepts a non-default temperature — current Sonnet/Opus models reject it (400), so it is omitted unless set. |
| `CRON_SECRET` | Guards the daily cron route |

The daily brief reuses the existing `SMTP_*` settings — no new email config.

---

## The daily pipeline (cron)

A Vercel Cron entry (`vercel.json`) hits `GET /api/outreach/daily` at `0 5 * * *`.
Vercel sends `Authorization: Bearer $CRON_SECRET` automatically; the route
rejects anything else (in production). The route runs five stages in order and
writes one `outreach_runs` row:

1. **Source** — Places Text Search per active vertical × target metro; dedupe on
   `place_id`; honour the daily cap and `do_not_contact`.
2. **Enrich** — Places Details (website, phone, rating); derive a **public
   business email** from the practice's own site only. No email → `linkedin`/`call`.
3. **Score & draft** — compute `fit_score`; draft the top leads via Claude; run
   each draft through the terminology linter. Clean → `draft`; denied term →
   `compliance_hold`.
4. **Follow-up scheduler** — next sequence step for `contacted` leads with no
   inbound reply whose `next_action_at` is due. A `replied` lead never advances.
5. **Brief** — compile + deliver the founder's morning brief.

## Inbound replies → agentic onboarding (Resend)

When a provider replies to an outreach email, Resend delivers it to a webhook
that turns the reply into a human-gated onboarding draft.

**Set up the "link" in Resend:**
1. In Resend, add a webhook (or inbound route) pointing at
   **`POST https://<your-domain>/api/outreach/inbound`**.
2. Copy the signing secret Resend shows (`whsec_…`) into the
   **`RESEND_WEBHOOK_SECRET`** env var in Vercel. Every inbound call is verified
   against its Svix signature; unsigned calls are rejected in production.

**What happens on a reply:**
1. The signature is verified, and the sender is matched to an outreach lead by
   public email.
2. The lead flips to **`replied`** and its follow-up sequence halts (it never
   advances a replied lead).
3. The reply is recorded as an inbound `outreach_touches` row (audit trail).
4. The agent drafts an **onboarding-prompting reply** — compliant (linter-checked),
   signed "Best, The PaySick Team", and containing the onboarding link
   (`OUTREACH_CONFIG.onboardingLink`, default `/provider-apply.html`).
5. That draft lands in the **Approve Queue** — it is **human-gated**, never
   auto-sent. Approving it there is the only way it emails the provider, and
   approving an onboarding reply does **not** reset the lead back into the
   sequence.

To change where the onboarding prompt points, edit `onboardingLink` in
`backend/src/config/outreach.config.js`.

## The human gate (admin)

`admin-approve-queue.html` (linked from the admin dashboard) lists every
`draft` / `compliance_hold` touch with lead context and fit score:

- **Approve & send** — the **only** path that sets `status='sent'`. A
  `compliance_hold` cannot be approved until edited clean.
- **Edit** — re-runs the linter; clean copy clears the hold.
- **Reject** — `status='rejected'`.
- **Mark replied** — halts the sequence so the founder replies personally (§5 stub).

---

## Run one cycle locally

```bash
cd backend && npm install          # first time
npm run dev                        # starts the server; migration 008 auto-applies

# Dry-run (sources/enriches/scores/drafts, sends nothing):
curl -X POST "http://localhost:3000/api/outreach/daily?dry=1"
#   (in dev, an unset CRON_SECRET is allowed; in production it is mandatory)
```

Or click **"Run pipeline now (dry-run)"** in the Approve Queue while logged in as
an admin.

Run the unit tests (no DB/network needed — dependencies are injected):

```bash
node --test tests/unit/outreach-*.test.js
```

## Switch vertical

Edit `backend/src/config/outreach.config.js`:

```js
activeVerticals: ['fertility'],   // was ['aesthetics']
```

No other code change is required — targeting, scoring weights, and Places search
terms all key off this value.

---

## Compliance (enforced in code, not left to the LLM)

- **Terminology linter** runs on every draft before it can enter the queue, on
  every edit, and again defensively at approve time. Denied terms: *credit, loan,
  lend/lending, borrow/borrower, interest, apr, debt/debtor, default, repayment,
  financing*. Compliant frame: patients **pay in affordable monthly instalments**;
  the provider is **paid in full, upfront**; PaySick is a **payment facilitator**.
- **POPIA** — sourcing draws public business contact details only; every lead
  carries a `consent_basis`, and a `do_not_contact` flag is honoured before drafting.
- **Approval gate + audit** — no autonomous sending; every touch and status
  transition is recorded in `outreach_touches`.
