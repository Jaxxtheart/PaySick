# Requirements & Specifications — PaySick v1.10.2

**Version**: 1.10.2
**Date**: 2026-09-19

Carries forward all requirements from v1.10.1 and its predecessors. This is
a bug-fix-only release, adding the requirements the lender-notification and
scoring code should have already satisfied.

---

## New Requirements

### Lender notification

| ID | Requirement | Priority |
|----|-------------|----------|
| MKT-08 | A loan package presented to a lender with a `webhook_url` must actually be delivered over HTTP, not merely logged | Must Have |
| MKT-09 | An outbound webhook to a lender must be signed with that lender's decrypted plaintext API key, never the stored AES ciphertext | Must Have |
| MKT-10 | A failed outbound webhook delivery must not raise past the caller, and must not prevent the `lender_notified` audit record from being written | Must Have |
| MKT-11 | Once a patient accepts an offer, every lender who bid on that application — winner and losers — must be notified of the outcome by webhook, if they have one configured | Must Have |
| MKT-12 | Outcome-notification network calls must happen after the accept transaction commits, never while holding the transaction's database connection | Must Have |
| MKT-13 | A single lender's notification failure must not affect delivery to any other lender, and must not fail the accept itself | Must Have |

### Lender scoring — bid coverage

| ID | Requirement | Priority |
|----|-------------|----------|
| MKT-14 | `scoreLender()` must compute `bid_coverage_pct` for every scoring period: offers the lender created, divided by the number of times they were presented a loan package | Must Have |
| MKT-15 | A lender never presented a loan package in the period must score `0`, not `NaN` or `Infinity` | Must Have |
| MKT-16 | Every query against `lender_offers.status` must use a value from the real `lender_offer_status` enum (`PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED`, `WITHDRAWN`) | Must Have |

---

## Inherited Requirements

All requirements from v1.10.1 remain in effect. See
[v1.10.1/REQUIREMENTS.md](../v1.10.1/REQUIREMENTS.md).

---

## Deprecated Features

None.

---

## Open Question Carried Forward (unchanged from v1.10.1 — still not a decision engineering can make)

`marketplace-offers.html` and `lender-dashboard.html` still use loan/lender/APR
language that `v1.5.5` and `v1.7.1`–`v1.7.5` removed from patient-facing
surfaces for NCA-positioning reasons. Not addressed in this release either —
this is a positioning decision for PaySick, not a bug fix. See
`v1.10.1/REQUIREMENTS.md`'s "Open Question Carried Forward" for the full
context.
