# Release Notes: PaySick v1.22.2

**Version**: 1.22.2
**Date**: 2026-11-07
**Type**: PATCH (UI tweak)

## Summary
Follow-up to v1.22.1. The owner asked to remove the heartbeat (pulse)
line from the homepage hero as well, so the hero is now just a plain
white-to-blush wash with the content on it.

## Removed
- `index.html`: the `<svg class="pulse-line">` heartbeat in the hero, its
  CSS (`.pulse-line`, `.pulse-base`, `.pulse-beat`, `@keyframes
  pulse-draw`), its mobile sizing and reduced-motion override, and the
  `.hero > *:not(.pulse-line)` stacking rule that only existed for the
  decorations.
- The mobile `.hero { padding-bottom: 120px }` override that made room for
  the line; the hero uses its normal mobile padding again.

## Changed (tests)
- `homepage-section-design.test.js`: the "hero has an animated heartbeat
  line" test now checks that the hero has no heartbeat line.
- `homepage-hero-clean-background.test.js`: two new tests (no pulse
  markup, no pulse CSS or animation). Both written and seen failing first.

## Tests
1560 unit tests, 1558 pass. The 2 failures (`email-service`,
`marketplace-lender-gate`) also fail on v1.22.0 and are unrelated.
