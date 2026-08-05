# PaySick v1.12.0 — Release Notes

**Date**: 2026-08-04
**Type**: MINOR — deck slides removed
**Previous**: [v1.11.0](../v1.11.0/) (2026-08-04)

---

## Summary

The four remaining business-case slides added in v1.10.0 are deleted at the
founder's direction. With the outreach slide already removed in v1.11.0, the
entire v1.10.0 addition is now reverted and the deck is back to 16 slides, its
pre-v1.10.0 length.

---

## Removed

### Investor deck slides 08 to 11

| Slide | Id | Carried |
|---|---|---|
| Pricing | `slide-pricing` | 5% provider service fee, 2% placement fee, R0 patient, 5%/month late fee, no-subscription stance, 6.2% blended take |
| Unit Economics | `slide-unit-economics` | R1,147 gross, R138 cost to serve, R1,009 contribution, 88% margin |
| Customer Profitability | `slide-provider-economics` | 13-arrangement year-one breakeven, four practice profiles, 1.9 month payback, 15.2x LTV:CAC |
| Capability Value | `slide-capability-case` | Seven shipped modules with an annual value each |

All four HTML sections and all four `downloadPPTX()` builders are removed.
Counters renumbered 01 through 16 with no gap; nav dots reduced to 16.

### Dead CSS

The style block added in v1.10.0 to support those slides is removed with them:
`.ledger`, `.ledger-wrap`, `.assumption`, `.flag-good`, `.flag-bad`, `.pill` and
their theme variants. None had another consumer on the deck. `.pill` was already
dead after v1.11.0, since its only markup was on the outreach slide.

### Test file

`tests/unit/investor-deck-business-case.test.js` is deleted. Every assertion in
it described one of the four removed slides.

**Its superseded-pricing bans are not lost.** They move into the existing
`banned` list in `tests/unit/investor-deck.test.js`, so `R1,850 (10%)`,
`2-4% arrangement fee`, the three `N% of Revenue` splits and `Target CAC: R320`
still cannot reappear anywhere on the deck. That guard mattered independently of
the slides that carried it.

---

## Consequence worth stating plainly

**The deck now carries no pricing or business-model slide at all.**

v1.10.0 removed the original "Business Model" slide on the grounds that its
figures contradicted `backend/src/services/fee.service.js`: it claimed a
"2-4% arrangement fee" against the flat 5% the platform charges providers, split
revenue 40/35/25 with no basis in code, and described a provider subscription
that does not exist. Its four replacements are now gone too.

**The old slide is deliberately not restored.** Bringing it back would
reintroduce a known-false pricing claim into a live investor document. Its code
remains available in `code-backups/v1.9.0/snapshot/investor-deck.html` (section
`id="slide-6"`) if it is ever wanted, and the bans above will fail the test suite
if any of its figures are pasted back without being corrected first.

This is a deliberate state, not an oversight. It is recorded here so that whoever
next opens the deck knows the gap is intentional and knows why the obvious fix is
the wrong one.

---

## Added

- `tests/unit/investor-deck-business-slides-removed.test.js` — 19 assertions.
  Pins each slide's removal, the absence of their PPTX builders and figures, the
  removal of the dead CSS, deck structure at 16 slides, that every slide
  predating v1.10.0 survives, and that the superseded Business Model figures did
  not come back.

## Changed

- `tests/unit/investor-deck.test.js`: structural counts 20 → 16; migrated
  pricing bans; slide-count history comment rewritten to record all four moves
  (16 → 17 → 21 → 20 → 16).
- `tests/unit/investor-deck-shield.test.js`: structural counts 20 → 16; the
  stale-counter guard no longer bans "/ 16", which is the live denominator
  again, and bans "/ 20" and "/ 21" instead.
- `tests/unit/investor-deck-outreach-slide-removed.test.js`: the assertions
  covering the four surviving business-case slides and the capability slide's
  restated basis are removed, both now moot. Its false-claim and orphaned-figure
  bans are retained.

---

## Guarding against the PPTX trap

The v1.11.0 notes recorded that the `// Slide N:` comments inside
`downloadPPTX()` are not in sequence, and that deleting a block by searching for
the next comment cuts unrelated slides. This release deleted four adjacent PPTX
builders, which is exactly the shape that goes wrong.

Two things prevented a repeat: the deletion was bounded by the *first* comment
after the run (`// Slide 8: Risk Management`) with an assertion that the excised
block contained exactly four `addSlide()` calls and all four expected builder
variables; and the new test asserts every one of the sixteen slides predating
v1.10.0 is still present by id, so a collateral cut fails loudly rather than
being caught only by a count.

---

## Test results

```
node --test tests/unit/*.test.js
# tests 684
# pass  683
# fail  1
```

19 new assertions, written and confirmed failing before the removal.

The single failure is `tests/unit/email-service.test.js`, which cannot resolve
`nodemailer` from the repository root because it is a `backend/` dependency. It
fails identically on a clean checkout and predates this release.

Deck renders at 16 sections, 16 nav dots, no console errors, no horizontal
overflow.
