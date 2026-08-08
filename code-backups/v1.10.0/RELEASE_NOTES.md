# Release Notes — v1.10.0

**Release Date**: 2026-08-08
**Version Type**: MINOR — new page, new API module, new services, new schema

---

## Summary

SANParks Media Licensing: a second product line on the PaySick platform. It sells
subscription access to imagery and footage captured across South African National
Parks, and — the requirement that shaped the whole design — it transfers and
records the image rights **in the same transaction as the sale**.

Access is a fixed term the subscriber renews: 12 or 24 months, with the two-year
term discounted against two annual terms. Licences are bought against that
subscription. Each licence is priced from the asset's rarity, its live demand, and
the rights actually being acquired (scope, territory, duration), then settled as a
single atomic unit: licence, payment, revenue split, rights mutation and a
hash-linked chain-of-title entry all commit together, or none of them do.

The demand mechanism exists for the case in the brief. When footage of a lioness
giving birth generates worldwide demand, the surge multiplier registers that
demand — but it is capped at 2.5×, so a viral asset stays quotable instead of
turning the catalogue into an auction. And when two broadcasters press "buy
exclusive" on the same clip in the same second, the asset row is locked before
exclusivity is evaluated, so the second one is refused rather than both being told
they own it.

The module is prefixed `sanparks_` throughout — separate schema, separate route,
separate services. It shares the platform's authentication, rate limiting and bot
protections and nothing else.

---

## New Features

### Subscription engine (`sanparks-subscription.service.js`)

- Four tiers — Supporter, Creator, Commercial, Broadcast & Rights — each bounding
  the licence scopes, the deliverable resolution, the subscriber discount and
  whether exclusivity may be acquired at all.
- 12- and 24-month terms only. The 24-month term carries a 12.5% discount.
- **Continuity rules.** Renewing before expiry, or inside the 30-day grace window,
  backdates the new term to the old expiry date, so no uncovered gap appears
  behind a licence already granted. Renewing after grace starts fresh from today.
- Renewing before expiry locks the expiring term's price for one further term of
  the same length; renewing in grace does not, and a term-length change re-quotes.
- Unused credits carry forward on a continuous renewal and are forfeited otherwise.
- Grace permits renewal but **not** new licensing — a grant inside an uncovered
  window is a grant with no paid term behind it.

### Pricing engine (`sanparks-pricing.service.js`)

- Base rate by media type and resolution; footage priced per second beyond the
  first 30.
- A fixed multiplier chain in integer basis points: rarity → demand surge → scope
  → territory → licence duration, then the plan's subscriber discount, then VAT.
- Demand surge capped at 2.5×.
- A full buyout receives no subscriber discount — it is a sale of rights, not a
  catalogue download.
- **Revenue split at the point of sale**: conservation levy to SANParks,
  contributor royalty, platform fee. The levy takes the residual, so the three
  parts reconcile to the net exactly, whatever the rounding does. Media captured
  by SANParks staff pays no third-party royalty; that share goes to conservation.

### Rights engine (`sanparks-rights.service.js`)

- Instruments: ordinary licence, exclusive licence, and assignment (full buyout,
  which moves the copyright and takes the asset off the catalogue permanently).
- Conflict detection over live grants: an exclusive grant blocks overlapping
  grants; exclusivity cannot be sold over grants already live; a buyout cannot be
  sold while anything at all is live.
- Territory and scope overlap semantics — worldwide overlaps everything, personal
  use competes with no commercial market, distinct markets do not conflict.
- Entitlement gates from the subscriber's plan: scope, resolution ceiling,
  exclusivity eligibility.
- **Conservation gates**: commercial use of imagery captured on SANParks land
  requires a property release; identifiable people require a model release; and no
  asset featuring a species at poaching risk is released with its location
  metadata intact, at any scope, to anyone.
- Hash-linked **chain of title** per asset with `verifyChain()` — tamper, removal
  and re-ordering are all detected — plus a rights certificate carrying the
  verification hash and the restrictions the buyer is bound by.

### Licensing transaction (`sanparks-licensing.service.js`)

