# Release Notes — v1.10.2

**Release Date**: 2026-09-19
**Version Type**: PATCH — bug fixes only, no new page/feature/API module

## Summary

Fixes the three gaps surfaced while diagramming a lender's actual path
through the marketplace engine (the "Lender Flow" diagram): the outbound
lender webhook was never actually sent, a lender was never told whether
they won or lost a bid, and the bid-coverage hard rule had no code
computing it. Each was reproduced with a failing test before the fix
(CLAUDE.md test-first workflow). While fixing bid coverage, a fourth
instance of the same schema/status-vocabulary bug class fixed in v1.10.1
was found and fixed in the same function.

## Bug Fixes

- **The lender webhook is now actually sent.** `sendLoanPackageToLender()`
  had the real `fetch()` call commented out and only logged what it would
  have sent. It now performs the POST for real, and signs it correctly:
  the commented-out code would have signed with `lender.api_key_encrypted`
  (the AES ciphertext) directly — the same class of bug already fixed on
  the *inbound* `validateWebhookSignature` middleware in an earlier
  release. It now decrypts the stored key first via
  `decryptBankingData()`, matching the inbound fix. A failed delivery is
  caught and logged; it does not stop the auction loop or the
  `lender_notified` audit entry.

- **A lender now learns whether they won or lost.** `acceptOffer()` used to
  flip every other `PENDING` offer on the application to `DECLINED` in
  the database with no outside notice. It now reads every offer + lender
  on the application (winner and losers) inside the same transaction that
  decides the outcome, and — once the transaction has committed, so a
  slow or unreachable lender webhook can never hold open the DB
  transaction or undo an already-accepted loan — sends each lender with a
  `webhook_url` a signed `offer.won` or `offer.lost` event. Notification
  failures are caught per-lender (`Promise.allSettled`) and never fail
  the accept itself.

- **`bid_coverage_pct` is now computed and persisted.**
  `LENDER_HARD_RULES.min_bid_coverage_pct` (30%) existed as a constant and
  `lender_scores.bid_coverage_pct` existed as a column, but nothing wrote
  to it. `scoreLender()` now computes it as: offers the lender actually
  created in the period, divided by the number of times they were
  presented a loan package in that period (the `lender_notified` audit
  event written by `sendLoanPackageToLender()`), as a percentage — 0 when
  a lender was never presented anything, rather than dividing by zero.

- **Found while fixing the above, in the same function:**
  `scoreLender()`'s approval-rate query filtered on
  `status = 'funded'`, which is not a value the `lender_offer_status`
  enum has ever had (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`,
  `WITHDRAWN` — see `001_marketplace_tables.sql`). Every lender's
  approval rate and funded-loan count silently computed as zero. Now
  filters on `status = 'ACCEPTED'`, the same schema-alignment fix already
  made to two other queries in this file in v1.10.1.

## Testing

`tests/unit/marketplace-lender-gate.test.js` grew from 6 to 12 assertions,
each new one written and confirmed failing before its corresponding fix.
See the file's header comment for the full bug list (six now, three from
v1.10.1 plus these three).

## Environmental note

Same sandbox constraints as v1.10.1: no npm registry access, `pg` and
`dotenv` stubbed locally under `backend/node_modules/` (gitignored). This
release additionally required `security.service.js` to load for real
AES-256-GCM encrypt/decrypt round-trips in the new webhook-signing tests;
it has no further third-party dependencies, so no new stub was needed.
`security.service.js` falls back to a *freshly random* 32-byte key on
every call when `ENCRYPTION_KEY` isn't set, which would silently break
any encrypt-then-decrypt round trip across two calls — the test file
pins `process.env.ENCRYPTION_KEY` to a fixed value for the life of the
test process to avoid that. 677 of 678 unit tests pass;
`tests/unit/email-service.test.js` still fails only because `nodemailer`
is unavailable in this sandbox, unrelated to this change (noted in
v1.9.0 through v1.10.1's architecture docs).

## Breaking Changes

None. `lender_offers` and `marketplace_audit_log` are read, not altered.
`lender_scores.bid_coverage_pct` already existed in the schema
(`004_shield_underwriting.sql`) — this release is the first to write to it.

## Migration Notes

None — no schema change in this release.
