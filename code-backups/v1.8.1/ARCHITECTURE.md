# Architecture — PaySick v1.8.1

**Version**: 1.8.1
**Date**: 2026-07-26

---

## Changes from v1.8.0

No backend or structural change. This is a content-only PATCH scoped to
`investor-deck.html` (the slide HTML plus the inline `downloadPPTX()` generator).
The Daily Provider Outreach Agent and every other module shipped in v1.8.0 are
carried into this snapshot unchanged. Slide component set, navigation, and design
system are unchanged aside from the slide count growing 15 → 16.

### Deck structure (16 slides)

Content deltas in this release:

```
03  The Opportunity      TAM ladder → R25–50B / R4.8–9B / R150–400M (credit-addressable)
04  Sequencing           NEW slide — Phase 1 / Phase 2 (Elective Four); "Phase 1 is our Trojan Horse"
05  Why Now              fragmented-not-empty; real competitive set; "0" card re-described; niche players sub-scale
09  Risk                 Phase-1 figures — PD 1.4%, LGD 45%, net loss 0.63%
13  Operating Model      reframed from Leadership — target roles, founder-led, no named individuals
14  Roadmap & Exit       exit R300M–R2.5B (SA-only); final milestone → UK Expansion; 2028 → 2027
15  The Ask              R25M → $8M; pre-money $24M / equity 25% / post-money $32M / runway 24 months (USD)
(all slides)             em dashes removed from copy; en-dash numeric ranges retained
```

### Figure/copy source of truth (drift risk — unchanged)

Deck copy and figures live in **two places** inside `investor-deck.html` — the
slide HTML and the `downloadPPTX()` generator. Both were edited together in this
release and are pinned by the test suite below. Extracting a single shared data
module remains an open follow-up, out of scope here.

### Invariants enforced by `tests/unit/investor-deck.test.js`

- Slide length = 16 counters = 16 nav dots = 16 `pptx.addSlide()` calls
- No superseded figures survive (R240B TAM, R85B, R2.2B/R3.5B exit, R25M ask, Africa Expansion)
- No em dashes (—) in deck copy; en-dash ranges retained
- Ask is $8M with recalculated valuation; roadmap shows UK Expansion at 2027
- No prohibited customer-facing lending vocabulary introduced

### Platform architecture (unchanged from v1.8.0)

See [v1.8.0/ARCHITECTURE.md](../v1.8.0/ARCHITECTURE.md) for the full platform and
outreach-agent architecture, which this release inherits without modification.
