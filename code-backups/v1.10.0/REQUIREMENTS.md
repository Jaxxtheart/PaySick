# Requirements & Specifications — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-09-16

Carries forward all requirements from v1.9.0 and its predecessors, and adds
the requirements below for the PaySick Recovery Engine — the automated
collections capability run entirely inside the platform so a partner medical
provider never staffs or operates a collections desk of its own.

---

## New Requirements

### Recovery Engine — case state machine

| ID | Requirement | Priority |
|----|-------------|----------|
| REC-01 | A single authoritative service must resolve a case's stage, Human Review gate requirement, self-cure eligibility, and due message channels from days overdue | Must Have |
| REC-02 | Stages must be: `active`, `pre_collections` (day 1–7), `collections_early` (day 8–29), `collections_mid` (day 31–60), `collections_late` (day 61–90), `resolution` (day 91+) | Must Have |
| REC-03 | The Human Review & Compliance gate must be mandatory from day 30 onward, and for every case in `resolution` | Must Have |
| REC-04 | A case must resolve to exactly one of `cured`, `restructured`, `write_off`, or `open` | Must Have |
| REC-05 | `write_off` must require both the day-91+ resolution threshold and an explicit human approval — never automatic | Must Have |
| REC-06 | The stage/message logic must compose the existing `CollectionsMessagingService`, not duplicate its escalation ladder | Must Have |

### Promise-to-pay

| ID | Requirement | Priority |
|----|-------------|----------|
| PTP-01 | A patient must be able to record a self-service promise to pay a specific amount by a specific date | Must Have |
| PTP-02 | A promise for more than the outstanding balance, or dated in the past, must be rejected | Must Have |
| PTP-03 | Money amounts must be integer cents — no floating-point currency arithmetic (CLAUDE.md convention, `money.js`) | Must Have |
| PTP-04 | A promise is `kept` once the promised amount (or more) has been paid, on or before the promised date | Must Have |
| PTP-05 | A promise is `broken` once its due date has passed with an unmet balance | Must Have |

### Restructure offers

| ID | Requirement | Priority |
|----|-------------|----------|
| RST-01 | A restructure offer must spread the remaining balance evenly across a new term, rounding the monthly instalment up so the plan never under-collects | Must Have |
| RST-02 | No restructuring may increase total cost to the patient by more than 25% over the original outstanding amount | Must Have |
| RST-03 | The 25% cap must be a single shared constant used by both the collections restructure path and the existing post-disbursement `OutcomeGateService` — never duplicated | Must Have |
| RST-04 | An offer exceeding the cap must be marked not approvable and must not be auto-accepted | Must Have |

### Credit bureau reporting

| ID | Requirement | Priority |
|----|-------------|----------|
| BUR-01 | Arrears must be reportable to a registered credit bureau once a case reaches 30 days overdue | Must Have |
| BUR-02 | A case below the threshold must never be reported | Must Have |
| BUR-03 | The bureau adapter must be swappable for a live NCR-registered bureau integration without changing calling code | Must Have |

### External referral (registered debt collector / attorney)

| ID | Requirement | Priority |
|----|-------------|----------|
| EXT-01 | An external referral must never be triggered automatically — it always requires an explicit human approval | Must Have |
| EXT-02 | A referral must only be eligible once a case is 90+ days overdue | Must Have |
| EXT-03 | A referral must only be eligible above a minimum outstanding-balance floor (R500), below which the estimated recovery cost of an external partner is assumed to exceed the recoverable amount | Must Have |
| EXT-04 | The partner type must be restricted to `registered_debt_collector` or `attorney` (Debt Collectors Act 114 of 1998) | Must Have |

### Provider collections visibility

| ID | Requirement | Priority |
|----|-------------|----------|
| PROV-COL-01 | A provider must be able to see an aggregate collections summary for their own book: overdue payment count, open case count, cured count, cure rate | Must Have |
| PROV-COL-02 | The endpoint must never return patient-level detail — no name, ID number, cell number, or per-patient balance | Must Have |
| PROV-COL-03 | The endpoint must require authentication and the `provider` role, following the existing `/dashboard/*` pattern | Must Have |
| PROV-COL-04 | The endpoint must be registered ahead of the public `/:id` single-provider lookup | Must Have |
| PROV-COL-05 | The response must state explicitly that this is a reputational, read-only summary and that no provider action is required | Must Have |

---

## Inherited Requirements

All requirements from v1.9.0 remain in effect. See
[v1.9.0/REQUIREMENTS.md](../v1.9.0/REQUIREMENTS.md).

---

## Deprecated Features

None. This release is additive only — no existing feature, route, or table
was removed. `collections-messaging.service.js`, `outcome-gate.service.js`,
and the `collections` table remain in active use and are composed by, not
replaced by, the Recovery Engine.
