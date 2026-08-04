# PaySick v1.10.0 — Release Notes

**Date**: 2026-08-04
**Type**: MINOR — new investor-deck slides, pricing correction, blocklist review
**Previous**: [v1.9.0](../v1.9.0/) (2026-08-01)

---

## Summary

The investor deck carried a business model that the platform contradicted. The
deck claimed a "2-4% arrangement fee" and a 10% blended take (R1,850 on an
R18,500 arrangement); `backend/src/services/fee.service.js` charges providers a
flat 5% service fee at settlement and charges patients nothing at all. Nothing on
the deck said what a single provider had to do to become profitable, and nothing
connected the provider-outreach agent shipped in v1.9.0 to a rate of provider
acquisition.

This release rebuilds the commercial half of the deck against the code. Pricing
now matches the fee service line for line, the blended take is restated downward
from 10% to 6.2%, per-arrangement and per-provider economics are published with
their assumptions, every shipped capability carries a quantified business case,
and the outreach plan is costed in three states: blocked as it is today,
unblocked at its configured caps, and unblocked with the caps lifted.

The deck goes from 17 slides to 21.

---

## Added

- **Slide 08, Pricing** (`#slide-pricing`). The four prices actually charged:
  provider service fee 5% of the bill netted at settlement, funding-partner
  placement fee 2%, patient R0, late fee 5% per month compounding. States the
  deliberate absence of any subscription, setup fee or monthly minimum, and
  discloses that the blended take is 6.2%, not the 10% previously claimed.
- **Slide 09, Unit Economics** (`#slide-unit-economics`). Per-arrangement P&L on
  the Phase 1 R18,500 average bill: R1,147 gross revenue, R138 of cost to serve
  broken into verification stack (R66), collection rails (R25) and expected
  credit loss on the directly funded 40% (R47), leaving R1,009 of contribution
  at an 88% margin.
- **Slide 10, Customer Profitability** (`#slide-provider-economics`). The usage
  and scale required to make each provider profitable, at four practice
  profiles from sub-scale to anchor. Year-one breakeven is 13 arrangements,
  steady state is 6. Payback 1.9 months and LTV:CAC 15.2x at the target
  profile, both recomputed off the corrected contribution.
- **Slide 11, Capabilities** (`#slide-capability-case`). Seven shipped modules,
  each with an annual value at the outreach plan's exit run-rate: Shield's five
  gates (R1.96M of loss avoided), the marketplace auction (R145M off balance
  sheet plus R2.9M of placement revenue), provider dashboard and EOB
  reconciliation (R2.13M of servicing removed), the DebiCheck adapter, circuit
  breaker and concentration limits, the outreach agent, and the `/api/v1`
  surface as a distribution channel.
- **Slide 12, Outreach at Scale** (`#slide-outreach-scale`). The published
  funnel (55% emailable, 12% reply, 40% to demo, 30% sign, 80% activate, one
  provider per 158 leads sourced) and three costed scenarios.
- **`.ledger` figure-table styling**, theme-aware across light, dark and
  gradient slides, with the wide tables in their own horizontal scroll
  containers.
- **`tests/unit/investor-deck-business-case.test.js`** — 36 assertions. Pins the
  deck's pricing to the constants in `fee.service.js`, re-derives every published
  figure in the test itself rather than string-matching it, and pins the outreach
  figures to the caps in `outreach.config.js`.
- **`tests/unit/bot-blocklist-review-v1_10_0.test.js`** — 23 assertions covering
  the MINOR-bump blocklist review.

## Changed

- **Provider outreach blocklist** (required review at every MINOR bump). Eight
  second-wave agents added, none of which the existing patterns caught:
  `Meta-ExternalFetcher`, `MistralAI-User`, `Perplexity-User`, `Firecrawl`,
  `crawl4ai`, `Webzio-Extended`, `SerpApi`, `Cotoyogi`. The first three carry no
  "bot" token so the generic `/bot\b/` never fired; the generic `/crawler/`
  pattern does not match a bare "crawl" stem. `Perplexity-User` was the
  user-directed sibling of the already-blocked `PerplexityBot`, so blocking one
  and not the other was an inconsistency rather than a policy.
