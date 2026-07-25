# Release Notes — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-07-25
**Type**: MINOR — New slide added to the investor deck + corrected market sizing / Phase 1 entry across the deck and its downloadable PPTX

---

## Summary

The `/investor-deck` presentation carried commercial figures that predate PaySick White Paper V6.0 (July 2026). The V6.0 white paper supersedes the R240B total-addressable-market claim and reframes the go-to-market around a deliberate Phase 1 "Elective Four" wedge. This release corrects every superseded figure on the page **and** in the client-side–generated PPTX, and adds one new slide explaining the Phase 1 / Phase 2 sequencing. The published design system (eyebrow labels, two-part accent headings, stat/circle/card components, colour tokens, typography, slide-counter pattern) is preserved exactly — every change is a content edit.

The deck grows from **15 to 16 slides**; all slide-counter denominators, navigation dots, and PPTX slides were updated to match.

---

## Added

### New slide 04 — "Phase 1 / Phase 2 Sequencing" (`investor-deck.html`)
- Inserted after slide 03 using the existing `two-col` + `card` + `feature-list` components.
- Explains why the Phase 1 SAM is deliberately narrow: the Elective Four (fertility/IVF, aesthetics, dentistry, ophthalmology) are planned, mostly self-pay, quotable, and concentrated — modelled blended PD 1.4% vs 3.2% full-market.
- Phase 2 expansion (gap financing R12–20B, orthopaedics, general surgery, maternity) unlocked once tariff controls are live.
- Framing line: "Phase 1 is a wedge, not a ceiling."
- Corresponding new PPTX slide (`slideSeq`) added to the `downloadPPTX()` generator.

## Changed (`investor-deck.html` — page + PPTX generator)

- **Slide 03 (The Opportunity)** — replaced the TAM/SAM/SOM ladder (R240B / R85B / R12B) with the credit-addressable framing: **R25–50B** Credit-Addressable / **R4.8–9B** Phase 1 Serviceable (The Elective Four) / **R150–400M** Obtainable per Year. New heading: *"A R37 billion addressable market, entered through a deliberate wedge."* Added supporting bullets (scheme-settled spend context, ~R37B midpoint derivation, Elective Four) and a modelled-estimates footnote citing White Paper V6.0.
- **Slide 05 (Why Now)** — the "0 Dominant Players" stat is retained but re-described as *"Category is fragmented, not empty — no player has established leadership."* Added a competitive-set card row (gap-cover insurers, major credit houses, niche medical-payment specialists) and the differentiation line: *"Differentiation comes from the affordability-verification layer."*
- **Slide 09 (Risk Management)** — Phase 1 figures: Target PD 3.2% → **1.4%**, Net Loss Rate 1.4% → **0.63%** (PD × LGD kept internally consistent; LGD 45% unchanged). Added the supporting line on Phase 1 risk reduction.
- **Slide 13 (Leadership → Operating Model)** — reframed as the target operating model the seed round funds. Eyebrow `Leadership` → `Operating Model`; heading *"A team built to win"* → *"The team this round builds."* Cards now read as target profiles (Founder & CEO = Appointed; CTO/CFO/CRO = Seed hire), with no named individuals or prior employers. Open-role avatars use reduced opacity (existing styling primitive) to distinguish them from the filled Founder role.
- **Slide 14 (Roadmap)** — exit range R2.2B–R3.5B → **R300M–R2.5B** with the SA-only base/strong caption and origination-layer / offshore-expansion framing.
- **Slide counters, nav dots, PPTX slide count** — all updated from 15 to 16.

---

## No Changes To

- Deck layout, routing, component boundaries, typography, spacing, colour tokens, animation, or the slide-counter pattern
- Any other page, API route, or backend module
- The retained investor-audience risk terms "Probability of Default (PD)" and "Target LGD" on slide 09 (left as-is per scope)

---

## Review Items Flagged (not changed)

- **Slide 15 (The Ask) — "10% Operations — Team, compliance, legal"**: 10% of a R25M seed reads thin against funding three senior hires (CTO/CFO/CRO) plus compliance and legal. Raised for human review; allocation percentages were **not** altered.
- **Slide 14 (Roadmap) volume targets** (R5M → R50M → R200M → R500M+ → R1B+): the R500M+/R1B+ figures exceed the Phase 1 obtainable R150–400M/yr and read as full-market / Phase 2. Raised for review; **not** silently edited.
- **Colour tokens**: the task named navy `#1B2A4A` / pink `#EF476F`, but the published deck actually uses `#FF4757`→`#E01E37` and `#1A1A1A`. Existing tokens were reused (no new colour introduced), per the design-preservation constraint.
