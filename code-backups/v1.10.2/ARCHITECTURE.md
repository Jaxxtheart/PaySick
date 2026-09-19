# Architecture — PaySick v1.10.2

**Version**: 1.10.2
**Date**: 2026-09-19

---

## Changes from v1.10.1

No structural change — no route, table, or service added or removed. Two
existing functions gained real network I/O they were missing, and a third
query was corrected to the real schema.

---

## Lender webhook delivery — from stub to real call

```
Before v1.10.2:                          After v1.10.2:

sendLoanPackageToLender()                 sendLoanPackageToLender()
   │                                         │
   ├─ console.log(payload)                  ├─ apiKey = decryptBankingData(
   │   (nothing sent)                       │              lender.api_key_encrypted)
   │                                        ├─ signature = generateWebhookSignature(
   └─ logAuditEvent('lender_notified')      │              apiKey, payload)
                                             ├─ fetch(lender.webhook_url, { ...,
                                             │           headers: {'X-PaySick-Signature':
                                             │                     signature}, body })
                                             │      (caught — failure doesn't propagate)
                                             └─ logAuditEvent('lender_notified')
```

The commented-out code this replaced would have signed with
`lender.api_key_encrypted` directly — the AES ciphertext, not the
plaintext key the lender actually holds and would verify against. That
mirrors the exact bug already fixed on the *inbound* side
(`validateWebhookSignature` in `routes/marketplace.js`, fixed before
v1.10.0): both directions now decrypt before signing/verifying.

---

## acceptOffer() — win/loss notification, after commit

```
BEGIN
 ... existing accept logic (lock, update offers, insert loan) ...
 SELECT offer_id, status, lender_id, name, webhook_url, api_key_encrypted
   FROM lender_offers JOIN lenders
   WHERE application_id = $1                                    ◀── new
COMMIT
                                                                  ◀── network I/O starts
notifyOfferOutcomes(offers)                                          only here, never
   for each offer with a webhook_url, in parallel:                   inside the transaction
     event = status === 'ACCEPTED' ? 'offer.won' : 'offer.lost'
     signed POST to webhook_url  (Promise.allSettled — one
                                   lender's failure doesn't
                                   affect the others, or the
                                   already-committed accept)
```

The read happens inside the transaction (so it sees this transaction's own
`ACCEPTED`/`DECLINED` writes); the notification fan-out happens strictly
after `COMMIT`, so a slow or dead lender endpoint can never hold open a
database connection or transaction.

---

## Bid coverage — computed, not just defined

```
scoreLender(lenderId, periodStart, periodEnd)
   │
   ├─ lender_offers WHERE lender_id, created_at BETWEEN period
   │     → total_offers, funded_count (status = 'ACCEPTED' — was 'funded',
   │                                    a value the enum never had)
   │
   ├─ marketplace_audit_log WHERE action='lender_notified'                ◀── new
   │     AND new_values->>'lenderId' = lenderId, created_at BETWEEN period
   │     → presented_count
   │
   └─ bid_coverage_pct = presented_count > 0
                          ? total_offers / presented_count * 100
                          : 0
        → INSERT INTO lender_scores (..., bid_coverage_pct, ...)
```

`lender_notified` is written by `sendLoanPackageToLender()` for every
non-balance-sheet lender a loan package was actually presented to
(`marketplace-auction.service.js`, existing behavior, unchanged) — this
release is the first to read that log back out for anything.

The `status = 'funded'` → `status = 'ACCEPTED'` correction in the same
query is the fourth instance of the schema/status-vocabulary mismatch
class first documented in `v1.10.1/ARCHITECTURE.md` ("Gate 3 schema
alignment") — found while touching this exact query for the bid-coverage
work, not a separate investigation.

---

## Test topology

```
tests/unit/marketplace-lender-gate.test.js
   [existing]  rate cap, accept-race lock, lender-gate schema — 6 assertions
   [new]       webhook delivery + signing — 2 assertions
   [new]       win/loss notification — 2 assertions
   [new]       bid coverage computation — 2 assertions
   total: 12 assertions, all in this one file
```

**Environmental note**: unchanged from v1.10.1 — no `node_modules` could be
installed in this sandbox. This release additionally exercises
`security.service.js`'s real AES-256-GCM `encrypt`/`decrypt` (no stub
needed — it has no third-party dependency beyond `config/database.js`,
already stubbed). Its encryption key falls back to a fresh random value
per call when `ENCRYPTION_KEY` is unset, which would break an
encrypt-then-decrypt round trip across two separate calls within a test;
the test file pins `process.env.ENCRYPTION_KEY` for its process lifetime
to avoid that — a test-only value, never used for anything persisted.

---

## Platform architecture (unchanged from v1.10.1)

See [v1.10.1/ARCHITECTURE.md](../v1.10.1/ARCHITECTURE.md) for the Policy
Gate, the `acceptOffer()` row lock, and the Gate 3 schema alignment this
release builds on directly.

---

## Flagged, not architected here (carried forward from v1.10.1)

Same open item: `marketplace-offers.html` and `lender-dashboard.html` still
present loan/lender language to patients, which conflicts with the
positioning decision in `v1.5.5`/`v1.7.1`–`v1.7.5`. Not touched in this
release — see `v1.10.1/ARCHITECTURE.md`'s "Flagged, not architected here".
