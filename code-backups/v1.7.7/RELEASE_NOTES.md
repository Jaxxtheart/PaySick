# Release Notes — PaySick v1.7.7

**Version**: 1.7.7
**Date**: 2026-04-20
**Type**: PATCH — investor deck copy and structure update

---

## Summary

Removed the marketplace model from the investor deck entirely. Every patient payment arrangement is now funded directly by PaySick from its own balance sheet. Reflects the updated capital ask of R30M (R20M balance sheet arrangement capital + R10M operational equity). Removed all em dashes throughout the deck.

---

## Changes

### investor-deck.html

#### Em Dash Removal (all slides)
- Replaced all 27 em dash instances with context-appropriate punctuation (colons, commas, or forward slashes) for cleaner readability.

#### Slide 5 — The Solution
- "Multi-Partner Marketplace" card replaced with "PaySick Direct Funding": PaySick funds every patient arrangement from its own balance sheet. No third-party dependency. Patients get instant, certain access to care.

#### Slide 6 — Product / How It Works
- Timeline steps 3 and 4 replaced: removed "Marketplace Competes" and "Patient Picks Best Offer"; now "Shield Approves in 60s" and "PaySick Disburses Funds".
- Patient benefit bullet: "Compare multiple offers" → "Instant decision from PaySick".

#### Slide 7 — Business Model
- Revenue streams replaced:
  - Removed: Marketplace Fees (40%), Net Service Fee Margin (35%), Provider Fees (25%)
  - Added: Patient Service Fee (60%), Provider Service Fee (25%), Late Payment Income (15%)
- Unit economics updated: Avg. Arrangement R18,500 → R8,000; Revenue per Arrangement R1,850 → R800.

#### Slide 8 — Shield™ AI Framework
- "Lender Gate" renamed to "Capital Gate" in both HTML and PPTX generation code to reflect direct balance sheet model (no external lenders).

#### Slide 9 — Competitive Advantages / Moats
- Table row: "Multi-Partner Competition" → "Direct Balance Sheet Funding".
- Network Effects card: removed "funding partners" reference; now "More providers → more patients → stronger data → better risk models".

#### Slide 10 — Defensibility
- "Marketplace Neutrality" moat card replaced with "Vertically Integrated Capital": PaySick funds every arrangement directly. No revenue sharing with third-party lenders, no approval delays, full margin capture on every rand deployed.

#### Slide 12 — Team
- Description updated: "fintech, healthcare, and marketplace businesses" → "healthcare fintech, balance sheet lending, and financial services".

#### Slide 13 — Roadmap
- Q4 2026 milestone: "Marketplace Live / 5 funding partners" → "National Roll-Out / 200 providers".

#### Slide 14 — Two-Part Capital Structure
- Part 1 updated: R15M → R20M; "Disbursement Facility" → "Balance Sheet Arrangement Capital"; description updated to direct-funding model with ~4× capital turns.
- Total capital updated: R25M → R30M.

---

## Capital Rationale

| Metric | Value |
|--------|-------|
| Max arrangement cap | R10,000 |
| Average arrangement size | R8,000 |
| Term | 3 months (4× capital velocity/year) |
| To fund R50M annual volume | ~R12.5M book needed |
| Buffer + growth headroom | R20M balance sheet capital |
| Operational runway (18 months) | R10M equity |
| **Total ask** | **R30M** |

---

## Files Changed

- `investor-deck.html`

---

## Deprecated / Removed

- Marketplace model: no third-party lenders, no marketplace competition, no "Multi-Partner Competition" capability
