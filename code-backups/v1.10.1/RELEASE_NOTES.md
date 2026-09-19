# Release Notes — v1.10.1

**Release Date**: 2026-09-16
**Version Type**: PATCH — bug fixes only, no new page/feature/API module

## Summary

Hardens the lender-marketplace / Shield Gate 3 code path against three bugs
found in a targeted review: a rate cap that was defined but never enforced,
a race condition that could fund one application twice, and a schema
mismatch that silently disabled the entire Gate 3 lender-matching query.
All three were reproduced with a failing test before any implementation
code changed (CLAUDE.md test-first workflow), then fixed, then proven with
the same test passing. No route, page, or table was added or removed.

## Bug Fixes

- **Rate cap (22.25% APR) is now enforced, not just defined.**
  `LENDER_HARD_RULES.max_rate_apr` in `lender-gate.service.js` existed but
  nothing on the offer-write path called `validateRate()`. It is now
  invoked inside `MarketplaceAuctionService.createLenderOffer()` — the one
  function with write access to `lender_offers` — so a rate above the cap
  is rejected whether it arrives via the lender webhook
  (`POST /api/marketplace/webhooks/offer-response`), ops manual entry
  (`POST /api/marketplace/admin/manual-offers`), or any future caller.
  Both routes now return `400` (was `500`) for this rejection.
  Backed by a new DB `CHECK` constraint (migration `011`) as a
  defense-in-depth backstop against any future code path that writes to
  `lender_offers` directly.

- **Fixed a race condition that could disburse two loans for one
  application.** `MarketplaceAuctionService.acceptOffer()` checked that the
  *offer* being accepted was still `PENDING`, but never checked the
  *application* it belonged to. Two concurrent accepts on two different
  `PENDING` offers for the same application could both pass that check and
  both create a `marketplace_loans` row. `acceptOffer()` now locks the
  parent `loan_applications` row with `SELECT ... FOR UPDATE` inside the
  existing transaction before proceeding; the second of two concurrent
  accepts now sees the application already `OFFER_SELECTED` and fails with
  `409` instead of creating a second loan. Also backed by a DB-level
  backstop: a new unique index on `marketplace_loans(application_id)`
  (migration `011`).

- **Gate 3 lender matching was silently returning zero lenders on every
  call.** `LenderGateService.findEligibleLenders()` and
  `getPortfolioAllocation()` (called from `POST /v2/shield/lender-gate/match`
  and `GET /v2/shield/lender-gate/allocation`) queried columns —
  `l.status`, `l.institution_name` — that don't exist on the real `lenders`
  table (`active` boolean, `name`). Every call threw, was caught, and
  returned `[]`, so Gate 3's concentration and rate-band checks were never
  actually reachable. The same wrong column/status-value assumptions were
  also present in `checkBalanceSheetCapacity()`'s query against
  `marketplace_loans` (`loan_amount` → `principal_amount`;
  lowercase status strings → the real uppercase enum values). All three
  queries now match the schema in `001_marketplace_tables.sql`.

- **`/v2/shield/*` routes (including the two above) had no per-IP rate
  limit.** `server.js` mounted `globalLimiter` on `/api/` and `v1Limiter` on
  `/api/v1`, but nothing on `/v2/shield`. `globalLimiter` is now applied
  there too, per the repo's CLAUDE.md bot-protection requirement that every
  route enforce per-IP rate limiting.

## Testing

`tests/unit/marketplace-lender-gate.test.js` (6 assertions, all written and
confirmed failing before the corresponding fix) — see **Environmental
note** below for why this file uses `node:test` with a hand-rolled
database mock rather than the jest + `config/database` mock pattern used
elsewhere in `tests/integration/`.

## Environmental note

This sandbox has no network access to the npm registry (`npm install`
returns `403`, and no `node_modules` existed at all for either the root or
`backend` package). `pg` and `dotenv` — the two third-party packages
`backend/src/config/database.js` requires at load time — were stubbed
locally under `backend/node_modules/` purely so the real service modules
could be required at all; both stubs are gitignored and were never
intended to reach the repository. `jest` could not be installed either, so
the new test file uses Node's built-in test runner and replaces the
database module's exported `query`/`transaction` functions with an
in-memory recorder by hand, in the same spirit as the existing
`tests/__mocks__/database.js` jest mock. All 671 pre-existing unit tests
that don't require a missing third-party package continue to pass;
`tests/unit/email-service.test.js` fails in this sandbox only because
`nodemailer` is unavailable for the same reason — a pre-existing condition
noted in the v1.10.0 and v1.9.0 architecture docs, unrelated to this change.

## Flagged for a decision — not fixed in this release

While tracing this code path, `marketplace-offers.html` (the page a patient
lands on after applying) was found still titled **"Your Loan Offers"**,
displaying **lender business names and "Annual Rate"** per offer, and
`lender-dashboard.html` still uses loan/lender language throughout. Per
`v1.5.5` (2026-03-27, "Regulatory terminology compliance audit") and
`v1.7.1`–`v1.7.5` (2026-04-15), PaySick's own decision was to remove
"loan"/"lender"/"APR" language from patient-facing surfaces because the
platform is positioned as a payment facilitator, not an NCA-registered
credit provider — and `marketplace-offers.html` is explicitly named in the
`v1.5.5` changelog entry as already fixed. It is not fixed in the live
file. `marketplace-apply.html` (the application form) is clean of this
language, confirming the earlier patches targeted the apply flow only.

This release does not touch that copy: whether `marketplace-offers.html` /
`lender-dashboard.html` are stale pages that should have been retired
alongside the rest of the terminology audit, or the marketplace concept is
now intentionally being reintroduced patient-facing, is a positioning
decision for PaySick to make, not an engineering call to make silently
inside a bug-fix patch. See the parent conversation for the full note.

## Breaking Changes

None.

## Migration Notes

Run migration `011_marketplace_loan_integrity.sql` (adds a `CHECK`
constraint to `lender_offers` and a unique index to `marketplace_loans`;
both are backstops for application-level fixes already in this release —
if the table already contains a rate above 22.25% or an application with
two loans from before this fix, the migration will fail loudly on that
row rather than silently mask it. Resolve any such row before applying.)
