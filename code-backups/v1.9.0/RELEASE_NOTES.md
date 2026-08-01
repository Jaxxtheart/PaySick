# Release Notes — v1.9.0

**Date**: 2026-08-01
**Type**: MINOR — new API surface, new page, new security modules

---

## Summary

A branch-reconciliation release. The repository had accumulated 31 remote
branches, 7 of which carried commits that had never reached `main`. Some of that
work was genuinely missing from the running platform, some had been superseded by
later work on `main`, and some conflicted with decisions `main` had since taken.

This version lands what was genuinely missing, deliberately drops what was
superseded, and records the reasoning so the same branches are not re-litigated.

Nothing was force-merged: every ported change was re-tested against the current
tree, and three pieces of branch work were rejected on inspection rather than
merged (see **Deliberately not merged** below).

---

## Added

### `/api/v1` facilitation surface
From `claude/setup-paysick-api-ZhJ7v`, unmerged since May. `main` carried this
work's `v1.8.0` snapshot but never the source, so the entire surface was missing
from the running platform.

- `POST /api/v1/applications`
- `POST /api/v1/decisions/:applicationId`
- `POST /api/v1/payouts/:applicationId`
- `GET  /api/v1/schedules/:applicationId`
- Services: `shield-gates`, `schedule`, `provider-scoring`, `webhook-dispatcher`
- Adapters: `debicheck`, `dsp-check`, `income-verification`
- `backend/src/utils/money.js`
- Migration `009_v1_api_surface.sql` (renumbered from `008` — it collided with
  `008_outreach_agent.sql` already on `main`)

All four endpoints sit behind `authenticateToken`, the `/api/` global limiter, a
new dedicated v1 limiter, the bot blocker and the honeypot block list.

### Bot-crawling protections
Partly from `claude/paysick-codebase-audit-q127cz` (PR #47), partly new.

- `robots.txt` at the repository root — `main` had none at all, a standing
  CLAUDE.md violation
- `backend/src/middleware/bot-blocker.js` — User-Agent fingerprint blocklist
- `backend/src/middleware/honeypot.js` and the `GET /api/hp-check` trap
- `vercel.json` catch-all `X-Robots-Tag` header. `server.js` already set this
  header, but that code never runs for statically served HTML pages, which is
  every marketing and application page on the site.
- Hidden honeypot anchors on `index`, `login`, `register`, `providers`,
  `investor-deck` and `research`. The trap handler existed but nothing linked to
  it, so no crawler could ever reach it.

### Server-side SA ID validation
`backend/src/utils/sa-id.js` — shape, embedded date of birth, future-date
rejection, citizenship digit and Luhn checksum, cross-checked against the
declared `date_of_birth`.

`register.html` had validated all of this in the browser for some time, but
`POST /api/users/register` only ever asserted `/^\d{13}$/`, and the `users` table
only constrains `LENGTH(sa_id_number) = 13`. Anything posting straight at the API
could register with a structurally impossible ID.

The logic originates in `claude/verify-full-id-number-DzmMD`, which implemented
it inside `onboarding.html` in January. That page has since moved to collecting
the last four digits only, so the work had never reached anywhere that enforces
it.

### Shield™ risk-engine slide (investor deck, slide 12 of 17)
Taken from `claude/update-paysick-investor-deck-v9VKG` without the business-model
pivot it was bundled with. Describes the five gates that actually ship in
`shield-gates.service.js`: Provider, Affordability, Urgency, Tariff, Circuit
Breaker. Tests assert each named gate has a matching constant in that service, so
the slide cannot drift into overclaiming.

Deck renumbered from 16 to 17 slides across counters, nav dots and the
`downloadPPTX()` generator.

### `/research` page
From `claude/add-white-paper-section-rRW63`, without its payload. The branch
published White Paper V4; the changelog now references V6.0 as current, so the
page ships stating that no paper is published yet and offering a contact route,
rather than a stale document or a dead download button.

---

## Changed

- **Rate limits**: added buckets on `POST /forgot-password` and
  `POST /resend-verification` (5/hour each), and a dedicated 30-per-15-minutes
  bucket on `/api/v1`, which previously inherited only the general
  100-per-15-minutes allowance despite triggering payouts.
- **Bot blocklist review** (required by CLAUDE.md on every MINOR bump): twenty AI
  training and retrieval crawlers named explicitly. Most were already caught
  incidentally by the generic `/bot\b/` pattern, but `anthropic-ai`,
  `Google-Extended`, `Meta-ExternalAgent`, `cohere-ai` and `omgili` carry no
  "bot" token and were passing straight through.
- **`POST /forgot-password`** no longer returns 500 when the email send fails.
  A distinct error response for registered addresses versus unknown ones leaked
  which addresses exist.
- **Email links** use clean URLs (`/reset-password`, `/verify-email`) rather than
  `.html`, matching `cleanUrls: true` in `vercel.json`.
- **`api-client.js`** gained `users.refreshToken()`.
- **`index.html`** footer gained a Company group linking to Research and Contact.

---

## Deliberately not merged

Three pieces of branch work were rejected rather than ported.

1. **Atomic reset-token update/insert with a partial unique index**
   (`claude/paysick-codebase-audit-q127cz`, v1.8.3). `main` commit `5a800fc`,
   one day newer, deliberately stopped invalidating prior unused tokens so that
   re-requesting a reset link does not kill the first email. The proposed
   `UNIQUE (user_id) WHERE used = false` index would have reintroduced exactly
   that bug.

2. **The direct balance-sheet funding pivot**
   (`claude/update-paysick-investor-deck-v9VKG`, April). Would have replaced the
   marketplace model with balance-sheet funding at an R30M ask. `main`'s July
   deck deliberately kept the marketplace narrative and had already been through
   a market-sizing correction. Only the Shield IP slide was taken.

3. **The legal-page rewrite** (`claude/update-terms-of-service-Xncc6`, January).
   `main`'s legal pages were written independently in March and then passed
   through the v1.5.5 regulatory terminology compliance audit and a deliberate
   removal of credit-licensing references. Re-introducing the January copy would
   have undone that audit.

Additionally, `claude/paysick-marketplace-migration-Drzb4`'s provider dashboard
was not ported: `main`'s `provider-dashboard.html` is backend-wired, while the
branch's is a mock-data prototype.

---

## Testing

Test-first throughout, per CLAUDE.md. Five new suites, each confirmed red before
implementation:

| Suite | Red before | Green after |
|-------|-----------|-------------|
| `static-bot-protection.test.js` | 13 | 13 |
| `sa-id-validation.test.js` | all (missing module) | 27 |
| `investor-deck-shield.test.js` | 17 of 23 | 23 |
| `research-page.test.js` | 11 of 14 | 14 |
| `bot-blocklist-review.test.js` | 12 of 29 | 29 |

Full suite: **609 pass, 1 fail**.

The single failure is `tests/unit/email-service.test.js`, which cannot resolve
`nodemailer`. It is pre-existing and environmental: this environment's egress
policy blocks `registry.npmjs.org`, so backend dependencies cannot be installed.
It fails identically on `main` at the commit this work branched from.

Two implementation bugs were found by the tests rather than by review:

- The ported SA ID validator hardcoded its century pivot at `22`, which had
  already rotted — a 2024-born applicant would have decoded as born in 1924.
  Replaced with `resolveBirthYear()`, derived from the current year.
- The first draft of the bot-blocklist test wrapped each crawler token in a
  `+https://example.com/bot` comment URL, which by itself trips `/bot\b/`. That
  made 24 of 29 cases pass vacuously and hid all five real gaps.
