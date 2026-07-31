# Release Notes — v1.8.0
**Release Date**: 2026-07-26
**Version Type**: MINOR

## Summary
Adds the **Daily Provider Outreach Agent** — a daily, human-gated agent that
fills the top of the provider-acquisition funnel. Each run it sources target
practices (Google Places), enriches and scores them for fit, drafts compliant
personalised outreach via Claude, schedules follow-ups, and compiles a founder
brief. The send is human-gated: the agent only ever produces `draft` /
`compliance_hold` touches; approving a draft in the new admin Approve Queue is
the sole path that sends it. This is a non-destructive, additive layer that
references the existing `providers` entity.

## New Features
- **Additive data model** (`backend/src/migrations/008_outreach_agent.sql`):
  `outreach_providers` (pre-onboarding lifecycle, FK → `providers(provider_id)`),
  `outreach_touches` (every interaction + status transitions), `outreach_runs`
  (one row per daily run). Auto-applied on startup; no existing column altered.
- **Config module** (`backend/src/config/outreach.config.js`) — verticals,
  metros, source/draft caps, sequence cadence, sender + brief recipients,
  per-vertical fit weights and Places search terms. Switching the launch vertical
  is a one-constant change.
- **Five-stage pipeline** (`pipeline.service.js`) + composable stage services:
  Places sourcing/enrichment (`places.service.js`), transparent fit scoring
  (`scoring.service.js`), Claude drafting (`claude.service.js`), the terminology
  linter compliance gate (`compliance.service.js`), follow-up sequencing
  (`sequence.service.js`), daily brief (`brief.service.js`), and a data-access
  repo (`repo.js`).
- **Secured daily cron route** — `GET/POST /api/outreach/daily` guarded by
  `CRON_SECRET`; registered as a Vercel Cron entry at `0 5 * * *`.
- **Admin Approve Queue** — `admin-approve-queue.html` + `/api/outreach/*` API:
  Approve / Edit / Reject / Mark-replied, a funnel snapshot, and a dry-run
  trigger. Reuses existing admin auth (`authenticateToken` + `requireAdmin`) and
  brand tokens (navy `#1B2A4A`, pink `#EF476F`, Arial).
- **Test-first coverage** — `tests/unit/outreach-compliance.test.js`,
  `outreach-scoring.test.js`, `outreach-pipeline.test.js` (17 assertions; the
  pipeline test locks the no-send invariant and the compliance-hold routing).

## Changed
- `backend/src/server.js` — mounts `/api/outreach`; adds it to the root endpoint list.
- `vercel.json` — adds the `crons` entry for the daily route.
- `api-client.js` — adds a `PaySickAPI.outreach.*` client namespace.
- `admin-dashboard.html` — adds an "Outreach Approve Queue" nav link.
- `backend/.env.example` — documents `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, optional `ANTHROPIC_TEMPERATURE`, and `CRON_SECRET`.

## Inbound replies + agentic onboarding (§5)
- Added `POST /api/outreach/inbound` — a Resend inbound-reply webhook verified by
  its Svix signature (`RESEND_WEBHOOK_SECRET`). On a matched reply it flips the
  lead to `replied`, halts the sequence, records the inbound touch, and generates
  a human-gated onboarding-prompting draft (compliant + signed "Best, The PaySick
  Team", with the onboarding link) into the Approve Queue. Nothing is auto-sent;
  approving an onboarding reply does not reset the lead into the sequence.
- New `inbound.service.js` (`verifyResendSignature`, `parseInboundEmail`) and
  `claude.service.generateOnboardingReply`; config `onboardingLink`
  (default `/provider-apply.html`); `server.js` captures the raw body for
  signature verification. Test-first: `tests/unit/outreach-inbound.test.js`.

## Enforced sign-off + hardened no-credit language
- All generated and templated outreach messages are signed exactly
  "Best, The PaySick Team" (enforced in code via `signoff.js`), and the drafting
  prompts carry an explicit zero-credit-language rule. See
  `tests/unit/outreach-signoff.test.js`.

## Fixed (auth-token key consistency)
- Corrected a pre-existing `localStorage` key mismatch: login stores the token
  under `paysick_auth_token`, but eight pages read `auth_token` and so sent no
  `Authorization` header — the API replied 401 and the page redirected to
  `/login.html` (appearing to "log the user out" on open). Their logout handlers
  also cleared only `auth_token`, leaving the real session behind. Fixed on
  `admin-approve-queue`, `admin-benchmarks`, `admin-billing-agreements`,
  `admin-circuit-breaker`, `admin-eob-reconciliation`, `admin-review-queue`,
  `provider-billing-agreement`, and `tariff-disclosure`: they now read
  `paysick_auth_token` (with `auth_token`/session fallbacks) and clear both keys
  plus `paysick_user` on logout. Two pages that read the user object from `user`
  now read `paysick_user` first.

## Fixed (password reset "invalid or already used")
- `forgot-password` force-invalidated every previously-issued unused token on
  each request. Requesting a link twice — or an accidental double-fire of the
  request — killed the first email's link, so clicking it returned "Reset link is
  invalid or has already been used" on the first legitimate attempt. Tokens are
  already single-use and expire in 1 hour, so the blanket pre-invalidation was
  unnecessary. Extracted issuance into `backend/src/services/password-reset.service.js`
  (`issueResetToken`) which inserts a single-use token and no longer invalidates
  prior ones; unexpired links now coexist. Covered by
  `tests/unit/password-reset-issue.test.js` (test-first).

## Removed
- Nothing. Fully additive.

## Compliance notes
- The terminology linter (§6.3) runs on every draft before queuing, on every
  edit, and defensively at approve time. A denied term routes the touch to
  `compliance_hold`, never to send. A `compliance_hold` cannot be approved until
  edited clean.
- Sourcing draws public business contact details only (POPIA, §2.2); each lead
  carries a `consent_basis`; `do_not_contact` is honoured before drafting.
- No autonomous sending; every touch and transition is auditable in
  `outreach_touches`.

## New environment variables
`GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default
`claude-sonnet-5`), optional `ANTHROPIC_TEMPERATURE`, `CRON_SECRET`. The daily
brief reuses the existing `SMTP_*` settings.