One `db.transaction()`: idempotency check → asset locked `FOR UPDATE` →
subscription loaded and gated → live grants read and conflicts evaluated → priced
→ licence, payment, chain entry, asset rights mutation, revenue splits and credit
debit written. A rights conflict aborts before any write is issued; a failure at
any write rejects and the whole thing rolls back. A replayed idempotency key
returns the original licence instead of selling twice.

### API surface (`/api/sanparks`)

`GET /plans`, `GET|POST /subscriptions`, `POST /subscriptions/:id/renew`,
`POST /subscriptions/:id/cancel`, `GET /assets`, `GET /assets/:assetId`,
`GET /assets/:assetId/chain`, `POST /quotes`, `POST /licences`, `GET /licences`.

Every endpoint requires authentication — including the plan list, because a media
catalogue is the most scrape-attractive surface on the platform.

### Frontend

`sanparks.html` — plans with a 1-year/2-year toggle, catalogue with filters, a
licence configurator (scope, territory, duration, resolution, exclusivity), a
priced quote showing every multiplier and the conservation split, and the rights
certificate with its chain-of-title hash. Plans and catalogue are fetched from the
authenticated API after boot; **no price and no asset exists in the served HTML**.

### Schema

Migration `010_sanparks_media.sql`: `sanparks_subscriptions`,
`sanparks_subscription_terms`, `sanparks_assets`, `sanparks_licences`,
`sanparks_rights_chain`, `sanparks_revenue_splits`, `sanparks_payments`, plus a
seed catalogue of eight assets. A database-level constraint enforces the sensitive
species rule: `sensitive_species = false OR geo_redacted = true`.

---

## Changed

- **Bot blocklist review** (required at every MINOR bump): 16 bulk media
  downloaders and image harvesters added — `gallery-dl`, `yt-dlp`, `youtube-dl`,
  `HTTrack`, `Offline Explorer`, `Teleport Pro`, `WebCopier`, `WebZIP`,
  `SiteSucker`, `aria2`, `img2dataset`, `TinEye`, `PetalBot`, `Screaming Frog`,
  `WebReaper`, `Xenu Link Sleuth`. None carries a "bot" token, so none was caught
  by the generic pattern. This is the class of tool that matters most to a
  licensing catalogue.
- **Rate-limit review**: `/api/sanparks` gets its own 40-per-15-minutes bucket
  rather than the general 100-request read allowance, on the same reasoning that
  gave `/api/v1` its bucket at v1.9.0 — these endpoints execute irreversible
  rights transfers.
- `api-client.js` gained a `sanparks` module.
- Index footer Company group gained a SANParks Media Licensing link.

---

## Tests

236 new assertions, every one written before its implementation and confirmed
failing first, per CLAUDE.md:

| File | Assertions | Covers |
|------|-----------|--------|
| `sanparks-subscription.test.js` | 41 | terms, discounts, renewal windows, grace, price lock, credits |
| `sanparks-pricing.test.js` | 37 | multiplier chain, surge cap, split reconciliation to the cent |
| `sanparks-rights.test.js` | 56 | conflicts, releases, conservation gates, chain of title |
| `sanparks-licensing.test.js` | 31 | atomicity, row locking, rollback, idempotency |
| `sanparks-api-surface.test.js` | 22 | auth on every route, wiring, schema shape |
| `sanparks-page.test.js` | 18 | JS-only rendering, honeypot, robots meta, no static prices |
| `media-scraper-blocklist.test.js` | 31 | harvester blocklist, no regressions, rate bucket |

Suite total: 845 passing.

---

## Removed / Deprecated

Nothing. No existing feature was changed or removed.

---

## Breaking Changes

None. The module is additive: new tables, a new route namespace, a new page.

---

## Migration Notes

- `010_sanparks_media.sql` is applied automatically by the boot-time migration
  runner. Every statement is idempotent (`IF NOT EXISTS`; the seed uses
  `ON CONFLICT (reference) DO NOTHING`), so re-application is safe.
- No environment variables were added.
- Existing data is untouched.
