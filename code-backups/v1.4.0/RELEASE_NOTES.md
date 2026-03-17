# Release Notes — PaySick v1.4.0

**Version**: 1.4.0
**Date**: 2026-03-16
**Type**: MINOR — Provider charge and patient late-payment fee

---

## Summary

Introduces the platform's fee model: providers are charged a flat 5% service fee on every settlement payout, and patients who miss a scheduled payment are charged a 5% late fee per full calendar month the payment remains overdue. Regular on-time payments carry zero interest. All fee logic is centralised in a new `fee.service.js` module and wired into the existing payment and provider settlement flows.

---

## Added

- **`backend/src/services/fee.service.js`** (new):
  - `PROVIDER_SERVICE_FEE_PCT = 0.05` — flat 5% deducted from provider settlement gross amount
  - `PATIENT_LATE_FEE_PCT_PER_MONTH = 0.05` — 5% per full calendar month a patient payment is overdue
  - `PATIENT_BASE_INTEREST_RATE = 0.00` — no interest on regular (on-time) patient payments
  - `calculateLateFee(originalAmount, daysOverdue)` — computes months late, late fee amount (compounding), and total due
  - `calculateProviderSettlement(grossAmount)` — returns gross, service fee, and net payout amounts

- **`backend/src/routes/payments.js`** — late fee integration:
  - `POST /:payment_id/pay`: calculates days overdue on payment date; applies 5% compounding late fee per month; records `late_fee` on the `payments` row; logs a separate `fee` transaction line in the `transactions` table; response includes `late_fee` breakdown
  - `POST /admin/process-overdue` (admin): bulk-marks all scheduled payments past their due date as `overdue` and updates `late_fee` column — intended for nightly cron
  - `GET /:payment_id/fee-preview` (auth): returns the current late fee preview for a payment (months late, fee amount, total due, 0% interest note)

- **`backend/src/routes/providers.js`** — settlement routes:
  - `GET /admin/:id/settlements` (admin): lists all settlements for a provider including service fee percentage
  - `POST /admin/:id/settle` (admin): creates a new settlement for a list of approved applications; deducts 5% service fee per line item; stores gross, commission (5% fee), and net amounts in `settlements` and `settlement_items` tables

- **`provider-apply.html`** — "How You Get Paid" section:
  - Added before the application form: provider tier table (New Provider → Premium) with payout timelines matching the trust tier definitions in `provider-gate.service.js`
  - Service fee disclosure box: "A flat 5% service fee is deducted from each settlement payout"
  - Updated commission agreement checkbox: now reads "5% service fee" instead of the previous "2-5% based on volume"
  - Added CSS styles for payout table, fee notice box, and footnote

- **`payments.html`** — fee policy banner and overdue card updates:
  - Fee policy banner above tabs: "No interest charged" + 5% late fee warning
  - Overdue payment cards now show: OVERDUE badge, late fee amount, months late, total due (base + fee)
  - Payment history cards now show late fee line if `late_fee > 0` on the paid record

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/services/fee.service.js` | **New** — central fee configuration and calculation helpers |
| `backend/src/routes/payments.js` | Added late fee calculation on pay; overdue bulk-processing endpoint; fee preview endpoint |
| `backend/src/routes/providers.js` | Added settlement creation and listing endpoints with 5% fee deduction |
| `provider-apply.html` | Added "How You Get Paid" section, tier table, fee disclosure, updated checkbox |
| `payments.html` | Added fee policy banner, overdue card late fee display, history late fee display |

---

## No Breaking Changes

Existing API contract is fully backwards-compatible. The `late_fee` column on `payments` already existed in the schema (defaulting to `0.00`). Settlement tables (`settlements`, `settlement_items`) existed in the schema — no schema migration required.
