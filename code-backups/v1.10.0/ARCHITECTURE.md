# Architecture — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-08-08

---

## Changes from v1.9.0

One structural addition: a second product line, SANParks Media Licensing, added
as a self-contained module. New route namespace, new services, new schema, new
page. It shares the platform's authentication, rate limiting and bot-protection
layers and nothing else — no table, service or route belonging to the healthcare
facilitation product was modified.

The healthcare platform architecture is unchanged; see
[v1.9.0/ARCHITECTURE.md](../v1.9.0/ARCHITECTURE.md).

---

## Request path

The new surface enters the same Express pipeline, with one added rate-limit
bucket.

```
                    ┌─────────────────────────────────────┐
   HTML pages ─────▶│ Vercel static serving               │
   /index, /login   │  • vercel.json headers:             │
   /research        │    X-Robots-Tag (catch-all)         │
   /sanparks [NEW]  │  • cleanUrls: true                  │
                    │  • /robots.txt                      │
                    └─────────────────────────────────────┘
                              │ hidden honeypot anchors
                              ▼
                       GET /api/hp-check
                              │
   /api/* ────────▶ ┌─────────────────────────────────────┐
                    │ api/index.js  →  Express            │
                    ├─────────────────────────────────────┤
                    │ 1. helmet + CORS                    │
                    │ 2. globalLimiter  (/api/,        100/15m)
                    │ 3. v1Limiter      (/api/v1,       30/15m)
                    │ 4. sanparksLimiter(/api/sanparks, 40/15m) [NEW]
                    │ 5. authLimiter    (login/register)  │
                    │ 6. X-Robots-Tag header              │
                    │ 7. botBlocker  (+16 media harvesters) [UPDATED]
                    │ 8. honeypotBlockMiddleware          │
                    │ 9. route dispatch                   │
                    └─────────────────────────────────────┘
```

`/api/sanparks` gets its own bucket for the same reason `/api/v1` did: these
endpoints are not reads. `POST /licences` executes an irreversible rights
transfer, and `GET /assets` is the single most scrape-attractive path on the
platform.

---

## New: SANParks Media Licensing module

```
backend/src/routes/sanparks.js          all routes require authenticateToken
   │                                    all responses carry X-Robots-Tag
   ├── GET  /plans                      plan catalogue + 12/24-month term pricing
   ├── GET  /subscriptions              caller's subscriptions, status at now
   ├── POST /subscriptions              start a term
   ├── POST /subscriptions/:id/renew    renew (continuity + price-lock rules)
   ├── POST /subscriptions/:id/cancel   stop auto-renewal
   ├── GET  /assets                     catalogue search (preview only)
   ├── GET  /assets/:assetId            one asset
   ├── GET  /assets/:assetId/chain      chain of title + verification result
   ├── POST /quotes                     price a licence, dry run, no writes
   ├── POST /licences                   ── the transaction ──
   └── GET  /licences                   caller's licences
   │
   ├──▶ services/sanparks-subscription.service.js   pure; terms, renewal, credits
   ├──▶ services/sanparks-pricing.service.js        pure; multipliers, splits
   ├──▶ services/sanparks-rights.service.js         pure; conflicts, chain of title
   └──▶ services/sanparks-licensing.service.js      the only stateful one
```

Three of the four services are pure functions over plain objects — no database,
no clock of their own, no I/O. Everything that touches state is concentrated in
`sanparks-licensing.service.js`, which takes its database by injection.

---

## The licensing transaction

This is the part the product is built around: the sale and the transfer of image
rights settle together or not at all.

