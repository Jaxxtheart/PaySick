# Release Notes — PaySick v1.4.1

**Version**: 1.4.1
**Date**: 2026-03-24
**Type**: PATCH — Footer Company section removed; login page mobile layout improved

---

## Summary

Removed the placeholder "Company" section from all page footers site-wide until the section content is ready to be defined. Improved the login page layout for mobile devices with better padding, font sizing, and touch target dimensions.

---

## Changed

### Footer — Company Section Removed (all pages)
- Removed the "Company" column (About Us, Careers, Press, Contact links) from the footer on all affected pages:
  - `index.html`
  - `login.html`
  - `onboarding.html`
  - `provider-apply.html`
  - `providers.html`
- The footer now shows: Logo/tagline | Product | Legal
- The existing CSS grid (`repeat(auto-fit, minmax(200px, 1fr))`) reflows the remaining columns automatically — no CSS changes required
- The Company section will be re-added in a future version once content is finalised

### Login Page — Mobile Layout (`login.html`)
- Added `@media (max-width: 768px)` improvements:
  - `body` padding reduced to `16px`, top-aligned (`align-items: flex-start`) to prevent the card from being squeezed off-screen on short viewports
  - Input and select `font-size` set to `16px` to prevent iOS automatic zoom on focus
  - Container `border-radius` reduced to `12px` for a more native feel
  - Logo SVG scaled down to `52px`
  - Logo text reduced to `26px`
- Added new `@media (max-width: 480px)` breakpoint for small phones:
  - Body padding reduced to `12px` horizontal, `24px` top
  - Container padding reduced to `28px 18px`
  - Logo SVG reduced to `44px`
  - Logo text reduced to `24px`
  - Logo bottom margin reduced to `24px`

---

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Removed Company footer section |
| `login.html` | Removed Company footer section; added mobile-optimised CSS breakpoints |
| `onboarding.html` | Removed Company footer section |
| `provider-apply.html` | Removed Company footer section |
| `providers.html` | Removed Company footer section |

---

## No Breaking Changes

No API, backend, or schema changes. Pure frontend UI patch.
