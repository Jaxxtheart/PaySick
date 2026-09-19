# Requirements & Specifications — PaySick v1.11.0

**Version**: 1.11.0
**Date**: 2026-09-19

Carries forward all requirements from v1.10.0 and its predecessors, and adds
the requirements below from an executive UX audit of the onboarding →
daily-use customer journey.

---

## New Requirements

### Marketing/documentation accuracy

| ID | Requirement | Priority |
|----|-------------|----------|
| DOC-01 | Repository documentation (README.md) must not state an approval speed or outcome (e.g. "instant", "60 seconds") that the live risk-assessment flow cannot guarantee | Must Have |
| DOC-02 | Repository documentation must state the real reachable amount range enforced by the live application endpoint (`marketplace.js`), not a stale or narrower figure | Must Have |

### Onboarding identity integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| ONB-01 | onboarding.html must never submit a fabricated email address, ID number, or other identity field to the backend | Must Have |
| ONB-02 | A user who reaches onboarding.html without having completed register.html must be redirected to register.html, not routed through a fallback that invents data | Must Have |

### Late-fee transparency

| ID | Requirement | Priority |
|----|-------------|----------|
| FEE-01 | make-payment.html must show any late fee that will be charged (via `GET /payments/:id/fee-preview`) before the user submits payment, not only after on the receipt | Must Have |
| FEE-02 | The fee preview call must be non-fatal — if it fails, payment must still be possible | Must Have |

### Post-payment messaging accuracy

| ID | Requirement | Priority |
|----|-------------|----------|
| MSG-01 | payment-success.html must not claim a dashboard-reflection delay greater than what dashboard.html actually has (currently none — it fetches live) | Must Have |

### Repeat-application growth loop

| ID | Requirement | Priority |
|----|-------------|----------|
| GROW-01 | dashboard.html must present a prominent (main-content, not side-menu-only) call to action for a new/repeat application when the user has zero active plans | Must Have |
| GROW-02 | dashboard.html must present the same prominent call to action when an active plan is ≥66% paid off (payments_made / number_of_payments) | Should Have |
| GROW-03 | The call to action must link to marketplace-apply.html | Must Have |

### Demo-data isolation

| ID | Requirement | Priority |
|----|-------------|----------|
| DEMO-01 | Fabricated demo-mode data (fake balances, fake provider names, fake notifications) must not be hardcoded inline in a production file that also renders real user data | Should Have |
| DEMO-02 | Demo-mode data must load conditionally (only under `isDemoMode()`) and must not affect the real-data code path | Must Have |

---

## Inherited Requirements

All requirements from v1.10.0 remain in effect. See
[v1.10.0/REQUIREMENTS.md](../v1.10.0/REQUIREMENTS.md).

---

## Deprecated Features

None. This release is corrective/additive only. The one behavior removed —
onboarding.html's "legacy direct-onboarding path" — was an unreleased
internal fallback that fabricated identity data on submission; it was never
a documented or intentional product feature, so it does not carry a
deprecation notice per the versioning guide. No route, table, or
customer-facing page was removed.
