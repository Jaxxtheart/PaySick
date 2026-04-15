# Release Notes — PaySick v1.7.5

**Version**: 1.7.5
**Date**: 2026-04-15
**Type**: PATCH — UI change: replace multi-lender preview cards with single PaySick payment arrangement card and dashboard links

---

## Summary

The post-submission screen previously showed three fake lender offer cards (MediFinance SA, HealthCredit Plus, CareCapital). This has been replaced with a single PaySick payment arrangement summary card showing the actual arrangement details (amount, monthly instalment, term, reference, pending status), plus two direct links into the admin review queue and provider dashboard so the application is immediately visible to both as pending approval.

---

## Changed

### `marketplace-apply.html`

**Demo mock response:**
- Removed `previewOffers` array (3 fake lender cards)
- Added `paymentPlan` object containing: `amount`, `monthlyInstalment`, `term`, `procedureType`, `status: 'PENDING_APPROVAL'`
- Updated `marketplaceStatus.message` to reflect PaySick direct disbursement
- Updated `nextSteps` to reflect admin approval and provider notification workflow

**Post-submission rendering:**
- Replaced multi-card offer renderer with single PaySick arrangement card (shows amount, monthly instalment, term, ref, "Pending Approval" badge)
- Added "Admin Review Queue" link → `admin-review-queue.html` (logged as pending system approval)
- Added "Provider Dashboard" link → `provider-dashboard.html` (logged as pending disbursement)
- Hid the "View My Application" button (replaced by dashboard links)
- Updated success message fallback copy
- Updated toast: `'Application submitted and logged for admin approval.'`

---

## No Changes To

- API routes or middleware
- Database schema or migrations
- Shield framework underwriting gates
- Admin or provider dashboard backend logic
