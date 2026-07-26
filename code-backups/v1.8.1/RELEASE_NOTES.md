# Release Notes — PaySick v1.8.1

**Version**: 1.8.1
**Date**: 2026-07-26
**Type**: PATCH — investor-deck market-sizing correction and copy/figure edits

---

## Summary

Aligns the `/investor-deck` presentation (and its client-side–generated PPTX) with
the PaySick White Paper V6.0 (July 2026): a corrected, credit-addressable market
ladder, an explicit Phase 1 / Phase 2 sequencing slide, sharper competitive
framing, Phase-1 risk figures, an operating-model reframe, revised exit range,
and an updated funding ask. Content-only edits extending the existing deck
components — design system, layout, typography, colour tokens and the
slide-counter pattern are all preserved. The page and the `downloadPPTX()`
generator were updated in lock-step.

> **Note on versioning.** This work was originally drafted on the pre-outreach
> base as two backups (v1.8.0 "market sizing" and v1.8.1 "copy/figure edits").
> Between drafting and merge, `v1.8.0` was released to `main` for the **Daily
> Provider Outreach Agent** (an unrelated feature). To keep the master history
> linear and each `v1.8.0` immutable, the investor-deck work is consolidated
> here as a single **v1.8.1** whose snapshot reflects the true merged tree —
> i.e. it contains **both** the Outreach Agent (from v1.8.0) and these
> investor-deck edits.

---

## Changed (`investor-deck.html` — page + `downloadPPTX()` generator)

### Market sizing & sequencing
- **Slide 03 (Market):** replaced the R240B / R85B / R12B TAM ladder with a
  credit-addressable ladder **R25–50B / R4.8–9B / R150–400M**; new heading,
  supporting bullets, and a modelled-estimates footnote.
- **New Slide 04 (Sequencing):** Phase 1 / Phase 2 roadmap (the "Elective Four"
  wedge). Framing heading is **"Phase 1 is our Trojan Horse."**
- **Slide 05 (Why Now):** "fragmented, not empty" framing with a real
  competitive set and an affordability-verification differentiation line. The
  "0 Dominant Players" card no longer reads as an empty market — it describes
  niche specialists with low market share and early maturity; the niche
  competitor card is flagged as sub-scale.

### Risk, model & ask
- **Slide 09 (Risk):** Phase-1 figures — PD **3.2% → 1.4%**, net loss
  **1.4% → 0.63%** (LGD 45% unchanged; PD × LGD kept consistent).
- **Slide 13 (Operating Model):** Leadership slide reframed as an operating
  model — target roles the seed funds; founder-led; no named individuals or
  prior employers.
- **Slide 14 (Roadmap & Exit):** exit range **R2.2B–R3.5B → R300M–R2.5B** with
  an SA-only caption; final roadmap milestone **"Africa Expansion (Kenya,
  Nigeria)" → "UK Expansion (United Kingdom)"**; milestone/exit horizon shifted
  **2028 → 2027** ("Exit Potential (2027+)").
- **Slide 15 (The Ask):** funding ask **R25M → $8M**; valuation recalculated —
  Pre-Money **R50M → $24M**, Equity **33% → 25%**, Runway **18 → 24 months**
  (post-money $32M). Funds split (40/30/20/10) unchanged.

### Diction
- Removed all 23 em dashes from deck copy (replaced with comma / colon /
  semicolon, no rewording). Numeric-range en dashes retained as correct
  typography.

### Structure
- Deck grows **15 → 16 slides**; all slide counters, nav dots and PPTX slides
  updated to 16.

---

## Tests

- `tests/unit/investor-deck.test.js` (added test-first): locks in the corrected
  market-sizing / Phase-1 figures, the absence of every superseded figure on
  both the page and the generated PPTX, the "Trojan Horse" framing, the $8M ask,
  the UK/2027 roadmap, the no-em-dash rule, and counter consistency (16) across
  the page and PPTX. **11 assertions, all green.**

---

## No Changes To

- Slide layout, components, typography, spacing, colour tokens, animation, or
  the slide-counter pattern (beyond the 15 → 16 count).
- Any other page, API route, or backend module. The Daily Provider Outreach
  Agent shipped in v1.8.0 is carried into this snapshot unchanged.

---

## Assumptions & Review Items

- **Slide 15 valuation anchor (assumption).** The $8M raise was modelled at
  $24M pre-money / 25% equity / $32M post-money / 24-month runway — a default
  pending founder confirmation and trivial to adjust.
- **Currency mix (by design).** The ask and its valuation metrics are in USD to
  match the "$8M" instruction and the UK-expansion focus; the rest of the deck's
  operational figures remain in Rand.
- **Modelled market estimates.** The R25–50B / R4.8–9B / R150–400M ladder is a
  modelled estimate (footnoted on Slide 03), not a cited third-party figure.
