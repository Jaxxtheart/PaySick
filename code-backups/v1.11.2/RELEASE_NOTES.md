# Release Notes — v1.11.2

**Release Date**: 2026-09-29
**Version Type**: PATCH — investor deck trimmed to 15 slides

## Summary

The investor submission allows at most 15 slides. Two slides that mostly
restated stronger slides were dropped from `investor-deck.html` (HTML slides
and the in-page PPTX generator), and the counters, nav dots and tests were
updated to 15.

## Removed

- **Moats (competitor yes/no table)**: compared PaySick with banks, finance
  apps and credit cards, while slide 5 already covers the real competitive
  set; its network-effects/data/brand points are argued better on the
  Defensibility slide. The now-unused `.competitors-table`, `.check` and
  `.cross` CSS was removed.
- **The Medical Risk Score**: the third of three risk slides and mostly
  forward-looking; Shield covers the running controls. Its one distinct
  idea, provider risk scoring, is now a bullet on the Risk Management slide.

## Tests

- Slide-count assertions in `investor-deck.test.js`,
  `investor-deck-shield.test.js` and `investor-deck-submission.test.js`
  changed from 17 to 15 (updated first and confirmed failing).
- New test asserting both slides are gone and provider risk scoring moved.
- `'01 / 15'` removed from the banned stale-counter list, since the deck is
  15 slides again.
