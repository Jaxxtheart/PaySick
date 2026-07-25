# Requirements & Specifications — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-07-25

Carries forward all requirements from v1.7.5 with the following additions.

---

## New Requirements

### Investor Deck — Market Sizing & Phase 1 Entry (White Paper V6.0 alignment)

| ID | Requirement | Priority |
|----|-------------|----------|
| DECK-01 | The Opportunity slide must present the credit-addressable ladder — TAM R25–50B, SAM R4.8–9B (Phase 1 / Elective Four), SOM R150–400M/yr — and must not present R240B, R85B, or R12B as market-size claims | Must Have |
| DECK-02 | R240B may appear only as context (total private healthcare spend), never as a TAM/addressable-market claim | Must Have |
| DECK-03 | The deck must include a Phase 1 / Phase 2 sequencing slide explaining the Elective Four wedge and Phase 2 expansion | Must Have |
| DECK-04 | The "Why Now" slide must describe the market as fragmented (not empty) and name the real competitive set; the "0 dominant players" stat is retained but re-described | Must Have |
| DECK-05 | Risk figures must be Phase 1: Target PD 1.4%, Target LGD 45%, Net Loss Rate 0.63% (Net Loss = PD × LGD must hold) | Must Have |
| DECK-06 | The Leadership slide must present the target operating model (roles the seed round funds), founder-led, with no named individuals or prior employers | Must Have |
| DECK-07 | The Roadmap exit range must read R300M–R2.5B (SA-only), not R2.2B–R3.5B | Must Have |
| DECK-08 | The downloadable PPTX must match the page: same slide count (16), same corrected figures, no superseded figure surviving | Must Have |
| DECK-09 | Slide-counter denominators, navigation dots, and PPTX slide count must all equal the deck length (16) | Must Have |
| DECK-10 | Deck copy must not introduce prohibited lending vocabulary (loan, credit provider framing, borrower, debt, interest, lending, default as customer framing); payment-facilitation terminology is retained | Must Have |

---

## Inherited Requirements

All requirements from v1.7.5 remain in effect. See [v1.7.5/REQUIREMENTS.md](../v1.7.5/REQUIREMENTS.md) for the full set.

---

## Deprecated Features

### Legacy investor-deck market sizing (R240B TAM ladder)
- Removed in: v1.8.0
- Last available in: v1.7.5 — see code-backups/v1.7.5/snapshot/investor-deck.html
- Reason for removal: superseded by PaySick White Paper V6.0 (July 2026); R240B is total private healthcare spend, not an addressable market, and the R259.3B in scheme-settled benefits cannot be facilitated
- Replacement: credit-addressable ladder (R25–50B / R4.8–9B / R150–400M) with Phase 1 Elective Four sequencing (DECK-01, DECK-03)

### Legacy leadership "filled bench" slide
- Removed in: v1.8.0
- Last available in: v1.7.5 — see code-backups/v1.7.5/snapshot/investor-deck.html
- Reason for removal: presented four seated executives with named prior employers (Ex-Discovery/Amazon/Capitec/TransUnion); reads as a filled bench that would not survive diligence for a founder-led seed-stage company
- Replacement: target operating model slide (roles the seed round funds), Founder & CEO appointed, three open seed hires (DECK-06)
