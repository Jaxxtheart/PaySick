# Requirements & Specifications — PaySick v1.7.5

**Version**: 1.7.5
**Date**: 2026-04-15

Carries forward all requirements from v1.7.4 with the following additions.

---

## New Requirements

### Post-Submission Application Visibility

| ID | Requirement | Priority |
|----|-------------|----------|
| APP-01 | After a patient submits an application, the post-submission screen must display a single PaySick payment arrangement summary card (not multiple lender offer cards) | Must Have |
| APP-02 | The arrangement card must display: arrangement amount, monthly instalment, term, application reference, and "Pending Approval" status badge | Must Have |
| APP-03 | The post-submission screen must include a direct link to the Admin Review Queue (`admin-review-queue.html`) labelled "Logged as pending system approval" | Must Have |
| APP-04 | The post-submission screen must include a direct link to the Provider Dashboard (`provider-dashboard.html`) labelled "Application logged as pending disbursement" | Must Have |
| APP-05 | No fake or mock lender offer cards may appear in the post-submission flow | Must Have |

---

## Inherited Requirements

All requirements from v1.7.4 remain in effect. See [v1.7.4/REQUIREMENTS.md](../v1.7.4/REQUIREMENTS.md) for the full set.

---

## Deprecated Features

### Multi-Lender Preview Offer Cards
- Removed in: v1.7.5
- Last available in: v1.7.4 — see code-backups/v1.7.4/snapshot/
- Reason for removal: PaySick handles all disbursements directly; fake lender cards (MediFinance SA, HealthCredit Plus, CareCapital) were misleading and no longer appropriate
- Replacement: Single PaySick payment arrangement card with admin/provider dashboard links
