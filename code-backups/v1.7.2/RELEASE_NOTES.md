# Release Notes — PaySick v1.7.2

**Version**: 1.7.2
**Date**: 2026-04-15
**Type**: PATCH — UI and terms update: cap payment plan slider at R10,000

---

## Summary

Reduced the maximum selectable amount on the `marketplace-apply.html` amount slider from R500,000 to R10,000 per payment plan. Updated the terms of service to reflect the new R10,000 per-payment-plan cap. Default slider value adjusted to R7,500 (midpoint of the new R5,000–R10,000 range); step reduced to R500 for finer control within the narrower range.

---

## Changed

### `marketplace-apply.html`
- Slider `max` attribute: `500000` → `10000`
- Slider `step` attribute: `1000` → `500` (finer increments within the narrower range)
- Slider `value` attribute (default): `50000` → `7500`
- Default display label: `R50,000` → `R7,500`
- Range label right-side: `R500,000` → `R10,000`
- `applicationData.loanAmount` initial value: `50000` → `7500`
- `applyWithAlternative()`: cap changed from `500000` to `10000`

### `terms-of-service.html`
- Section 4.3 Bill Amount Limits: `R500 and R500,000` → `R500 and R10,000 per payment plan`

---

## No Changes To

- API routes or middleware
- Database schema or migrations
- Authentication or session management
- Shield framework underwriting gates
