# Architecture — PaySick v1.10.1

**Version**: 1.10.1
**Date**: 2026-09-16

---

## Changes from v1.10.0

No structural change — no route, table, or service was added or removed.
Three existing functions were corrected to match rules and schemas that
already existed elsewhere in the codebase but weren't being honored.

---

## Policy Gate — rate cap enforcement (new chokepoint, not a new service)

```
Before v1.10.1:                          After v1.10.1:

 webhook ──┐                              webhook ──┐
 manual  ──┼─▶ createLenderOffer()        manual  ──┼─▶ createLenderOffer()
 (future    │      │                      (future    │      │
  auto-bid) │      ▼                       auto-bid) │      ▼
            │  INSERT lender_offers                  │  lenderGateService
            │  (any rate 0–100% passes)               │    .validateRate(rate)
                                                       │      │
                                          rate > 22.25%│      │ rate <= 22.25%
                                                 400 ◀─┘      ▼
                                                        INSERT lender_offers
                                                        (backed by DB CHECK,
                                                         migration 011)
```

`lender-gate.service.js`'s `validateRate()` already existed and already
held the correct cap constant. It was simply never called from the one
place that writes an offer. No new module was introduced — the existing
Gate 3 service is now imported by `marketplace-auction.service.js`
(`marketplace-auction.service.js:16, 365`).

---

## acceptOffer() — row lock added to close a double-disbursement race

```
Before:                                   After:

BEGIN                                     BEGIN
 SELECT offer WHERE status='PENDING'       SELECT offer WHERE status='PENDING'
 UPDATE offer → ACCEPTED                   SELECT application FOR UPDATE  ◀── new
 UPDATE other offers → DECLINED              status already OFFER_SELECTED?
 UPDATE application → OFFER_SELECTED           → 409, ROLLBACK            ◀── new
 INSERT marketplace_loans                    else:
COMMIT                                       UPDATE offer → ACCEPTED
                                              UPDATE other offers → DECLINED
Two concurrent transactions on two           UPDATE application → OFFER_SELECTED
different PENDING offers for the             INSERT marketplace_loans
same application both reach COMMIT          COMMIT
unimpeded → two loans.
                                           The second transaction's FOR UPDATE
                                           blocks until the first COMMITs, then
                                           sees OFFER_SELECTED and backs out.
```

Backed by `uq_marketplace_loans_one_per_application` (migration `011`) as
a database-level backstop independent of this code path.

---

## Gate 3 schema alignment

`lender-gate.service.js` was written against columns that were never part
of `001_marketplace_tables.sql`:

```
Query assumed              Real column (001_marketplace_tables.sql)
─────────────────          ─────────────────────────────────────────
l.status = 'active'    →   l.active = true
l.institution_name      →   l.name
ml.loan_amount           →   ml.principal_amount
status IN ('funded',    →   status IN ('PENDING_DISBURSEMENT','ACTIVE',
  'active','repaying')       'CURRENT','DELINQUENT','DEFAULT','RESTRUCTURED')
```

Every one of these queries was wrapped in a `try/catch` that logged a
warning and returned an empty result, so the mismatch never surfaced as a
crash — `findEligibleLenders()` always returned `[]`, and
`checkBalanceSheetCapacity()` always reported 0% utilization. Both now
return real data against the same seed fixtures used elsewhere in the
test suite.

---

## Rate limiting

```
/api/*        → globalLimiter   (existing)
/api/v1       → v1Limiter       (existing)
/v2/shield/*  → globalLimiter   (new — server.js)
```

---

## Test topology

```
tests/unit/
   └── marketplace-lender-gate.test.js   [NEW] rate cap, accept-race lock,
                                          lender-gate schema — 6 assertions
   └── ... (all v1.10.0 suites, unchanged)
```

**Environmental note**: this sandbox could install no `node_modules` at
all (`npm install` → `403` from the registry, unreachable even directly).
Every other version's test suite assumed jest + a mocked
`config/database` module would be available for DB-backed logic; that
path doesn't exist here. `pg` and `dotenv` are stubbed locally under
`backend/node_modules/` (gitignored) so `config/database.js` can load, and
the new test file replaces its exported `query`/`transaction` with an
in-memory recorder by hand, then requires the real service modules — the
same effective mock as `tests/__mocks__/database.js`, written without
jest. A future environment with registry access can port this file to the
jest + `tests/integration/` pattern verbatim; the assertions don't change.

---

## Platform architecture (unchanged from v1.10.0)

See [v1.10.0/ARCHITECTURE.md](../v1.10.0/ARCHITECTURE.md) for the full
request path, bot-protection layer, and Recovery Engine, which this
release inherits without modification.

---

## Flagged, not architected here

`marketplace-offers.html` presents itself to patients as a loan-offer
comparison page (`<title>Your Loan Offers</title>`, per-offer lender name
and "Annual Rate"), and `lender-dashboard.html` is built around the same
loan/lender vocabulary throughout. This conflicts with the positioning
decision recorded in `v1.5.5/RELEASE_NOTES.md` and reaffirmed in
`v1.7.1`–`v1.7.5`, which removed that exact language from patient-facing
surfaces because PaySick is not represented as an NCA-registered credit
provider. No architecture change is proposed here for those two pages —
see `REQUIREMENTS.md`'s "Open Question Carried Forward" for why this is a
positioning decision, not a v1.10.1 engineering task.
