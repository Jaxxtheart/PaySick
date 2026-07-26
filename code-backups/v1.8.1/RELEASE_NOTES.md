# Release Notes — PaySick v1.8.1

**Version**: 1.8.1
**Date**: 2026-07-26
**Type**: PATCH — Copy/figure edits to the investor deck (diction, framing, competitive positioning, roadmap, and the funding ask)

---

## Summary

Follow-up copy and figure corrections to the `/investor-deck` presentation (and its client-side–generated PPTX) after the v1.8.0 market-sizing overhaul. No structural change: same 16 slides, same components, same design system. Every edit is a punctuation, wording, or figure change applied in place on both the page and the PPTX generator.

---

## Changed (`investor-deck.html` — page + `downloadPPTX()` generator)

- **Diction — em dashes removed throughout.** All 23 em dashes (—) in deck copy were replaced with context-appropriate punctuation (comma, colon, or semicolon) with no rewording. En dashes (–) in numeric ranges (e.g. R25–50B, R300M–R2.5B, 5–8 years) are correct typography and were retained.
- **Slide 04 (Sequencing) framing** — heading "Phase 1 is a wedge, not a ceiling" → **"Phase 1 is our Trojan Horse"** (page + PPTX).
- **Slide 05 (Why Now)** — the "0 Dominant Players" card description now corrects the "empty market" read: *"The field is niche specialists with low market share and early maturity; none has reached scale or established leadership."* The niche-specialist competitor card highlights **low market share and early maturity** (still sub-scale). PPTX competitive-set text updated to match.
- **Slide 14 (Roadmap)** — final milestone "Africa Expansion / Kenya, Nigeria" → **"UK Expansion / United Kingdom"** to align with the offshore-expansion exit path (the target win); milestone year and exit horizon shifted 2028 → **2027** ("Exit Potential (2027+)"). Page + PPTX.
- **Slide 15 (The Ask)** — funding ask **R25M → $8M**; valuation metrics recalculated: Pre-Money **R50M → $24M**, Equity Offered **33% → 25%**, Runway **18 → 24 months** (post-money $32M). Funds-allocation split (40/30/20/10) unchanged. Page + PPTX.

---

## No Changes To

- Slide count (16), layout, components, typography, spacing, colour tokens, animation, or the slide-counter pattern
- Any other page, API route, or backend module
- Numeric-range en-dash typography

---

## Assumptions & Review Items

- **Slide 15 valuation anchor (assumption).** The $8M raise was recalculated at a **$24M pre-money / 25% equity / $32M post-money / 24-month runway** structure (a standard $8M seed step-up, lowering dilution from the prior 33%). This anchor was a default choice — Pre-Money/Equity/Runway should be confirmed by the founder and are trivial to adjust.
- **Currency mix (by design).** The ask and its valuation metrics are now in **USD** to match the "$8M" instruction and the UK-expansion focus; the rest of the deck's operational figures remain in Rand, unchanged.
- **Roadmap volumes** (R5M → R50M → R200M → R500M+ → R1B+) vs the Phase 1 obtainable R150–400M/yr — still reads as full-market/Phase 2 at the top end; flagged in v1.8.0, unchanged here.
- **Slide 15 "10% Operations"** now equals ~$800K of an $8M raise over 24 months — larger than before but still modest against three senior hires plus compliance/legal; flagged, not changed.