```
executeLicensingTransaction(input, { db })
   │
   ├─ validate input ──────────────────── throws before the DB is touched
   │
   └─ db.transaction(async client => {
          │
       1. SELECT … FROM sanparks_licences WHERE idempotency_key = $1
          └─ hit ──▶ return the original licence.  No second sale.
          │
       2. SELECT … FROM sanparks_assets WHERE asset_id = $1 FOR UPDATE
          └─ the lock. Taken before exclusivity is evaluated, and before
             any write, so concurrent buyers serialise here.
          │
       3. SELECT … FROM sanparks_subscriptions … FOR UPDATE
          └─ ACTIVE only. GRACE renews but does not buy.
          │
       4. SELECT live grants  ──▶ checkRightsConflicts()
          └─ not ok ──▶ throw RIGHTS_CONFLICT (409).  Nothing written.
          │
       5. priceLicence()  ──▶ applyDownload()  ──▶ read last chain entry
          │
       6. WRITES, all inside the transaction:
             INSERT sanparks_licences
             INSERT sanparks_payments
             INSERT sanparks_rights_chain      ← the rights move here
             UPDATE sanparks_assets            ← only for exclusive / assignment
             INSERT sanparks_revenue_splits ×3
             UPDATE sanparks_subscriptions     ← credit debit
      })
          │
          └─ any throw ──▶ ROLLBACK ──▶ no licence, no payment, no transfer
```

### Why the lock is where it is

Two broadcasters press "buy exclusive" on the same lion-birth clip in the same
second. Without the `FOR UPDATE` at step 2, both read an asset with no live
exclusive grant, both pass the conflict check, and both are told they hold
worldwide exclusivity. With it, the second transaction blocks until the first
commits, then reads the first one's grant at step 4 and is refused.

---

## Rights model

```
                        sanparks_assets
                     rights_status ∈ {AVAILABLE,
                                      EXCLUSIVELY_LICENSED,
                                      ASSIGNED,
                                      WITHDRAWN}
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
    LICENCE            EXCLUSIVE_LICENCE        ASSIGNMENT
  copyright stays      copyright stays        copyright MOVES
  others may licence   market+territory       asset leaves the
                       locked while live      catalogue for good
```

Conflict evaluation, in one pass, reporting every blocker at once:

```
  asset state    ASSET_ASSIGNED · ASSET_WITHDRAWN · EMBARGOED
  entitlement    SCOPE_NOT_IN_PLAN · RESOLUTION_ABOVE_PLAN
                 RESOLUTION_UNAVAILABLE · EXCLUSIVITY_NOT_ELIGIBLE
  releases       MISSING_PROPERTY_RELEASE · MISSING_MODEL_RELEASE
  conservation   SENSITIVE_LOCATION_NOT_REDACTED
  live grants    BLOCKED_BY_EXCLUSIVE_GRANT · EXCLUSIVITY_UNAVAILABLE
```

Overlap semantics: worldwide overlaps everything; two different single countries
do not; personal use competes with no commercial market; distinct commercial
markets do not conflict with each other; a buyout conflicts with everything.

The conservation gate is enforced twice — in `checkRightsConflicts()` and by a
database CHECK constraint (`sensitive_species = false OR geo_redacted = true`),
because a geotagged rhino is a poaching map and application code is not the only
way rows get written.

---

## Chain of title

Each transfer appends a hash-linked entry, so provenance survives the platform.

```
   genesis (64 zeros)
        │
   ┌────▼──────────────────────────┐
   │ seq 1  previous_hash = 000…0  │  event LICENCE_GRANTED
   │        entry_hash    = h1     │  payload {licence, scope, territory, …}
   └────┬──────────────────────────┘
        │
   ┌────▼──────────────────────────┐
   │ seq 2  previous_hash = h1     │  event RIGHTS_ASSIGNED
   │        entry_hash    = h2     │
   └───────────────────────────────┘

   entry_hash = sha256(canonical({assetId, sequence, previousHash,
                                  event, payload, recordedAt}))
```

Canonical serialisation sorts keys recursively, so key order cannot change a
hash while any content change must. `verifyChain()` walks the chain and returns
the sequence number where it first breaks — catching tampering, removal and
re-ordering alike. The rights certificate handed to the buyer carries the same
`entry_hash` that was committed.

---

## Price walk

