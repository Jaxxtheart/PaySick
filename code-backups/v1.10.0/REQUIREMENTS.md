# Requirements & Specifications — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-08-08

Carries forward all requirements from v1.9.0 and its predecessors, and adds the
requirements below. This release introduces SANParks Media Licensing: a
subscription-based licensing product for imagery and footage captured on SANParks
property, in which the transfer of image rights settles in the same transaction as
the sale.

---

## New Requirements

### Subscription (SUB)

| ID | Requirement | Priority |
|----|-------------|----------|
| SUB-01 | Media library access must be sold as a fixed-term subscription that the subscriber renews | Must Have |
| SUB-02 | The only valid terms are 12 and 24 months; any other term must be rejected | Must Have |
| SUB-03 | A 24-month term must be discounted against two 12-month terms, and must cost less per month | Must Have |
| SUB-04 | Four plan tiers must exist — Supporter, Creator, Commercial, Broadcast & Rights — with strictly ascending prices | Must Have |
| SUB-05 | Each plan must declare the licence scopes it may buy, its resolution ceiling, its download credits and its subscriber discount | Must Have |
| SUB-06 | Exclusive rights and full buyouts must be available on the top tier only | Must Have |
| SUB-07 | Subscription status must be derived from dates: PENDING → ACTIVE → GRACE → LAPSED, with CANCELLED overriding | Must Have |
| SUB-08 | A grace window of 30 days must follow expiry, during which renewal is still treated as continuous | Must Have |
| SUB-09 | Renewal must open 60 days before expiry; renewing earlier must be refused | Must Have |
| SUB-10 | A continuous renewal must start the new term at the old expiry date, so no uncovered gap can sit behind a granted licence | Must Have |
| SUB-11 | Renewing after grace must start a fresh term from today, with no price lock and no credit carry-over | Must Have |
| SUB-12 | Renewing before expiry must lock the expiring term's price for one further term of the same length; a term-length change must re-quote | Must Have |
| SUB-13 | Unused credits must carry forward on a continuous renewal and be forfeited otherwise | Must Have |
| SUB-14 | A subscription in GRACE may renew but must not acquire new licences | Must Have |
| SUB-15 | A cancelled subscription must not be renewable, and cancellation must not void the paid term or any licence already granted under it | Must Have |
| SUB-16 | Every term bought or renewed must be persisted, so the covered period behind any historical licence can be reconstructed | Must Have |
| SUB-17 | Month arithmetic must clamp to the last day of a shorter target month (31 Jan + 1 month → 28/29 Feb) | Must Have |

### Pricing (PRICE)

| ID | Requirement | Priority |
|----|-------------|----------|
| PRICE-01 | All money must be stored and calculated as integer cents; no floating-point monetary values anywhere in the module | Must Have |
| PRICE-02 | A licence price must be the base rate walked through a fixed chain: rarity → demand surge → scope → territory → licence duration | Must Have |
| PRICE-03 | Base rates must vary by media type and delivered resolution; footage must be priced per second beyond the first 30 | Must Have |
| PRICE-04 | Demand surge must rise with 30-day demand and must be capped, so a viral asset stays quotable | Must Have |
| PRICE-05 | The surge cap must not exceed 3× | Must Have |
| PRICE-06 | Licence scope, territory and duration must each escalate the price monotonically | Must Have |
| PRICE-07 | The subscriber discount must be set by plan tier and must not apply to a full rights buyout | Must Have |
| PRICE-08 | VAT must be 15% of net, and gross must equal net plus VAT, all as integers | Must Have |
| PRICE-09 | Net must be split at the point of sale into a conservation levy, a contributor royalty and a platform fee | Must Have |
| PRICE-10 | The three split components must reconcile to the net exactly for every input; rounding must be absorbed by the levy, never created or lost | Must Have |
| PRICE-11 | The conservation levy must be the largest single share of a contributor sale | Must Have |
| PRICE-12 | Media captured by SANParks staff must pay no third-party royalty; that share must go to conservation | Must Have |
| PRICE-13 | A negotiated contributor royalty that would push the conservation levy below its 10% floor must be rejected | Must Have |
| PRICE-14 | Personal and editorial downloads must consume subscription credits; commercial and above must be cash sales | Must Have |
| PRICE-15 | Pricing must be deterministic — identical inputs must produce identical cents | Must Have |
| PRICE-16 | The quote must expose every step of the walk, so it can be shown to the buyer and reconciled afterwards | Must Have |

### Rights (RIGHTS)

