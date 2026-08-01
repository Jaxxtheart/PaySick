# Architecture — PaySick v1.9.0

**Version**: 1.9.0
**Date**: 2026-08-01

---

## Changes from v1.8.1

Three structural additions: a versioned API surface, a bot-protection layer in
front of all routes, and a server-side identity validation utility. Plus two
content additions (a deck slide and a page).

---

## Request path

The bot-protection layer is new in this release and sits ahead of every route.
Note that statically served pages never enter Express at all, which is why
`X-Robots-Tag` had to be declared in `vercel.json` as well as in `server.js`.

```
                    ┌─────────────────────────────────────┐
   HTML pages ─────▶│ Vercel static serving               │
   /index, /login   │  • vercel.json headers:             │
   /research, ...   │    X-Robots-Tag (catch-all)   [NEW] │
                    │  • cleanUrls: true                  │
                    │  • /robots.txt                [NEW] │
                    └─────────────────────────────────────┘
                              │ hidden honeypot anchors [NEW]
                              ▼
                       GET /api/hp-check
                              │
   /api/* ────────▶ ┌─────────────────────────────────────┐
                    │ api/index.js  →  Express            │
                    ├─────────────────────────────────────┤
                    │ 1. helmet + CORS                    │
                    │ 2. globalLimiter    (/api/, 100/15m)│
                    │ 3. v1Limiter        (/api/v1, 30/15m) [NEW]
                    │ 4. authLimiter      (login/register)│
                    │ 5. X-Robots-Tag header              │
                    │ 6. botBlocker              [NEW]    │
                    │ 7. honeypotBlockMiddleware [NEW]    │
                    │ 8. route dispatch                   │
                    └─────────────────────────────────────┘
```

Ordering matters: the honeypot block list is consulted before route dispatch, so
an IP that tripped the trap is refused everywhere, not only on the trap path.

---

## New: `/api/v1` facilitation surface

```
backend/src/routes/v1.js
   │
   ├── POST /applications              ─┐
   ├── POST /decisions/:applicationId   │  all four require
   ├── POST /payouts/:applicationId     │  authenticateToken
   └── GET  /schedules/:applicationId  ─┘
   │
   ├──▶ services/shield-gates.service.js
   │       GATE_1_PROVIDER      tier, billing agreement, 5% / 20% concentration
   │       GATE_2_AFFORDABILITY verified income < 90 days
   │       GATE_3_URGENCY       clinical urgency scoring
   │       GATE_4_TARIFF        ceiling from scheme tariffs
   │       GATE_5_CIRCUIT_BREAKER  anomaly halt → human review queue
   │
   ├──▶ services/schedule.service.js          arrangement schedules
   ├──▶ services/provider-scoring.service.js  provider risk score
   ├──▶ services/webhook-dispatcher.service.js outbound notifications
   ├──▶ utils/money.js                        money arithmetic
   │
   └──▶ adapters/
          debicheck.adapter.js
          dsp-check.adapter.js
          income-verification.adapter.js
```

Backed by migration `009_v1_api_surface.sql`. The migration runner sorts by
filename, so this was renumbered from the `008` it shipped as on its branch,
which collided with `008_outreach_agent.sql`.

### Two-stage payout

```
  procedure confirmed ──▶ provisional payout 80%
                                  │
                          EOB reconciliation
                                  │
                          final payout 20%
```

---

## New: bot-protection layer

```
backend/src/middleware/
   ├── bot-blocker.js    User-Agent fingerprint blocklist → 403 BOT_BLOCKED
   │                       • search engine crawlers
   │                       • SEO / analytics crawlers
   │                       • HTTP client libraries
   │                       • scraping frameworks, headless browsers
   │                       • AI training / retrieval crawlers      [NEW v1.9.0]
   │                       • generic /bot\b/ /crawler/ /spider/ ...
   │
   └── honeypot.js       in-memory blocked-IP set
                           honeypotTrapHandler      GET /api/hp-check
                           honeypotBlockMiddleware  403 HONEYPOT_BLOCKED
```

**Known limitation**: the honeypot block list is an in-process `Set`, so it does
not survive a restart and is not shared across serverless instances. On Vercel
each cold start begins with an empty list. Promoting it to a shared store is an
open follow-up, deliberately out of scope here.

---

## New: server-side identity validation

```
backend/src/utils/sa-id.js
   ├── validateSAID(value, { dateOfBirth })
   │     shape → embedded DOB → future check → citizenship digit → Luhn
   │     → optional cross-check against declared DOB
   ├── extractDateOfBirth(value)
   ├── resolveBirthYear(yy, now)   century pivot derived from `now`, not hardcoded
   └── luhnCheckDigit(first12)

  called from: routes/users.js  POST /register  → 400 INVALID_SA_ID
```

`register.html` performs the same checks in the browser. That copy is advisory;
this is the enforcement point.

---

## Changed: investor deck (17 slides)

Slide count grows 16 → 17 with the Shield™ risk-engine slide inserted at
position 12, before Team.

```
12  Shield™ Risk Engine   NEW — five gates, tariff billing controls,
                                two-stage payout, IP moat framing
13  Team                  (was 12)
14  Roadmap               (was 13)
15  The Ask               (was 14)
16  Vision & Close        (was 15)
```

The two-source drift risk called out in v1.8.1 is unchanged and now applies to
the Shield slide too: copy lives in both the slide HTML and the inline
`downloadPPTX()` generator. `tests/unit/investor-deck-shield.test.js` pins both,
and additionally asserts that every gate named on the slide has a matching
constant in `shield-gates.service.js`, so the deck cannot drift into claiming
capability the code does not have.

---

## Changed: page inventory

```
  research.html   NEW — publication placeholder, contact route,
                        linked from the index footer (Company group)
```

---

## Test topology

```
tests/unit/
   ├── static-bot-protection.test.js   vercel.json headers + honeypot anchors
   ├── bot-protection.test.js          robots.txt + UA classification + middleware
   ├── bot-blocklist-review.test.js    AI crawlers + v1 rate limit  [v1.9.0 review]
   ├── sa-id-validation.test.js        validator + century pivot + route wiring
   ├── investor-deck.test.js           deck invariants (count now 17)
   ├── investor-deck-shield.test.js    Shield slide ↔ shield-gates.service.js
   ├── research-page.test.js           page structure + no stale V4 payload
   ├── v1-shield-gates.test.js         gate engine
   ├── v1-schedule / v1-money / v1-provider-scoring / v1-adapters
   └── ... (inherited suites)
```

Runner: `node --test` (`npm test` from `backend/`). Integration suites use Jest.

**Environmental note**: `tests/unit/email-service.test.js` cannot resolve
`nodemailer` in environments where `registry.npmjs.org` is unreachable, and fails
there regardless of application code.

---

## Platform architecture (unchanged from v1.8.1)

See [v1.8.0/ARCHITECTURE.md](../v1.8.0/ARCHITECTURE.md) for the full platform and
outreach-agent architecture, which this release inherits without modification.