```
   base (media type × resolution, + per-second for footage)
     × rarity            STANDARD 1.0 · NOTABLE 1.5 · RARE 2.25 · ONCE 3.0
     × demand surge      1.0 + 0.025/unit, capped at 2.5     ← the viral case
     × scope             PERSONAL 1 · EDITORIAL 2 · COMMERCIAL 5
                         · BROADCAST 8 · BUYOUT 25
     × territory         SINGLE 1.0 · REGIONAL 1.5 · WORLDWIDE 2.0
     × licence duration  ONE_YEAR 1.0 · THREE_YEARS 1.8 · PERPETUAL 2.5
   = list
     − subscriber discount (0 / 10 / 20 / 30%, never on a buyout)
   = net  ──┬──▶ + 15% VAT = gross
            │
            └──▶ split:  contributor royalty  40%  (0% if SANParks-captured)
                         platform fee         15%
                         conservation levy    residual — absorbs the rounding
```

Every step rounds to integer cents. The levy taking the residual is what makes
the split reconcile exactly for every input, including a net of 1 cent.

---

## Schema (migration 010)

```
sanparks_subscriptions ──┬── sanparks_subscription_terms   one row per term
                         │                                  bought or renewed
                         │
sanparks_assets ─────────┼── sanparks_licences ──┬── sanparks_revenue_splits
   rights_status         │      idempotency_key  │      levy / royalty / fee
   rights_holder_id      │        UNIQUE         │
   property_release_id   │                       └── sanparks_payments
   model_release_id      │
   sensitive_species ────┘── sanparks_rights_chain
   geo_redacted                 (asset_id, sequence) UNIQUE
   CHECK (not sensitive             entry_hash       UNIQUE
          OR geo_redacted)
```

Partial index `idx_sp_lic_active ON (asset_id, status) WHERE status = 'ACTIVE'`
serves the exclusivity read at step 4, which runs under the row lock on every
sale.

---

## Page inventory

```
  sanparks.html   NEW — plans with a 1-year/2-year toggle, catalogue with
                        filters, licence configurator, priced quote showing
                        every multiplier and the conservation split, and the
                        rights certificate with its chain hash.
                        Linked from the index footer (Company group).
```

The catalogue and the plan grid are empty in the served HTML and populated from
the authenticated API after boot. A headless scraper that fetches the page
receives markup, styling and an explanatory `<noscript>` — no asset, no title, no
price. That is CLAUDE.md's JS-rendering requirement, and on this page it is the
product's perimeter rather than a formality.

---

## Test topology

```
tests/unit/
   ├── sanparks-subscription.test.js    terms, renewal windows, grace, credits
   ├── sanparks-pricing.test.js         multiplier chain, surge cap, split
   ├── sanparks-rights.test.js          conflicts, releases, chain of title
   ├── sanparks-licensing.test.js       atomicity, locking, rollback, idempotency
   ├── sanparks-api-surface.test.js     auth per route, wiring, schema shape
   ├── sanparks-page.test.js            JS-only rendering, honeypot, no prices
   ├── media-scraper-blocklist.test.js  harvester blocklist  [v1.10.0 review]
   └── ... (inherited suites)
```

`sanparks-licensing.test.js` fakes the database by injection and routes queries
on SQL text rather than call order, so it asserts transactional behaviour —
"nothing was written", "the lock preceded the first write" — without a database
and without pinning the implementation's read order.

Runner: `node --test` (`npm test` from `backend/`). 845 assertions passing.

**Environmental note** (unchanged from v1.9.0): `tests/unit/email-service.test.js`
cannot resolve `nodemailer` where `registry.npmjs.org` is unreachable, and fails
there regardless of application code.

---

## Platform architecture (unchanged)

See [v1.9.0/ARCHITECTURE.md](../v1.9.0/ARCHITECTURE.md) for the facilitation API,
Shield gate engine, bot-protection layer and identity validation, and
[v1.8.0/ARCHITECTURE.md](../v1.8.0/ARCHITECTURE.md) for the full platform and
outreach agent. This release inherits all of it without modification.
