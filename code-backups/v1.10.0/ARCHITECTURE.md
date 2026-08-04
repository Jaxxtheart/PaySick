# Architecture — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-08-04

---

## Changes from v1.9.0

No structural change to the runtime. The backend gained eight User-Agent
patterns in the bot blocklist and nothing else: no route, no service, no schema,
no migration, no fee constant.

The change in this release is a **documentation dependency**, and it is worth
drawing because it is now enforced by tests rather than by convention. The
investor deck used to be a standalone artefact whose commercial claims drifted
from the platform. It is now a derived view: three source files determine what
the deck is allowed to say, and CI fails if the deck and its sources disagree.

---

## The deck-to-code dependency (new in v1.10.0)

```
  ┌──────────────────────────────────────────────────────────────────┐
  │ SOURCES OF TRUTH (code)                                          │
  ├──────────────────────────────────────────────────────────────────┤
  │                                                                  │
  │  backend/src/services/fee.service.js                             │
  │    PROVIDER_SERVICE_FEE_PCT        = 0.05  ──┐                    │
  │    PATIENT_LATE_FEE_PCT_PER_MONTH  = 0.05  ──┤                    │
  │    PATIENT_BASE_INTEREST_RATE      = 0.00  ──┤                    │
  │                                              │                    │
  │  backend/src/config/outreach.config.js       │                    │
  │    dailySourceCap  = 20                    ──┤                    │
  │    dailyDraftCap   = 15                    ──┤                    │
  │    activeVerticals = ['aesthetics']        ──┤                    │
  │                                              │                    │
  │  backend/src/services/shield-gates.service.js│                    │
  │    five gates, 5% / 20% concentration caps ──┤                    │
  └──────────────────────────────────────────────┼────────────────────┘
                                                 │
                          ┌──────────────────────▼───────────────────┐
                          │ tests/unit/                              │
                          │   investor-deck-business-case.test.js    │
                          │   investor-deck.test.js                  │
                          │   investor-deck-shield.test.js           │
                          ├──────────────────────────────────────────┤
                          │ Reads BOTH the source constants and the  │
                          │ rendered deck, and asserts they agree.   │
                          │ Re-derives each published figure in the  │
                          │ test rather than string-matching it.     │
                          └──────────────────────┬───────────────────┘
                                                 │
  ┌──────────────────────────────────────────────▼───────────────────┐
  │ DERIVED VIEW                                                     │
  │ investor-deck.html  (21 slides, HTML + PPTX export)              │
  │                                                                  │
  │   08 Pricing            ← fee.service.js                         │
  │   09 Unit economics     ← fee.service.js + net loss rate         │
  │   10 Customer economics ← unit economics + CAC model             │
  │   11 Capabilities       ← the shipped service modules            │
  │   12 Outreach at scale  ← outreach.config.js + funnel model      │
  └──────────────────────────────────────────────────────────────────┘
```

The arrow runs one way. If a fee rate changes in `fee.service.js`, the deck tests
fail and the deck must follow. The failure mode this prevents is the one that
caused this release: a deck claiming a 2-4% arrangement fee for eleven versions
while the platform charged 5%.

---

## Deck slide map (21 slides)

Slides 08 to 12 are the commercial block rebuilt in this release. Counters now
run 01 through 21 with no gap; v1.9.0 skipped `12 / 17` and printed `13 / 17`
twice.

```
  01 Cover                    slide-0
  02 Problem                  slide-1
  03 Market ladder            slide-2
  04 Phase 1 / Phase 2        slide-sequencing
  05 Why now                  slide-3
  06 Solution                 slide-4
  07 How it works             slide-5
 ┌──────────────────────────────────────────────────────── commercial block ──┐
 │ 08 Pricing                 slide-pricing            [NEW, replaces slide-6]│
 │ 09 Unit economics          slide-unit-economics     [NEW]                  │
 │ 10 Customer profitability  slide-provider-economics [NEW]                  │
 │ 11 Capability value        slide-capability-case    [NEW]                  │
 │ 12 Outreach at scale       slide-outreach-scale     [NEW]                  │
 └────────────────────────────────────────────────────────────────────────────┘
  13 Risk management          slide-7
  14 Moats                    slide-8
  15 Why big BNPL can't       slide-9
  16 Medical Risk Score       slide-10
  17 Shield risk engine       slide-shield
  18 Operating model          slide-11
  19 Roadmap                  slide-12
  20 The ask                  slide-13
  21 Close                    slide-14
```

