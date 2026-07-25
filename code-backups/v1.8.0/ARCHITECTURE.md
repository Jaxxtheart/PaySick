# Architecture — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-07-25

---

## Changes from v1.7.5

No backend architectural changes. Frontend content-only release, scoped to `investor-deck.html`.

### Investor deck structure (updated: 15 → 16 slides)

```
investor-deck.html  (single self-contained file)
│
├── <head> — inline CSS design system + PptxGenJS 3.12.0 (CDN)
│
├── Slides (hardcoded <section class="slide">, DOM order = slide order)
│     01  Cover
│     02  The Problem            (stats-grid)
│     03  The Opportunity        (market-circles ladder — CORRECTED figures)
│     04  Phase 1 / Phase 2 Sequencing   ← NEW (two-col + card + feature-list)
│     05  Why Now                (four-col + NEW competitive-set three-col)
│     06  The Solution
│     07  How It Works
│     08  Business Model
│     09  Risk Management         (stats-grid — CORRECTED PD/net-loss)
│     10  Competitive Advantage
│     11  Why Big BNPL Can't Walk In
│     12  Medical Risk Score
│     13  Operating Model         (team-grid — REFRAMED from Leadership)
│     14  Roadmap                 (timeline — CORRECTED exit range)
│     15  The Ask
│     16  Vision & Close
│
├── <nav class="nav-dots"> — 16 dots (data-slide 0..15), positional
│
└── <script>
      ├── nav-dot IntersectionObserver + keyboard navigation (index-based)
      └── downloadPPTX() — PptxGenJS generator, 16 addSlide() calls
              slide1 … slide3, slideSeq (NEW), slide4 … slide15
```

### Figure source of truth (drift risk — see follow-up)

Deck figures live in **two independent places** inside `investor-deck.html`:
1. The slide HTML (what the page renders).
2. Hardcoded arrays / `addText` calls in `downloadPPTX()` (what the PPTX carries).

Both were updated together in this release. A single shared data module consumed by
both is proposed as a follow-up (out of scope for v1.8.0) to prevent future drift.

### Counter consistency invariant

Slide length must equal: number of `NN / 16` counters (16) = number of nav dots (16)
= number of `pptx.addSlide()` calls (16). Enforced by
`tests/unit/investor-deck.test.js`.
