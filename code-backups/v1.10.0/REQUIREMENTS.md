# Requirements & Specifications — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-08-08

Carries forward all requirements from v1.9.0 and its predecessors, and adds the
requirements below. This release expands the provider outreach plan to dentists
and rewrites every outreach message around one call to action: register as a
provider on the PaySick website.

---

## New Requirements

### Outreach targeting — dentists

| ID | Requirement | Priority |
|----|-------------|----------|
| OUT-20 | Dental must be an active outreach vertical alongside aesthetics | Must Have |
| OUT-21 | Dental must carry a launch-level fit weight (1.0), level with aesthetics | Must Have |
| OUT-22 | A vertical's Places search terms may be a single string or a list; every term in a list must be searched per target metro | Must Have |
| OUT-23 | Dental must source on at least the terms `dentist`, `dental practice`, `dental clinic`, `dental implants`, `orthodontist` and `cosmetic dentist`, because practices list themselves inconsistently | Must Have |
| OUT-24 | The daily source cap must be shared evenly across active verticals, so the first vertical in the list cannot consume the whole daily budget | Must Have |
| OUT-25 | The drafting prompt must carry a dental-specific angle: treatment plans that stall on price, and the chair slots lost with them | Should Have |

### Outreach message rules

| ID | Requirement | Priority |
|----|-------------|----------|
| OUT-30 | Every outreach message must carry exactly one primary call to action: register the practice as a provider on the PaySick website | Must Have |
| OUT-31 | The registration link must be absolute and must point at the provider registration page (`/provider-apply.html`) | Must Have |
| OUT-32 | The 15 minute demo is secondary: it may only be offered after the registration link, never as the main ask | Must Have |
| OUT-33 | Every message must give `hello@paysick.co.za` as the address for anything the practice needs before registering | Must Have |
| OUT-34 | The call to action must be enforced in code, not left to the model: a draft returned without the registration link must have it appended above the sign-off | Must Have |
| OUT-35 | No em dash or en dash may appear anywhere in an outreach message, in the subject line, the body, or the LinkedIn variant | Must Have |
| OUT-36 | Dash removal must be deterministic and idempotent, and must leave ordinary hyphens intact | Must Have |
| OUT-37 | Both gates must run on the initial draft, every follow-up step, the onboarding reply, every founder edit in the Approve Queue, and again at approve time before sending | Must Have |
| OUT-38 | The copy stored on an approved touch must be the copy that was sent, including any styling applied at approve time | Must Have |
| OUT-39 | The registration link's origin must come from `PUBLIC_SITE_URL`, falling back to `APP_URL` only when it is not a localhost address, then to `https://paysick.co.za`, so a local or staging origin can never reach a prospect | Must Have |
| OUT-40 | No punctuation may be glued to the end of the registration link, in any variant, because mail and DM clients swallow it into the href | Must Have |

Note: OUT-35 applies the same no-em-dash rule to outreach that DECK-11 already
applies to investor-deck copy.

### Bot crawling prevention (v1.10.0 review, per BOT-08)

| ID | Requirement | Priority |
|----|-------------|----------|
| BOT-09 | User-triggered fetchers carrying no `bot` / `crawler` / `spider` token must be named explicitly in the blocklist: `Perplexity-User`, `Claude-User`, `meta-externalfetcher`, `Firecrawl`, `Webzio-Extended` | Must Have |
| BOT-10 | `/api/outreach` must carry a rate-limit bucket stricter than the general `/api/` allowance, because the inbound webhook and the cron route are reachable without a session and one cron call runs a Places + Anthropic pipeline | Must Have |

---

## Inherited Requirements

All requirements from v1.9.0 remain in effect. See
[v1.9.0/REQUIREMENTS.md](../v1.9.0/REQUIREMENTS.md).

---

## Deprecated Features

### Demo-first outreach call to action
- Removed in: v1.10.0
- Last available in: v1.9.0 — see `code-backups/v1.9.0/snapshot/backend/src/services/outreach/`
- Reason for removal: the 15 minute demo asked the founder for a diary slot before the practice had committed to anything, and made the funnel depend on scheduling. Registering as a provider is a step the practice can take unattended, the moment the message lands.
- Replacement: the register-as-a-provider call to action (OUT-30 through OUT-34); the demo remains available as a secondary option

### Em dashes in outreach copy
- Removed in: v1.10.0
- Last available in: v1.9.0 — see `code-backups/v1.9.0/snapshot/backend/src/services/outreach/sequence.service.js`
- Reason for removal: house style, and a reliable tell of machine-written copy in a cold outreach message
- Replacement: `services/outreach/style.js`, applied at every stage of the message path (OUT-35 through OUT-37)

### Single-term vertical sourcing
- Removed in: v1.10.0
- Last available in: v1.9.0 — see `code-backups/v1.9.0/snapshot/backend/src/services/outreach/pipeline.service.js`
- Reason for removal: one Places term per vertical missed most of the dental market, which lists itself under several different categories
- Replacement: list-valued `VERTICAL_SEARCH_TERMS` entries (OUT-22, OUT-23). Single-string entries still work and are unchanged for the other verticals.
