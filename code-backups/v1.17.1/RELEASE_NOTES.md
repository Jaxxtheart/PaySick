# Release Notes — v1.17.1

**Release Date**: 2026-10-26
**Version Type**: PATCH — homepage visual design (no copy, link or behaviour changes)

## Summary
The owner asked for more design elements so the homepage sections stand out
from each other. The design uses a "pulse" visual language: a heartbeat line
and the medical cross, which echo the PaySick logo and the Tech & Artery
name. Each section gets its own theme, and no two neighbouring sections look
alike.

| Section | Theme |
|---------|-------|
| Hero | Blush gradient, brand-red glows, faint "+" pattern, animated heartbeat line |
| Why PaySick | White; cards with a red accent bar, large faint 01/02/03 numerals, hover lift |
| How it will work | **Dark** ink with a red glow; a glowing track joins the four steps (cards on tablet and phone) |
| For providers | Rose with a fine diagonal texture; a decorative "Patient → PaySick → Your practice" flow card fills the formerly empty right column |
| Technology | **Wine-to-ink** gradient, dot grid, animated node network, and capability chips drawn from the approved paragraph |
| About | Warm cream, a faint logo-cross watermark, and the tagline as a pull quote |
| Final call to action | Bold red band with white buttons |

Also added:
- Curved dividers between sections, in the previous section's colour.
- Small eyebrow labels: Why PaySick, The journey, For providers, Technology,
  About us, Get involved.
- Fade-up reveal on scroll for the cards and chips.

## Accessibility and robustness
- All artwork (heartbeat line, dividers, flow card, network, watermark) is
  `aria-hidden`.
- `prefers-reduced-motion` turns off every animation and the reveal effect.
- The reveal is opt-in: content is only hidden once JavaScript has added
  `html.js-reveal`, so without JavaScript everything is visible.
- Text contrast was measured in Chromium. Every pair meets WCAG AA 4.5:1:

| Text | Contrast |
|------|----------|
| Dark-section subtitle | 10.7:1 |
| Dark-section step text | 9.6:1 |
| Dark-section note | 8.5:1 |
| Technology paragraph | 12.7:1 |
| Red-band text (lightest red) | 5.3:1 |
| Eyebrow on white | 6.7:1 |

- No horizontal scroll at 1440px or 375px, and no console errors.

## Tests
- New: `tests/unit/homepage-section-design.test.js` (11 assertions), written
  first and confirmed failing (0/11).
- `node --test tests/unit/*.test.js`: 1064 tests, 1062 pass. The 2 failures are
  the unchanged `email-service` / `marketplace-lender-gate` suites (they can't
  load `nodemailer` / `pg` in the sandbox). All copy and link tests are
  unchanged and pass.