Each slide exists twice: as a `<section class="slide">` in the document, and as a
`pptx.addSlide()` call in `downloadPPTX()`. A slide added to one and not the
other is a test failure (DECK-01, DECK-03).

---

## Value chain represented on slide 11

The capability slide is a view over modules that already existed. This is where
each sits in the request path, and what it is credited with:

```
  Patient at point of care
        │
        ▼
  applications ──▶ Shield five gates ──────────────▶ decision
                   shield-gates.service.js           │
                   provider · affordability ·        │  R1.96M/yr loss avoided
                   urgency · tariff · circuit        │
        ┌──────────────────────────────────────────┘
        ▼
  marketplace-auction.service.js ──▶ funding partners compete
        │                             R145M/yr off balance sheet
        │                             R2.9M/yr placement revenue
        ▼
  debicheck.adapter.js ──▶ authenticated mandate
        │                   holds default at 1.4% vs 3.2%
        ▼
  schedule.service.js ──▶ 3 instalments, R0 to the patient
        │
        ▼
  provider settlement (gross less 5%) ──▶ provider dashboard + EOB reconciliation
                                           R2.13M/yr servicing removed

  Alongside, not in the request path:
    circuit-breaker.service.js   portfolio halt triggers      (funding precondition)
    outreach/ pipeline           provider acquisition          R1.30 machine cost/lead
    routes/v1.js + webhooks      embeddable facilitation API   R108K CAC avoided per
                                                               40-practice integration
```

---

## Bot protection layer (unchanged in shape)

The request path is exactly as documented in v1.9.0. The only change is the
contents of `BOT_USER_AGENT_PATTERNS` in
`backend/src/middleware/bot-blocker.js`, which gained a fourth named group:

```
  BOT_USER_AGENT_PATTERNS
    ├── search engine crawlers
    ├── SEO / analytics crawlers
    ├── HTTP client libraries, scraping frameworks, headless browsers
    ├── AI training and retrieval crawlers        (reviewed v1.9.0)
    ├── second-wave AI and scraping agents        (reviewed v1.10.0)  [NEW]
    │     Meta-ExternalFetcher · MistralAI-User · Perplexity-User
    │     Firecrawl · crawl4ai · Webzio-Extended · SerpApi · Cotoyogi
    └── generic /bot\b/ /crawler/ /spider/ /scraper/ /archiver/ /fetch\b/
```

The second-wave group exists for the same reason as the first: these agents are
not caught by the generic patterns. `Meta-ExternalFetcher`, `MistralAI-User` and
`Perplexity-User` carry no `bot` token; `Firecrawl` and `crawl4ai` carry a
`crawl` stem that `/crawler/` does not match. Naming them keeps the list
auditable instead of relying on an accident of the generic patterns.

`Devin`, `NovaAct` and `Operator` were considered and rejected: each is a real
agent token but also a common word or product name that a substring match would
find inside legitimate User-Agent strings. That decision is recorded in the test
file so the next review does not re-open it.

---

## Presentation layer additions

`.ledger` is a theme-aware figure table used by the five new slides. It resolves
against light, dark and gradient slide backgrounds through descendant selectors
rather than per-slide overrides, right-aligns numeric columns with
`font-variant-numeric: tabular-nums`, and is wrapped in `.ledger-wrap`
(`overflow-x: auto`) so wide tables scroll inside their own container and the
page body never scrolls horizontally (DECK-06).

`.pill--blocked` inverts on gradient slides, where the default translucent-red
treatment would be invisible against the brand red background.
