# Release Notes — PaySick v1.7.3

**Version**: 1.7.3
**Date**: 2026-04-15
**Type**: PATCH — Copy change: replace "Loan Amount" with "Payment Arrangement" on the application review screen

---

## Summary

The review step of the application form displayed the label "Loan Amount" — a prohibited term under Shield framework LANG-02. Replaced with "Payment Arrangement" to align with approved PaySick terminology.

---

## Changed

### `marketplace-apply.html`
- Review summary label: `Loan Amount` → `Payment Arrangement`
- Internal HTML comment: `<!-- Step 2: Loan Amount -->` → `<!-- Step 2: Payment Arrangement -->`

---

## No Changes To

- API routes or middleware
- Database schema or migrations
- Authentication or session management
- Shield framework underwriting gates
