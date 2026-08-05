# Architecture — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-08-04

---

## Changes from v1.11.0

Presentation only. Four slides and one style block removed from
`investor-deck.html`. No application code changed: no route, service, middleware,
schema, migration or config.

---

## The deck-to-code dependency, dissolved

v1.10.0 introduced a documented dependency in which three source files
constrained what the deck was allowed to claim, enforced by tests. v1.11.0
removed the outreach half of it. This release removes the rest.

```
  v1.10.0                              v1.12.0
  ───────                              ───────
  fee.service.js       ──┐             fee.service.js        (no deck consumer)
  outreach.config.js   ──┤             outreach.config.js    (no deck consumer)
  shield-gates.service ──┤             shield-gates.service ──┐
                         │                                    │
                         ▼                                    ▼
   pricing · unit econ · provider econ            investor-deck.html
   capability · outreach at scale                   Shield slide only
   ─────────── all removed ───────────
```

**One thread of it survives and is worth not losing.** `investor-deck-shield.test.js`
still reads `backend/src/services/shield-gates.service.js` alongside the deck and
asserts the Shield slide describes gates that actually exist (SHIELD-06, v1.9.0).
That is now the only place where a deck claim is pinned to code.

The pricing guard survives in a weaker but still useful form: the banned-terms
list in `investor-deck.test.js` prevents the superseded figures from reappearing,
even though nothing now requires a pricing claim to be present or correct. It is
a negative constraint where there used to be a positive one.

---

## Deck slide map (16 slides)

Back to the pre-v1.10.0 structure, minus the Business Model slide that v1.10.0
removed and this release does not restore.

```
  01 Cover                    slide-0
  02 Problem                  slide-1
  03 Market ladder            slide-2
  04 Phase 1 / Phase 2        slide-sequencing
  05 Why now                  slide-3
  06 Solution                 slide-4
  07 How it works             slide-5
     ✗  Business Model        slide-6                 [DELETED v1.10.0]
     ✗  Pricing               slide-pricing           [DELETED v1.12.0]
     ✗  Unit economics        slide-unit-economics    [DELETED v1.12.0]
     ✗  Customer profitability slide-provider-economics [DELETED v1.12.0]
     ✗  Capability value      slide-capability-case   [DELETED v1.12.0]
     ✗  Outreach at scale     slide-outreach-scale    [DELETED v1.11.0]
  08 Risk management          slide-7
  09 Moats                    slide-8
  10 Why big BNPL can't       slide-9
  11 Medical Risk Score       slide-10
  12 Shield risk engine       slide-shield
  13 Operating model          slide-11
  14 Roadmap                  slide-12
  15 The ask                  slide-13
  16 Close                    slide-14
```

**The deck goes from "How it works" (07) straight to "Risk management" (08)**,
with no commercial slide between the product and the risk engine. That is the
gap left by the six deletions above. It is intentional as of this release.

---

## Style sheet

The `.ledger` block added in v1.10.0 is removed in full. What remains is the
style sheet as it stood at v1.9.0:

```
  layout      .slide, .slide--white/light/gradient/dark, .content
  typography  h1 h2 h3, .subtitle, .tagline, .highlight, .big-number
  components  .stats-grid/.stat, .two-col/.three-col/.four-col, .card,
              .timeline, .competitors-table, .market-circles, .team-grid,
              .funds-chart, .nav-dots, .download-btn, .divider, .quote
```

`.competitors-table` is now the only table styling on the deck. Any future
figure table should reuse it rather than reintroducing a parallel rule.

---

## Verification shape for slide removal

Worth recording because this release is the third consecutive one to delete
slides, and the first attempt during v1.11.0 removed six unrelated PPTX blocks.

A slide count alone is not a sufficient check. It cannot distinguish "removed the
four intended slides" from "removed three intended and one unintended". The
removal is now verified along three axes:

```
  1. Absence   every removed id, PPTX builder variable, PPTX text marker,
               figure and copy phrase is asserted gone
  2. Presence  all 16 surviving slides asserted present BY ID, not by count
  3. Parity    HTML <section> count === pptx.addSlide() count
```

Axis 2 is the one that would have caught the v1.11.0 near-miss immediately, and
is why it is now a standing assertion rather than an ad-hoc check.

The `// Slide N:` comments inside `downloadPPTX()` remain out of sequence and
still do not correspond to slide position. They were left as they are: renumbering
them would be a large diff over generated-looking code with no test able to
enforce the result. Delete PPTX blocks by explicit line boundary, assert the
`addSlide()` count of the excised range before cutting, and trust the three axes
above over the comments.
