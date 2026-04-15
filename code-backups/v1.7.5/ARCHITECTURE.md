# Architecture — PaySick v1.7.5

**Version**: 1.7.5
**Date**: 2026-04-15

---

## Changes from v1.7.4

No backend architectural changes. Frontend-only patch.

### Application Submission Flow (updated)

```
Patient submits application
    │
    ▼
submitApplication() → demo mock response
    │
    ├── response.paymentPlan          ← NEW (replaces previewOffers array)
    │       amount, monthlyInstalment, term, status: PENDING_APPROVAL
    │
    └── Render post-submission screen
            │
            ├── Single PaySick arrangement card (amount / instalment / term / ref / status badge)
            │
            ├── Link → admin-review-queue.html   ← NEW ("Pending system approval")
            │
            └── Link → provider-dashboard.html   ← NEW ("Pending disbursement")
```

### Removed

- `previewOffers` array in demo mock (3 fake lender cards: MediFinance SA, HealthCredit Plus, CareCapital)
- Multi-card offer renderer
- "Notify Me When Lenders Are Available" button

---

## Inherited Architecture

All components from v1.7.4 remain unchanged. See [v1.7.4/ARCHITECTURE.md](../v1.7.4/ARCHITECTURE.md) for the full inherited architecture.
