# Release Notes — v1.11.1

**Release Date**: 2026-09-29
**Version Type**: PATCH — copy changes to `investor-deck.html` only

## Summary

Pre-submission review of the investor deck ahead of exporting it to PDF for
an investor programme submission with a $250,000 budget. Fixes a slide-number
bug, removes claims that contradicted other slides or the shipped product,
and reframes the ask as a $250,000 request anchoring the planned $8M seed.
Every fix was locked in with a failing test first
(`tests/unit/investor-deck-submission.test.js`).

## Bug Fixes

- **Slide counter**: the Medical Risk Score slide read `13 / 17`, duplicating
  the Shield slide's number; it now reads `12 / 17`.
- **Approval speed**: "60-Second Approval" / "Applies in 60s" replaced with
  "Point-of-Care Decisions"; the real flow can route to human review (the same
  claim was removed from README.md in v1.11.0).
- **Provider payout**: "Paid in 24hrs" / "Full payment within 24 hours" /
  "Provider Paid Upfront" contradicted the 80% provisional / 20% on
  reconciliation payout on the Shield slide (and `underwriting.service.js`).
  Copy now describes the two-stage payout.
- **Market sizing**: the bullet compared R240B total spend to a larger
  R259.3B in scheme benefits. Reworded to state only the scheme-settled figure.
- **Data sources**: MedCredits and named medical schemes (pending
  integrations per progress.md) are no longer presented as live proprietary
  sources; roadmap and live sources are labelled. The PPTX-only "Employer
  garnish arrangements" line was removed.
- **Expansion story**: the "Africa expansion: $200B+" bullet was replaced with
  offshore optionality starting with the UK, matching the roadmap; the cover
  subtitle now says South Africans.
- **Roadmap**: the UK Expansion dot no longer overflows ("UK", labelled 2027).

## Changed

- **The Ask**: headline is now "$250,000 to prove the model", with the
  existing 40/30/20/10 use-of-funds split shown in dollars ($100K / $75K /
  $50K / $25K) and the $8M seed shown as context. Pre-money valuation, equity
  and runway figures were removed until the funding type (grant vs equity) is
  confirmed.
- "Net Loss Rate" is now labelled "Modelled Net Loss".

## Tests

- New: `tests/unit/investor-deck-submission.test.js` (8 tests).
- Updated: `tests/unit/investor-deck.test.js` no longer requires `$24M`.
