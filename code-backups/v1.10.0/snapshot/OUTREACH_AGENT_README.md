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
| `backend/src/config/outreach.config.js` | `OUTREACH_CONFIG` — verticals, metros, caps, sequence cadence, sender/brief recipients, registration link + contact address. |
| `backend/src/services/outreach/compliance.service.js` | Terminology linter (§6.3) — the compliance gate. |
| `backend/src/services/outreach/style.js` | House style gate: strips em/en dashes from every message. |
| `backend/src/services/outreach/cta.js` | Guarantees the register-as-a-provider call to action on every message. |
| `backend/src/services/outreach/scoring.service.js` | Transparent fit scoring (§6.2). |
| `backend/src/services/outreach/claude.service.js` | Anthropic Messages API drafting wrapper (§6.1). |
| `backend/src/services/outreach/places.service.js` | Google Places sourcing + enrichment (Stages 1-2). |
| `backend/src/services/outreach/sequence.service.js` | Follow-up sequence copy + scheduling (§6.4). |
| `backend/src/services/outreach/brief.service.js` | Daily brief composer + delivery (§6.5). |
| `backend/src/services/outreach/repo.js` | Data-access layer over the existing `pg` client. |
| `backend/src/services/outreach/pipeline.service.js` | The 5-stage orchestrator. |
| `backend/src/routes/outreach.js` | Cron route + admin Approve-Queue API. |
| `admin-approve-queue.html` | The human gate: Approve / Edit / Reject / Mark-replied. |
| `tests/unit/outreach-*.test.js` | Test-first coverage for the linter, scorer, pipeline, house style, CTA, and the dental vertical. |

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
| `PUBLIC_SITE_URL` | *Optional.* Origin used for the provider-registration link in outreach copy. Falls back to `APP_URL` (ignored when it is localhost), then `https://paysick.co.za`. |

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

## Active verticals

```js
activeVerticals: ['aesthetics', 'dental'],
```

**Dentists** are an active vertical alongside aesthetics. Dental sources on six
Places search terms rather than one (`dentist`, `dental practice`, `dental
clinic`, `dental implants`, `orthodontist`, `cosmetic dentist`), because
practices list themselves inconsistently and the high-ticket work sits under
separate listings again. A vertical's `VERTICAL_SEARCH_TERMS` entry may be a
single string or a list; every term in a list is searched per metro. Dental
carries a `1.0` fit weight, the same as aesthetics.

To switch or add a vertical, edit `activeVerticals` in
`backend/src/config/outreach.config.js`. No other code change is required —
targeting, scoring weights, and Places search terms all key off this value.

---

## Message rules (enforced in code, not left to the LLM)

- **One call to action: register as a provider.** Every message asks the practice
  to register on the PaySick site at `providerRegistrationPath`
  (`/provider-apply.html`). The **15 minute demo is secondary** and is only ever
  offered after the registration link. Anything the practice needs first goes to
  **hello@paysick.co.za**, which every message carries.
  `services/outreach/cta.js` appends the ask above the sign-off on any draft that
  comes back without it, on the initial draft, every follow-up step, the
  onboarding reply, and again at approve time.
- **No em dashes.** No em dash or en dash may appear in an outreach message, from
  the subject line through the body and the LinkedIn variant.
  `services/outreach/style.js` strips them deterministically (comma between
  clauses, `to` in numeric ranges, hyphen bullet at the start of a line) on every
  generated draft, every template, every founder edit, and once more at approve
  time.
- **Sign-off** is always exactly `Best, The PaySick Team` (`signoff.js`).

The registration link's origin comes from `PUBLIC_SITE_URL`, falling back to
`APP_URL` when that is not a localhost address, and to `https://paysick.co.za`
otherwise — a staging origin can never leak into a message sent to a prospect.

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
