# Release Notes — PaySick v1.7.4

**Version**: 1.7.4
**Date**: 2026-04-15
**Type**: PATCH — Copy change: replace lender marketplace messaging with PaySick direct disbursement messaging

---

## Summary

Until external lenders are onboarded, PaySick handles all fund disbursements directly. All user-facing copy on the application flow that referenced the lender marketplace ("network of lenders", "best rate", "multiple offers") has been replaced with copy that accurately reflects PaySick as the direct funder.

---

## Changed

### `marketplace-apply.html`
- **"What happens next?" blurb** (review step): replaced lender marketplace copy with PaySick direct disbursement copy
- **Loading overlay text**: `Finding you the best rates...` → `Reviewing your application...`
- **Success message**: replaced lending-partner copy with PaySick review and direct disbursement copy
- **Post-submit banner title**: `Marketplace Preview Mode` → `Direct Disbursement Mode`
- **Post-submit banner body**: replaced lending-partner onboarding copy with PaySick direct disbursement copy
- **Post-submit section heading**: `Preview Offers` → `Your Payment Arrangement`
- **Post-submit primary button**: `View My Offers` → `View My Application`

---

## No Changes To

- API routes or middleware
- Database schema or migrations
- Authentication or session management
- Shield framework underwriting gates
