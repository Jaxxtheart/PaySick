# Release Notes — v1.10.0

**Date**: 2026-08-08
**Type**: MINOR — new outreach vertical, two new message-gate modules

---

## Summary

The provider outreach plan now targets **dentists** alongside aesthetics, and
every outreach message is rewritten around a single ask: **register the practice
as a provider on the PaySick website**. The 15 minute demo drops to a secondary
option, offered only after the registration link, and anything the practice needs
first goes to **hello@paysick.co.za**.

Two house rules are now enforced in code rather than left to the model, in the
same way the terminology linter and the sign-off already were:

- **No em dashes** in any outreach message, from the subject line through the
  body and the LinkedIn variant.
- **The registration call to action is always present**, above the sign-off.

Both gates run on the initial Claude draft, on every templated follow-up step, on
the onboarding reply to an inbound reply, on any founder edit in the Approve
Queue, and once more at approve time immediately before the message is sent.

---

## Added

### Dentists as an active outreach vertical

- `activeVerticals` is now `['aesthetics', 'dental']`.
- Dental fit weight raised from `0.8` to `1.0`, level with aesthetics.
- Dental sources on six Places search terms instead of one: `dentist`,
  `dental practice`, `dental clinic`, `dental implants`, `orthodontist`,
  `cosmetic dentist`. Practices list themselves inconsistently, and the
  high-ticket work sits under separate listings again.
- `VERTICAL_SEARCH_TERMS` entries may now be a string **or a list**; every term
  in a list is searched per metro (`pipeline.service.js`, Stage 1).
- The daily source cap is now split evenly across active verticals. Without that
  split, aesthetics — first in the list — would consume the whole daily budget
  and no dentist would ever be sourced.
- The drafting prompt gained a dental-specific angle: treatment plans that stall
  on price (implants, crowns, orthodontics, full-mouth work) and the chair slots
  lost with them.

### `backend/src/services/outreach/style.js`

The house-style gate. Strips every em dash, en dash, horizontal bar, figure dash
and minus sign from a message, deterministically:

| Input | Output |
|-------|--------|
| `paid in full — no chasing` | `paid in full, no chasing` |
| `110–150 words` | `110 to 150 words` |
| a dash opening a line | a plain `-` bullet |
| a dash ending a line | removed |

Idempotent, and it leaves ordinary hyphens (`follow-up`, `e-mail`) untouched.

### `backend/src/services/outreach/cta.js`

The call-to-action gate. Guarantees the registration ask is present in every
message, inserted above the `Best, The PaySick Team` sign-off, in a full email
variant and a shorter LinkedIn variant. Idempotent: a message that already
carries the link is returned untouched. The link ends its own line, because a
trailing full stop gets swallowed into the href by mail and DM clients.

---

## Changed

- **`outreach.config.js`** — added `providerRegistrationPath`
  (`/provider-apply.html`), `contactEmail` (`hello@paysick.co.za`), and
  `publicSiteUrl()` / `registrationUrl()` helpers. The registration link's origin
  comes from `PUBLIC_SITE_URL`, falling back to `APP_URL` **only when it is not a
  localhost address**, then to `https://paysick.co.za`, so a local or staging
  origin can never leak into a message sent to a prospect.
- **`claude.service.js`** — the system prompt bans em dashes, makes registering
  the one call to action, demotes the demo to a secondary option, and carries the
  contact address. The registration URL and contact address are passed in the
  user message. Both gates run on the parsed result, so a model that ignores the
  instruction still produces a compliant message.
- **`sequence.service.js`** — all three follow-up steps rewritten without em
  dashes and without pre-empting the call to action. Subjects changed from
  `Quick follow-up — {name}` to `Quick follow up for {name}`, and similarly for
  steps 2 and 3.
- **`routes/outreach.js`** — the Approve Queue edit endpoint re-applies the house
  style and the call to action to a founder's edit before storing it; the approve
  endpoint applies both once more, persists the final copy, and only then sends.
- **`brief.service.js`** — em dashes removed from the daily brief subject and
  heading.

### Security review (required at every MINOR bump, per CLAUDE.md)

- **Blocklist**: added user-triggered fetchers and scraping services that carry
  no `bot` / `crawler` / `spider` token and so passed straight through:
  `Perplexity-User`, `Claude-User`, `meta-externalfetcher`, `Firecrawl`,
  `Webzio-Extended`. (`meta-externalfetcher` also escapes `/fetch\b/`, because
  the token runs on into `fetcher`.) `AI2Bot`, `PanguBot` and `DuckAssistBot`
  named for auditability, plus the `okhttp` and `Apache-HttpClient` libraries.
- **Rate limits**: `/api/outreach` had only the general 100-per-15-minutes
  bucket, despite carrying two routes reachable without a session — the Resend
  inbound webhook and the daily cron route, where one call runs a Places +
  Anthropic pipeline. It now has a dedicated 60-per-15-minutes limiter, mounted
  before the routes.

---

## Tests

Written before the implementation, per CLAUDE.md:

| File | Covers |
|------|--------|
| `tests/unit/outreach-style.test.js` | em/en dash stripping, the CTA gate, sequence copy, and the drafting path end to end |
| `tests/unit/outreach-dental.test.js` | dental config, fit score, multi-term sourcing, and the per-vertical share of the daily cap |
| `tests/unit/bot-blocklist-review-v1.10.0.test.js` | the MINOR-bump blocklist and rate-limit review |

```bash
node --test "tests/unit/*.test.js"
```

---

## Not changed

- The human gate is untouched: the pipeline still only ever produces `draft` or
  `compliance_hold` touches, and approving in the admin queue remains the only
  path to `sent`.
- The terminology linter, POPIA sourcing basis, and audit trail are unchanged.
- No database migration. No change to any patient-facing page.
