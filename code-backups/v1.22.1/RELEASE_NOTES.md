# Release Notes: PaySick v1.22.1

**Version**: 1.22.1
**Date**: 2026-11-07
**Type**: PATCH (UI tweak)

## Summary
The homepage hero now has a cleaner background. The owner asked to
"change this section of the homepage to a cleaner background, remove the
pattern".

## Changed
- `index.html` `.theme-blush` (hero): removed the repeating plus-sign
  pattern and the two blurred brand-red glows (`::before` / `::after`).
  The background is now a plain white-to-blush wash
  (`#ffffff` → `#FFF1F3`), so it still flows into the blush divider of the
  next section.
- The heartbeat line at the bottom of the hero is kept (pinned by
  `homepage-section-design.test.js`).

## Added
- `tests/unit/homepage-hero-clean-background.test.js`, written before the
  change: no pattern image, no glow pseudo-elements, and a wash that ends
  in the divider colour.

## Removed
- Hero plus-pattern and glow blobs (decoration only).

## Tests
1558 unit tests, 1556 pass. The 2 failures (`email-service`,
`marketplace-lender-gate`) also fail on v1.22.0 and are unrelated.
