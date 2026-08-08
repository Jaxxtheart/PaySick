# Architecture — PaySick v1.10.0

**Version**: 1.10.0
**Date**: 2026-08-08

---

## Changes from v1.9.0

One structural change, inside the outreach agent: the message path gains two new
gates that sit between drafting and the approve queue, and again between the
approve queue and the send. Targeting widens from one active vertical to two, and
sourcing widens from one Places term per vertical to a list.

Nothing outside `backend/src/services/outreach/`, `backend/src/routes/outreach.js`,
`backend/src/middleware/bot-blocker.js` and `backend/src/server.js` changed. No
migration. No patient-facing page changed.

---

## The message path (every gate is code, not prompt)

```
  Stage 3 draft                    follow-up steps 1-3          inbound reply
  claude.service                   sequence.service             claude.service
  generateDraft()                  stepContent()                generateOnboardingReply()
        │                                │                             │
        └────────────────┬───────────────┴─────────────────────────────┘
                         ▼
             ┌───────────────────────────────────────────┐
             │ style.js        strip em/en dashes  [NEW]  │
             │ cta.js          force the register  [NEW]  │
             │                 CTA above the sign-off     │
             │ signoff.js      "Best, The PaySick Team"   │
             │ compliance.service   terminology linter    │
             └───────────────────────────────────────────┘
                         │
              flags? ────┴──── clean
                 │               │
                 ▼               ▼
          compliance_hold      draft
                 │               │
                 └──────┬────────┘
                        ▼
              admin-approve-queue.html          THE HUMAN GATE
                        │
        ┌───────────────┼────────────────┬──────────────┐
        ▼               ▼                ▼              ▼
      edit            reject          approve       mark-replied
        │                                │
   style + cta                     style + cta + linter   [NEW at approve]
   + linter re-run                 → persist final copy
        │                                │
        ▼                                ▼
   draft / hold                   sent (the only path)
```

The edit and approve gates are new in this release. Before v1.10.0 an edit
re-ran the linter only, and approve re-ran the linter only, so a founder could
edit the registration link out of a message or paste an em dash back in and the
message would go out that way.

### `style.js`

```
stripEmDashes(text)
   1. (\d)—(\d)          →  "110 to 150"       numeric range
   2. ^\s*— at line start →  "- "               bullet marker
   3. — before a newline  →  removed            nothing to join
   4. any remaining —     →  ", "               clause join
   5. tidy ",," " ," ",." and a trailing ","
   6. final sweep: no dash character can survive the function
```

Idempotent. Ordinary hyphens (`follow-up`, `e-mail`) are untouched. Covers em
dash, en dash, horizontal bar, figure dash and minus sign.

### `cta.js`

```
ensureRegistrationCta(text, { short })
   already has the link?  →  return unchanged      (idempotent)
   ends with the sign-off? →  insert above it
   otherwise               →  append

registrationUrl()  =  publicSiteUrl() + "/provider-apply.html"

publicSiteUrl()    =  PUBLIC_SITE_URL
                   →  APP_URL          (skipped when it is localhost)
                   →  https://paysick.co.za
```

The link always ends its own line: a trailing full stop is swallowed into the
href by mail and DM clients, which would break the one link the message exists to
deliver.

---

## Changed: Stage 1 sourcing

```
  for each active vertical            ['aesthetics', 'dental']
     vertical share = ceil(dailySourceCap / verticals.length)     [NEW]
     for each search term             string OR list              [NEW]
        for each target metro
           places.textSearch(term, metro)
              dedupe on place_id, honour do_not_contact
              stop at the vertical share, and at the global cap
```

Both caps are needed. The global cap protects the Places and Anthropic quota; the
per-vertical share stops aesthetics, first in the list, from consuming the whole
budget before dental is reached.

```
VERTICAL_SEARCH_TERMS
   aesthetics    'aesthetic clinic'
   dental        ['dentist', 'dental practice', 'dental clinic',
                  'dental implants', 'orthodontist', 'cosmetic dentist']   [NEW]
   fertility     'fertility clinic'
   ...
```

---

## Changed: request path

```
   /api/* ────────▶ ┌─────────────────────────────────────────────┐
                    │ api/index.js  →  Express                    │
                    ├─────────────────────────────────────────────┤
                    │ 1. helmet + CORS                            │
                    │ 2. globalLimiter    (/api/,        100/15m) │
                    │ 3. v1Limiter        (/api/v1,       30/15m) │
                    │ 4. outreachLimiter  (/api/outreach, 60/15m) │ [NEW]
                    │ 5. authLimiter      (login/register)        │
                    │ 6. X-Robots-Tag header                      │
                    │ 7. botBlocker                               │
                    │ 8. honeypotBlockMiddleware                  │
                    │ 9. route dispatch                           │
                    └─────────────────────────────────────────────┘
```

`/api/outreach` carries two routes reachable without a session: `POST /inbound`
(the Resend webhook, signature-gated) and `GET|POST /daily` (secret-gated, and
one call runs a Places + Anthropic pipeline). Neither should get the allowance of
a read endpoint. 60 per 15 minutes sits well above what the admin approve queue
generates in practice.

The blocklist gained a category at this review:

```
backend/src/middleware/bot-blocker.js
   ├── search engine crawlers
   ├── SEO / analytics crawlers
   ├── HTTP client libraries        + okhttp, Apache-HttpClient       [NEW]
   ├── scraping frameworks, headless browsers
   ├── AI training / retrieval crawlers            [v1.9.0]
   ├── user-triggered fetchers and scraping services                  [NEW]
   │     Perplexity-User, Claude-User, meta-externalfetcher,
   │     Firecrawl, Webzio-Extended, AI2Bot, PanguBot, DuckAssistBot
   └── generic /bot\b/ /crawler/ /spider/ /scraper/ /archiver/ /fetch\b/
```

The five named first carry no `bot`, `crawler` or `spider` token, so nothing else
in the list catches them. `meta-externalfetcher` escapes `/fetch\b/` as well,
because the token runs on into `fetcher`.

---

## Test topology

```
tests/unit/
   ├── outreach-style.test.js                  em/en dashes, CTA gate,
   │                                           sequence copy, drafting path  [NEW]
   ├── outreach-dental.test.js                 dental config, fit score,
   │                                           multi-term sourcing, cap share [NEW]
   ├── bot-blocklist-review-v1.10.0.test.js    MINOR-bump security review     [NEW]
   ├── outreach-compliance / -scoring / -pipeline / -signoff / -inbound
   ├── bot-protection / static-bot-protection / bot-blocklist-review
   └── ... (inherited suites)
```

Runner: `node --test "tests/unit/*.test.js"`.

**Environmental note** (unchanged from v1.9.0): `tests/unit/email-service.test.js`
cannot resolve `nodemailer` where `registry.npmjs.org` is unreachable, and fails
there regardless of application code.

---

## Platform architecture (unchanged from v1.9.0)

See [v1.9.0/ARCHITECTURE.md](../v1.9.0/ARCHITECTURE.md) for the request path,
`/api/v1` surface, bot-protection layer and identity validation, and
[v1.8.0/ARCHITECTURE.md](../v1.8.0/ARCHITECTURE.md) for the full platform and
outreach-agent architecture, both inherited here without modification.
