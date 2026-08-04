# Requirements & Specifications — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-08-04

Carries forward all requirements from v1.9.0 and its predecessors, and adds the
requirements below. This release rebuilds the commercial half of the investor
deck so that every price, margin and acquisition figure it publishes is derived
from code that ships, and performs the MINOR-bump bot blocklist review.

---

## New Requirements

### Investor deck pricing

| ID | Requirement | Priority |
|----|-------------|----------|
| PRICE-01 | Every fee rate published on the investor deck must match the corresponding constant in `backend/src/services/fee.service.js` | Must Have |
| PRICE-02 | The deck must state the provider service fee as 5% of the bill, netted from settlement | Must Have |
| PRICE-03 | The deck must state that the patient pays R0: no fee, no charge, no cost of any kind on the arrangement itself | Must Have |
| PRICE-04 | The deck must state the funding-partner placement fee as 2% of the bill | Must Have |
| PRICE-05 | The deck must disclose the late fee (5% per month on the overdue amount, compounding monthly) rather than omit it | Must Have |
| PRICE-06 | The deck must state that there is no provider subscription, setup fee or monthly minimum, because that is the shipped pricing model | Must Have |
| PRICE-07 | The blended take rate must be published as 6.2% and must be derivable from PRICE-02 and PRICE-04 at the stated marketplace share | Must Have |
| PRICE-08 | Superseded pricing claims must be banned deck-wide by test, not merely deleted: `R1,850 (10%)`, `2-4% arrangement fee`, `Target CAC: R320`, and the `N% of Revenue` splits | Must Have |

### Unit and customer economics

| ID | Requirement | Priority |
|----|-------------|----------|
| ECON-01 | The deck must publish a per-arrangement contribution model, with revenue and every cost line shown separately rather than netted | Must Have |
| ECON-02 | Each cost line must correspond to a real vendor cost or a modelled loss provision; overhead allocations must not be presented as unit costs | Must Have |
| ECON-03 | Expected credit loss per arrangement must be derived from the deck's own net loss rate (0.63%) and the directly funded share, not asserted independently | Must Have |
| ECON-04 | The deck must state the arrangement volume a single provider must generate to cover its year-one cost, and the volume required in steady state | Must Have |
| ECON-05 | Provider profitability must be shown at more than one practice profile, including at least one profile that does not clear year one | Must Have |
| ECON-06 | Provider CAC must be stated for both the current founder-led outreach and the funded-scale case, and must not be conflated with patient CAC | Must Have |
| ECON-07 | Payback and LTV:CAC must be recomputed from the published contribution figure; figures carried over from a superseded model are prohibited | Must Have |
| ECON-08 | Every modelled figure must carry its assumptions on the same slide | Must Have |
| ECON-09 | Assertions covering published figures must re-derive the arithmetic in the test, not string-match the rendered number alone | Must Have |

### Capability business case

| ID | Requirement | Priority |
|----|-------------|----------|
| CAP-01 | Every capability presented as an asset on the deck must correspond to a module that exists in the repository | Must Have |
| CAP-02 | Each capability must carry a quantified annual value, expressed as revenue earned, cost removed, capital released or loss avoided | Must Have |
| CAP-03 | Capability values must be stated at a named run-rate so they are comparable to one another | Must Have |
| CAP-04 | Where a capability's value is a precondition rather than a cash figure (for example the circuit breaker), it must be labelled as such rather than assigned a fabricated number | Must Have |

### Outreach plan economics

| ID | Requirement | Priority |
|----|-------------|----------|
| OUT-01 | The deck must publish the lead-to-provider conversion funnel stage by stage, so the acquisition rate can be checked rather than taken on trust | Must Have |
| OUT-02 | The outreach volumes quoted must match `dailySourceCap`, `dailyDraftCap` and `activeVerticals` in `backend/src/config/outreach.config.js`, and a test must fail if the config drifts from the deck | Must Have |
| OUT-03 | The plan must be costed in its blocked state, at configured caps, and with caps lifted | Must Have |
| OUT-04 | The specific blockers must be named, and must be distinguished from the human approve gate, which is deliberate and permanent | Must Have |
| OUT-05 | The machine cost per lead and the human review cost per touch must be stated separately, because they scale differently | Must Have |
| OUT-06 | The opportunity cost of leaving the caps as configured must be quantified | Must Have |

### Deck integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| DECK-01 | Slide counters, navigation dots and `pptx.addSlide()` calls must all equal the slide count | Must Have |
| DECK-02 | Slide counters must form a complete sequence with no gap and no duplicate | Must Have |
| DECK-03 | Every slide must be exported to PPTX; a slide that exists only in HTML is a defect | Must Have |
| DECK-04 | Deck copy must contain no em dashes | Must Have |
| DECK-05 | Deck copy must contain no credit-provision vocabulary: `borrower`, `loan book`, `originations`, `underwriting` | Must Have |
| DECK-06 | Wide figure tables must scroll inside their own container; the page body must never scroll horizontally | Must Have |

---

## Amended Requirements

- **BOT-04** (v1.9.0) is extended: an AI or scraping agent whose token carries no
  `bot` substring, and which the generic `/crawler/` pattern does not match, must
  be named explicitly. The `crawl` stem specifically is not covered by
  `/crawler/`.
- **BOT-08** (v1.9.0) is satisfied for this release by
  `tests/unit/bot-blocklist-review-v1_10_0.test.js`.

---

## Deprecated Features

### Investor deck "Business Model" slide

- Removed in: v1.10.0
- Last available in: v1.9.0 — see `code-backups/v1.9.0/snapshot/investor-deck.html`
  (section `id="slide-6"`)
- Reason for removal: the slide's figures were not derivable from the platform.
  It claimed a "2-4% arrangement fee" where `fee.service.js` charges providers a
  flat 5%; it split revenue 40/35/25 across three streams with no basis in code;
  it described "Provider Fees: subscription + transaction fees" for a
  subscription the platform does not charge; and its unit economics block quoted
  a 10% blended take (R1,850 per arrangement) against an actual 6.2%, plus a
  R320 CAC that was a patient acquisition figure presented as though it were the
  cost of acquiring a provider.
- Replacement: slide 08 (`#slide-pricing`) states the shipped price list, and
  slide 09 (`#slide-unit-economics`) states the per-arrangement contribution
  model. Between them they make the same argument from the code.

### Superseded unit-economics figures

- Removed in: v1.10.0
- Last available in: v1.9.0 — see `code-backups/v1.9.0/snapshot/investor-deck.html`
- Reason for removal: superseded by the corrected model. Specifically
  `R1,850 (10%)` blended revenue per arrangement, `Target CAC: R320`,
  `Target Gross Margin: 68%`, `Target LTV:CAC Ratio: 5.8x` and
  `Target Payback Period: 2.1 months`.
- Replacement: R1,147 gross revenue and R1,009 contribution per arrangement,
  provider CAC of R4,800 founder-led and R2,700 at funded scale, an 88%
  contribution margin, 15.2x LTV:CAC and 1.9 months payback at the target
  practice profile. The take rate moved down, not up; the margin moved up because
  it is now a contribution margin on a correctly stated revenue base.

---

## Carried Forward

All requirements from v1.9.0 and earlier remain in force, in particular the
CLAUDE.md bot crawling prevention set (BOT-01 through BOT-08), the Shield gate
requirements (SHIELD-01 through SHIELD-06), and the requirement that any public
claim about Shield corresponds to a gate that exists in code. PRICE-01 and
OUT-02 extend that same principle from the risk engine to the price list and the
go-to-market plan.
