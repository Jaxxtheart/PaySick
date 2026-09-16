# Requirements & Specifications — PaySick v1.10.1

**Version**: 1.10.1
**Date**: 2026-09-16

Carries forward all requirements from v1.10.0 and its predecessors. This is
a bug-fix-only release — no requirement below replaces or removes anything
in v1.10.0/REQUIREMENTS.md; it adds the hardening rules that Gate 3 /
marketplace code should have already satisfied.

---

## New Requirements

### Marketplace / Gate 3 — offer integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| MKT-01 | Every write to `lender_offers`, regardless of caller (lender webhook, ops manual entry, future auto-bidder), must pass through a single function that enforces the 22.25% APR marketplace rate cap before insert | Must Have |
| MKT-02 | A rate above the cap must be rejected with a client error (`400`), not persisted, and not silently clamped | Must Have |
| MKT-03 | `lender_offers.interest_rate` must additionally be constrained at the database level, independent of application code | Must Have |
| MKT-04 | Accepting an offer must lock the parent application for the duration of the accept transaction; a second concurrent accept on a different offer for the same application must fail (`409`), not create a second loan | Must Have |
| MKT-05 | `marketplace_loans` must have at most one row per `application_id`, enforced at the database level | Must Have |
| MKT-06 | Every query in `lender-gate.service.js` must reference columns that exist on the tables defined in `001_marketplace_tables.sql` — no query may rely on a column name, table name, or status value invented independently of the migration | Must Have |
| MKT-07 | `/v2/shield/*` routes must sit behind the same per-IP rate limiting as `/api/*`, per the platform-wide CLAUDE.md bot-protection requirement | Must Have |

---

## Inherited Requirements

All requirements from v1.10.0 remain in effect. See
[v1.10.0/REQUIREMENTS.md](../v1.10.0/REQUIREMENTS.md).

---

## Deprecated Features

None. This release changes no public route shape, removes no table or
column, and adds no new one beyond the two integrity constraints in
migration `011`.

---

## Open Question Carried Forward (not a v1.10.1 requirement — flagged for a product/legal decision)

`v1.5.5` (REQ context: NCA-01 in that era's audit) required that no
patient-facing surface use loan/lender/APR/credit-provider language.
`marketplace-offers.html` and `lender-dashboard.html` currently violate
that requirement as shipped in this and every prior snapshot back through
at least v1.7.5. This release does not change that requirement's status —
it neither re-affirms nor repeals it — because that is a positioning
decision, not a bug fix. A future version must either (a) bring those two
pages into compliance with the existing NCA-01-equivalent requirement, or
(b) formally supersede it if PaySick's registration/partnership status has
changed since 2026-03-27, with that supersession recorded here explicitly.
