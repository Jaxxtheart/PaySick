# Release Notes — v1.12.1

**Release Date**: 2026-10-26
**Version Type**: PATCH — homepage links restored; the repositioning is wording-only

## Summary

The owner's direction on v1.12.0: the homepage repositioning must change
**wording only**. Every link and flow the homepage had in v1.11.0 must keep
working as it does today, alongside the "not live yet" disclaimer.
v1.12.0 had replaced the links into sign-in and provider application with
on-page preview forms that didn't submit. This release puts those links
back and removes the preview forms.

Built test-first. The updated `homepage-repositioning.test.js` failed
12 assertions against v1.12.0, and all 86 pass after this change.

## Fixed
- **`index.html`** — restored every link destination from v1.11.0:
  - Nav: How it works, **Features** (`#features`), For providers →
    `providers.html`, About, and **Get Started → `login.html`**.
  - Hero: **Get Started → `login.html`**, plus the approved "Explore how it
    works" and "Partner with PaySick" (`#providers`).
  - Provider section: "Register your practice's interest" →
    **`provider-apply.html`**, and "Browse Provider Directory" →
    **`providers.html`**.
  - Final section (`#start`): **Get Started → `login.html`**, and "Become a
    provider partner" → **`provider-apply.html`**.
  - Footer: the Product, Company and Legal columns are back, including
    **Research, Licenses and Accessibility**.
- The v1.12.0 copy, the disclosures, the metadata and the Terms of Service
  regulatory-status section are all unchanged.

## Removed
- The preview patient and provider interest forms and `js/interest-forms.js`.
  They sent nothing, so they were not working functionality. The
  conversion CTAs now go to the existing working pages.

## Test results
- `node --test tests/unit/*.test.js`: every suite passes except
  `email-service.test.js` and `marketplace-lender-gate.test.js`. Those two
  can't load `nodemailer` / `pg` in the build sandbox, and they fail the
  same way on v1.11.0.
- Chromium check: all 10 linked pages return 200, every in-page anchor has a
  target, there are no console errors, and there is no horizontal scroll at
  1366px or 375px.
