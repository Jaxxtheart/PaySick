# Architecture — PaySick v1.11.0

**Version**: 1.11.0
**Date**: 2026-08-04

---

## Changes from v1.10.1

One slide deleted from the investor deck, and the inbound webhook's
authentication decision extracted from the route into a pure, testable function
in the service layer.

The architectural point worth recording is the second one, because it exposes a
dependency that was real but undocumented: **the inbound webhook is not an
optional enrichment of the outreach agent, it is a correctness dependency of the
follow-up sequence.**

---

## The sequence depends on the webhook

```
   Provider replies to an outreach email
              │
              ▼
   ┌──────────────────────────────────────┐
   │ Resend inbound                       │
   │   (requires MX + webhook endpoint)   │
   └──────────────┬───────────────────────┘
                  │  POST /api/outreach/inbound
                  ▼
   ┌──────────────────────────────────────┐
   │ inboundAuthResult()          [MOVED] │
   │   shared secret → svix signature     │
   │   distinct code per failure  [NEW]   │
   └──────────────┬───────────────────────┘
                  │ ok
                  ▼
   ┌──────────────────────────────────────┐
   │ INSERT outreach_touches              │
   │   direction = 'inbound'   ◀──────────┼── the row everything hinges on
   │ UPDATE outreach_providers            │
   │   stage = 'replied'                  │
   │   next_action_at = NULL              │
   └──────────────┬───────────────────────┘
                  ▼
        human-gated onboarding draft
              → Approve Queue


   Meanwhile, the daily pipeline, stage 4:

   getContactedDueForFollowup()
     WHERE stage = 'contacted'
       AND next_action_at <= now()
       AND NOT EXISTS (SELECT 1 FROM outreach_touches
                        WHERE provider_id = op.id
                          AND direction = 'inbound')   ◀── the ONLY reply guard
```

The `NOT EXISTS` clause is the entire mechanism preventing a follow-up to
someone who has answered. Inbound rows have exactly one writer: the webhook. So
with the webhook unwired, the guard can never fire, and a provider who replies
receives the day 3 bump, the day 7 value mail and the day 14 breakup regardless.

Nothing in the pipeline detects this. There is no second signal, no bounce
heuristic, no manual override in the queue. That is why the webhook is recorded
here as a dependency of sequence correctness rather than as a feature, and why
`OUTREACH_AGENT_README.md` now warns about it above the setup steps rather than
below them.

---

## Authentication decision moved to the service layer

Before, the route held a boolean predicate:

```
  routes/outreach.js
    checkInboundSignature(req) -> true | false
      └── on missing rawBody, fell back to JSON.stringify(req.body)
```

After:

```
  services/outreach/inbound.service.js
    inboundAuthResult(req, secret, nodeEnv)
      -> { ok, code, reason }
      └── never re-serialises; missing rawBody is its own reported fault

  routes/outreach.js
    401 { error, code, reason }  +  console.warn(code, reason)
```

Two reasons for the move. First, the predicate was untestable in place: it read
`process.env` directly and lived behind an Express handler. Taking `secret` and
`nodeEnv` as arguments makes every branch reachable from a unit test, including
the production-versus-development split. Second, a boolean cannot carry a
diagnosis, and every failure on this path surfaces as an identical 401, so a
misconfigured webhook and a forged request were indistinguishable from outside
*and* from the logs.

### Evaluation order

```
  1. x-webhook-secret matches?          ──▶ ok: SHARED_SECRET
       (checked first: independent of raw body)
  2. no secret configured?
       production   ──▶ refuse: NO_WEBHOOK_SECRET
       otherwise    ──▶ ok:     DEV_NO_SECRET
  3. svix headers missing?              ──▶ refuse: MISSING_SIGNATURE_HEADERS
  4. rawBody null or zero-length?       ──▶ refuse: RAW_BODY_UNAVAILABLE
  5. HMAC over `${id}.${ts}.${raw}`     ──▶ ok:     SVIX_SIGNATURE
       else                             ──▶ refuse: SIGNATURE_MISMATCH
```

Step 1 is deliberately ahead of everything else. The shared-secret header is the
only path that does not depend on raw-body capture, so on a runtime that consumes
the request stream before Express sees it, it is the one mechanism that still
works. It is strictly weaker (no replay protection, no binding to the body), so
it stays a fallback rather than the recommendation.

Step 4 is the defect this release fixes. Previously a missing raw body fell
through to a stringify-and-compare that could not succeed, reporting a signature
mismatch and pointing the operator at the secret instead of at the request
pipeline.

### Where the raw body comes from

```
  server.js
    app.use(express.json({
      verify: (req, res, buf) => { req.rawBody = buf; }   ◀── the whole mechanism
    }))
```

A single hook, and nothing else in the codebase populates `req.rawBody`. A test
now asserts its presence, because deleting it would break webhook verification
in a way that no other test would catch and that reads as an authentication
problem rather than a parsing one.

---

## Deck slide map (20 slides)

Slide 12 removed; everything after it shifts down one.

```
  01 Cover                    slide-0
  02 Problem                  slide-1
  03 Market ladder            slide-2
  04 Phase 1 / Phase 2        slide-sequencing
  05 Why now                  slide-3
  06 Solution                 slide-4
  07 How it works             slide-5
 ┌────────────────────────────────────────────── commercial block ──┐
 │ 08 Pricing                 slide-pricing                         │
 │ 09 Unit economics          slide-unit-economics                  │
 │ 10 Customer profitability  slide-provider-economics              │
 │ 11 Capability value        slide-capability-case                 │
 └──────────────────────────────────────────────────────────────────┘
     ✗  Outreach at scale     slide-outreach-scale   [DELETED v1.11.0]
  12 Risk management          slide-7
  13 Moats                    slide-8
  14 Why big BNPL can't       slide-9
  15 Medical Risk Score       slide-10
  16 Shield risk engine       slide-shield
  17 Operating model          slide-11
  18 Roadmap                  slide-12
  19 The ask                  slide-13
  20 Close                    slide-14
```

### A trap in `downloadPPTX()`

The `// Slide N:` comments inside `downloadPPTX()` are **not in sequence** and do
not correspond to slide position. The commercial block was inserted as
`// Slide 8` through `// Slide 12`, immediately followed by the pre-existing
`// Slide 8: Risk Management`, so the numbering restarts mid-function and
several numbers appear twice.

This is not cosmetic. Deleting a PPTX block by searching for the next
`// Slide N+1:` comment matches a block roughly seven slides later and silently
removes everything in between. That happened during this release and was caught
only by the `addSlide` count assertion. Delete by explicit line boundary, and
trust the count assertion over the comments.
