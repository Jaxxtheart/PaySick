# Release Notes — PaySick v1.7.1

**Version**: 1.7.1
**Date**: 2026-04-15
**Type**: PATCH — Copy change: align application page heading with Shield framework approved terminology

---

## Summary

Replaced the word "Finance" in the `marketplace-apply.html` page heading and `<title>` with "Payment Plan" — the term mandated by the Shield framework's LANG-01 language compliance requirement. The old heading "Apply for Medical Finance" used generic financial industry language that is inconsistent with the approved PaySick terminology set and the rest of the site copy (e.g. "healthcare payment arrangement" in `marketplace-offers.html`, "Healthcare payments made simple" site-wide).

---

## Changed

### `marketplace-apply.html`
- `<title>`: `Apply for Medical Finance - PaySick` → `Apply for a Medical Payment Plan - PaySick`
- `<h1>`: `Apply for Medical Finance` → `Apply for a Medical Payment Plan`

---

## No Changes To

- API routes or middleware
- Database schema or migrations
- Authentication or session management
- Any other frontend pages
- Shield framework gates or underwriting logic