| ID | Requirement | Priority |
|----|-------------|----------|
| RIGHTS-01 | A grant must be one of three instruments: LICENCE, EXCLUSIVE_LICENCE or ASSIGNMENT | Must Have |
| RIGHTS-02 | A full buyout must assign the copyright, move the rights holder and remove the asset from the catalogue permanently | Must Have |
| RIGHTS-03 | An asset whose copyright has been assigned must never be licensed again by SANParks | Must Have |
| RIGHTS-04 | Withdrawn and embargoed assets must not be licensable | Must Have |
| RIGHTS-05 | A live exclusive grant must block any new grant overlapping it in market and territory | Must Have |
| RIGHTS-06 | Exclusivity must not be granted over grants that are already live in an overlapping market and territory | Must Have |
| RIGHTS-07 | A buyout must not be sold while any grant at all is live on the asset | Must Have |
| RIGHTS-08 | Worldwide territory must overlap every territory; two different single countries must not overlap | Must Have |
| RIGHTS-09 | Personal use must not conflict with any commercial market; distinct commercial markets must not conflict with each other | Must Have |
| RIGHTS-10 | Expired and revoked grants must stop blocking; perpetual exclusive grants must block indefinitely | Must Have |
| RIGHTS-11 | A scope or resolution outside the subscriber's plan must be refused, not silently upsold | Must Have |
| RIGHTS-12 | Commercial exploitation of imagery captured on SANParks property must require a signed property release | Must Have |
| RIGHTS-13 | Assets showing identifiable people must require a model release for commercial use | Must Have |
| RIGHTS-14 | An asset featuring a species at poaching risk must not be released with location metadata intact, at any scope, to any licensee | Must Have |
| RIGHTS-15 | RIGHTS-14 must additionally be enforced by a database constraint, not by application code alone | Must Have |
| RIGHTS-16 | All applicable blockers must be reported at once, each with a code and a human-readable message | Must Have |
| RIGHTS-17 | Every rights transfer must append a hash-linked entry to the asset's chain of title | Must Have |
| RIGHTS-18 | Chain hashing must be canonical — key order must not change the hash, and any content change must | Must Have |
| RIGHTS-19 | Chain verification must detect tampering, removal and re-ordering, and must report where the chain breaks | Must Have |
| RIGHTS-20 | Every licence must issue a rights certificate carrying the chain verification hash and the restrictions binding the buyer | Must Have |

### Licensing transaction (TXN)

| ID | Requirement | Priority |
|----|-------------|----------|
| TXN-01 | The sale and the transfer of rights must occur in a single database transaction | Must Have |
| TXN-02 | The asset row must be locked FOR UPDATE before exclusivity is evaluated, and before any write | Must Have |
| TXN-03 | A rights conflict must abort before any write is issued | Must Have |
| TXN-04 | A failure at any write must reject, so the licence, the payment, the rights mutation and the chain entry all roll back together | Must Have |
| TXN-05 | The licence, the payment, the revenue split rows and the chain-of-title entry must be written in the same transaction | Must Have |
| TXN-06 | A buyout must update the asset's rights holder and status inside that same transaction | Must Have |
| TXN-07 | A replayed idempotency key must return the original licence without writing a second licence or taking a second payment | Must Have |
| TXN-08 | The idempotency key must be unique at the database level, not only in application code | Must Have |
| TXN-09 | Invalid input must be rejected before the database is touched | Must Have |
| TXN-10 | An expired, cancelled, or another user's subscription must not be spendable | Must Have |
| TXN-11 | Credits must be debited in the same transaction; a shortfall must be billed as overage rather than failing the sale | Must Have |
| TXN-12 | The certificate's verification hash must be the hash actually committed to the chain | Must Have |

### API and page (SPAPI / SPUI)

| ID | Requirement | Priority |
|----|-------------|----------|
| SPAPI-01 | The platform must expose `/api/sanparks` covering plans, subscriptions, renewal, cancellation, catalogue, quotes, licences and chain of title | Must Have |
| SPAPI-02 | Every `/api/sanparks` endpoint must require authentication, including the plan list and the catalogue | Must Have |
| SPAPI-03 | Every `/api/sanparks` response must carry `X-Robots-Tag` with all five directives | Must Have |
| SPAPI-04 | `/api/sanparks` must carry a rate-limit bucket stricter than the general `/api/` allowance, because these endpoints execute irreversible rights transfers | Must Have |
| SPAPI-05 | The catalogue must never expose the deliverable file, only its preview | Must Have |
| SPAPI-06 | Licensing failures must be returned with the status and blocker detail the service reports | Must Have |
| SPUI-01 | `sanparks.html` must use the shared site header, footer and legal links | Must Have |
| SPUI-02 | The page must offer both renewable term lengths with a term selector | Must Have |
| SPUI-03 | Plan pricing and catalogue content must be fetched from the authenticated API at runtime; neither may exist in the served HTML | Must Have |
| SPUI-04 | No formatted rand amount may appear in the page's static markup | Must Have |
| SPUI-05 | The page must carry the robots meta and a hidden honeypot link, per BOT-02 and BOT-05 | Must Have |
| SPUI-06 | The page must state how rights transfer works and surface the rights certificate and chain of title | Must Have |
| SPUI-07 | Users without JavaScript must be told why the page is empty rather than shown a blank page | Should Have |

### Bot protection review at v1.10.0

| ID | Requirement | Priority |
|----|-------------|----------|
| BOT-09 | Bulk media downloaders and image harvesters must be blocked by name — they carry no "bot" token and are not caught by the generic pattern | Must Have |
| BOT-10 | The blocklist must not produce false positives against real browser User-Agents | Must Have |

---

## Inherited Requirements

All requirements from v1.9.0 remain in effect. See
[v1.9.0/REQUIREMENTS.md](../v1.9.0/REQUIREMENTS.md).

BOT-08 ("the blocklist and rate-limit thresholds must be reviewed at every MINOR
or MAJOR bump, and that review must be expressed as tests") was satisfied for this
release by `tests/unit/media-scraper-blocklist.test.js`.

---

## Deprecated Features

Nothing was deprecated or removed in v1.10.0. The release is purely additive.

All deprecations recorded in v1.9.0 remain in force — see
[v1.9.0/REQUIREMENTS.md](../v1.9.0/REQUIREMENTS.md#deprecated-features) for
client-only SA ID validation, pre-invalidation of unused password-reset tokens,
the rejected investor-deck balance-sheet pivot, the rejected January legal-page
copy, and the rejected mock-data provider dashboard.