- **Deck counters, nav dots and PPTX export** raised 17 → 21. The pre-existing
  counter defect is fixed in passing: the deck skipped `12 / 17` and printed
  `13 / 17` twice, so the sequence now runs 01 through 21 with no gap or
  duplicate, and a test asserts that.
- **`tests/unit/investor-deck.test.js`** and
  **`tests/unit/investor-deck-shield.test.js`** structural counts moved 17 → 21,
  and `01 / 17` was added to the superseded-content ban list.

## Removed

- The **Business Model** slide (`#slide-6`). Its three revenue-share
  percentages (40/35/25) were not derivable from any shipped code, its
  "2-4% arrangement fee" contradicted the 5% in `fee.service.js`, and its
  "Provider Fees: subscription + transaction fees" described a subscription the
  platform does not charge. Replaced by the Pricing slide, which is the same
  argument made from the code. See Deprecated Features in
  [REQUIREMENTS.md](./REQUIREMENTS.md).
- Superseded unit-economics claims, now banned deck-wide by test:
  `R1,850 (10%)`, `2-4% arrangement fee`, `Target CAC: R320`, and the three
  `N% of Revenue` splits.

## Not changed

No backend behaviour changed other than the blocklist patterns. No route, schema,
migration or fee rate was touched: the pricing on the deck was moved to match the
code, not the other way round.

---

## Test results

```
node --test tests/unit/*.test.js
# tests 669
# pass  668
# fail  1
```

The single failure is `tests/unit/email-service.test.js`, which cannot resolve
`nodemailer` from the repository root because it is a `backend/` dependency. It
fails identically on a clean checkout of `main` and predates this release.

New assertions in this release: 59 (36 business case, 23 blocklist review), all
written and confirmed failing before the implementation that satisfies them.

---

## Figures published in this release

All are modelled on the Phase 1 average bill of R18,500 and are labelled as
modelled on the slides themselves.

| Figure | Value | Derivation |
|---|---|---|
| Gross revenue per arrangement | R1,147 | 5% service fee (R925) + 2% placement fee on the 60% marketplace share (R222) |
| Blended take | 6.2% | R1,147 / R18,500 |
| Contribution per arrangement | R1,009 | R1,147 less R66 verification, R25 collection rails, R47 expected credit loss |
| Expected credit loss | R47 | 0.63% net loss × R18,500 × 40% directly funded |
| Provider CAC | R4,800 founder-led, R2,700 at scale | Machine cost, approve-queue review minutes and demo time over activated providers |
| Year-one cost per provider | R12,300 | R2,700 CAC + R4,200 onboarding + R5,400 servicing |
| Year-one breakeven | 13 arrangements | R12,300 / R1,009 |
| Steady-state breakeven | 6 arrangements | R5,400 / R1,009 |
| Payback at target profile | 1.9 months | R6,900 / (4 × R1,009 − R450) |
| LTV:CAC at target profile | 15.2x | R105,000 three-year LTV after 20% annual churn / R6,900 |
| Providers per year, caps as configured | 46 | 600 leads a month / 158 per activated provider |
| Providers per year, caps lifted | 273 | 3,600 leads a month / 158 |
| Exit run-rate facilitated volume | R242.4M | 273 × 48 arrangements × R18,500 |
| Cost of staying capped | R201.6M volume, R12.5M revenue | Difference between the two unblocked scenarios |

## What blocks the outreach plan

Recorded here because the deck now depends on it. None of it is engineering
work; the agent, its sequence, its compliance linter and its approve queue all
shipped in v1.9.0 and are covered by tests.

1. A DMARC record plus aligned SPF and DKIM on `paysick.co.za`.
2. A verified Resend sending domain.
3. `BRIEF_RECIPIENTS` pointed at a mailbox that actually exists.
4. `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`,
   `RESEND_WEBHOOK_SECRET`.
5. `dailySourceCap` and `dailyDraftCap` in
   `backend/src/config/outreach.config.js`, and `activeVerticals`, which is
   currently one of the Elective Four.

The human approve gate is not a blocker. It is deliberate, it stays, and slide
12 prices it at roughly 90 seconds a touch.
