# Release Notes — v1.12.2

**Release Date**: 2026-10-26
**Version Type**: PATCH — copy/UI changes at the owner's direction

## Summary
This release makes two changes the owner asked for on the repositioned
homepage. Both were built test-first: the updated
`homepage-repositioning.test.js` failed 4 assertions against v1.12.1, and
all 82 pass after this change.

## Changed
- **`index.html` hero**: removed the availability disclaimer ("Healthcare
  financing services are in development. Credit is not currently available
  through this website. Read our Terms") and its CSS.
- **`index.html` provider section**: reverted to the v1.11.0 wording and
  markup:
  - "Are You a Healthcare Provider?" and the intro line
  - three benefits: 24-hour settlements, Grow your patient base, Zero
    collection burden
  - **Join Our Network** → `provider-apply.html`
  - **Browse Provider Directory** → `providers.html`

  The "In development / Proposed capabilities" panel and its CSS are
  removed.

## Unchanged
- All v1.12.1 links and flows.
- The footer disclosure and the not-a-credit-application notice beside the
  final CTA.
- The Terms of Service regulatory-status section.

## Compliance note
These changes reverse two of the repositioning brief's guardrails: the
homepage availability disclosure, and the removal of the unsupported "24-hour
settlement" and "zero collection burden" claims. Both are recorded in
`PRELAUNCH_COMPLIANCE_CHECKLIST.md` for confirmation by the owner and counsel.

## Test results
- `node --test tests/unit/*.test.js`: every suite passes except the
  `email-service` and `marketplace-lender-gate` suites. Those two can't load
  `nodemailer` / `pg` in the build sandbox, the same as on v1.11.0.
- Chromium: all 10 linked pages return 200, there are no console errors,
  and there is no horizontal scroll at 1366px or 375px.
