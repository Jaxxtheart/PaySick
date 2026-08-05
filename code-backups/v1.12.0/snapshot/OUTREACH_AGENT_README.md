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

## Email deliverability (DNS — do this before sending at volume)

Google, Yahoo, and Microsoft now require a valid **DMARC** record (plus aligned
**SPF** and **DKIM**) for bulk senders. These are DNS records added at wherever
`paysick.co.za` DNS is hosted (your registrar / DNS provider) — not in this repo.

**1. DMARC** — add a TXT record:

| Field | Value |
|-------|-------|
| Type  | `TXT` |
| Name / Host | `_dmarc` (i.e. `_dmarc.paysick.co.za`) |
| Value | `v=DMARC1; p=none; rua=mailto:dmarc@paysick.co.za; fo=1` |

`p=none` is a **valid DMARC record** and satisfies the requirement while you
monitor. Once the aggregate reports (`rua`) look clean, tighten to
`p=quarantine`, then `p=reject`. (Create/monitor the `dmarc@paysick.co.za` inbox.)

**2. SPF + DKIM** — these must exist and *align* with the From domain, or DMARC
fails. Resend generates them when you **verify your sending domain** in its
dashboard: it gives you a DKIM `CNAME`/`TXT` set and an SPF entry (an `include:`
for Resend on your domain's `TXT` SPF record, e.g.
`v=spf1 include:_spf.resend.com ~all`). Add exactly what Resend shows for
`paysick.co.za`.

**3. From address** — send from a monitored address on the verified domain (this
repo now defaults to `hello@paysick.co.za`, set via `SMTP_FROM`). Do **not** use
`no-reply@` — it lowers inbox trust and reply/feedback signal.

**4. Brief recipient must be a REAL mailbox.** Resend (like any sender) delivers
mail but does **not** host inboxes. A made-up address such as
`founder@paysick.co.za` with no mailbox behind it **hard-bounces**. Set
`BRIEF_RECIPIENTS` (comma-separated) to an inbox you actually own — a Google
Workspace / mail-host address on `paysick.co.za`, or a personal email. The daily
brief also renders in the admin dashboard, so a bounced email never loses the
information.

Verify with any DMARC/SPF/DKIM checker (e.g. dig `_dmarc.paysick.co.za TXT`)
after the records propagate.

## Inbound replies → agentic onboarding (Resend)

When a provider replies to an outreach email, Resend delivers it to a webhook
that turns the reply into a human-gated onboarding draft.

> ⚠️ **Until this is connected, replies are invisible to the agent, and that is
> actively harmful rather than merely inert.** `getContactedDueForFollowup` skips
> a lead only when an inbound touch row exists, and inbound rows are created
> solely by this webhook. With it unwired, a provider who replies is never
> flipped to `replied`, so the sequence keeps advancing on them: they get the
> day 3 bump, the day 7 value mail and the day 14 breakup **after they already
> answered you**. If outreach is live, wire this before sending anything further.

### Setup, in order

**1. Point Resend at the endpoint.**
In Resend → Webhooks, add an endpoint:

```
POST https://paysick.co.za/api/outreach/inbound
```

Subscribe it to the inbound email event (`email.received`). Note that inbound
receiving also requires an MX record on the receiving domain, configured in
Resend's inbound settings. Sending and receiving are separate setups; a verified
sending domain does not give you inbound.

**2. Copy the signing secret into Vercel.**
Resend shows a `whsec_…` secret once, at creation. Set it as
`RESEND_WEBHOOK_SECRET` in the Vercel project's environment variables, then
redeploy. Without a redeploy the running function keeps the old environment.

**3. Confirm the reply address is the one you send from.**
Replies land on the `From` address, so `SMTP_FROM` and the address Resend
receives inbound mail for must be the same mailbox (default
`hello@paysick.co.za`). A reply to an address Resend is not receiving for never
reaches the webhook at all, and no amount of correct configuration downstream
will help.

**4. Verify.** Send yourself an outreach email through the Approve Queue, reply
to it, and check that the lead flips to `replied` in the queue and an onboarding
draft appears. If it does not, the endpoint now tells you exactly why.

### Diagnosing a 401

Every rejection used to return the same opaque `BAD_SIGNATURE`, which made a
misconfigured webhook indistinguishable from a forged request. The response now
carries a specific `code`, and the same reason is logged server-side:

| `code` | What it means | Fix |
|---|---|---|
| `NO_WEBHOOK_SECRET` | `RESEND_WEBHOOK_SECRET` is not set on the deployment | Set it in Vercel and redeploy |
| `MISSING_SIGNATURE_HEADERS` | No `svix-id` / `svix-timestamp` / `svix-signature` | The caller is not Resend, or you are testing with a hand-rolled `curl` |
| `RAW_BODY_UNAVAILABLE` | The raw request body was not captured, so the signature cannot be checked | Something upstream consumed the request stream before `express.json()` ran. Use the shared-secret fallback below |
| `SIGNATURE_MISMATCH` | Headers and body are present, but the HMAC does not match | The secret is wrong, or it belongs to a different endpoint. Re-copy it from Resend |

The endpoint never verifies against a re-serialised body. A Svix signature covers
the exact bytes Resend sent, and `JSON.stringify(req.body)` is a different byte
string in all but the luckiest case, so falling back to it would produce a
mismatch that reads like a bad secret and sends you chasing the wrong thing.

### Shared-secret fallback

`x-webhook-secret: <the same secret>` is accepted as an alternative to the Svix
signature. It does not depend on the raw body, so it is the escape hatch if a
runtime makes signature verification impossible. It is strictly weaker (no
replay protection, no body binding), so prefer the Svix path and use this only
if `RAW_BODY_UNAVAILABLE` proves unfixable.

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
