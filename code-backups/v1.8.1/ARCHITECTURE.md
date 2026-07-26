# Architecture — PaySick v1.8.1

**Version**: 1.8.1
**Date**: 2026-07-26

---

## Changes from v1.8.0

No backend or structural change. Content-only PATCH scoped to `investor-deck.html`
(slide HTML + the inline `downloadPPTX()` generator). Slide count, component set,
navigation, and design system are unchanged from v1.8.0.

### Deck structure (unchanged: 16 slides)

Same running order as v1.8.0. Content deltas in this release:

```
03  The Opportunity            (unchanged)
04  Sequencing                 framing → "Phase 1 is our Trojan Horse"
05  Why Now                    "0" card corrected; niche competitors flagged low share / early maturity
14  Roadmap                    final milestone → UK Expansion; 2028 → 2027; Exit Potential (2027+)
15  The Ask                    R25M → $8M; pre-money $24M / equity 25% / runway 24 months (USD)
(all slides)                   em dashes removed from copy; en-dash ranges retained
```

### Figure/copy source of truth (unchanged drift risk)

Deck copy and figures still live in **two places** inside `investor-deck.html` — the
slide HTML and the `downloadPPTX()` generator. Both were edited together in this
release. The single-shared-data-module follow-up proposed in v1.8.0 remains open and
out of scope.

### Invariants enforced by `tests/unit/investor-deck.test.js`

- Slide length = 16 counters = 16 nav dots = 16 `pptx.addSlide()` calls
- No superseded figures (R240B TAM, R85B, R2.2B/R3.5B exit, R25M ask, Africa Expansion)
- No em dashes (—) in deck copy
- Ask is $8M with recalculated valuation; roadmap shows UK Expansion at 2027
