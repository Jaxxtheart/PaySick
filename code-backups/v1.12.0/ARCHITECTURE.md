# Architecture — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-10-26

---

## Changes from v1.11.0

This is a frontend release with one middleware blocklist addition. There are
no new routes, tables, or services, and no schema migration.

```
                         index.html  (static, served by Vercel)
 ┌──────────────────────────────────────────────────────────────────────┐
 │ nav: How it works · For providers · About · [Join the interest list] │
 │                                                                      │
 │ #top          hero + availability notice ──▶ terms-of-service.html   │
 │ #why          value pillars (3)                     #credit-status    │
 │ #how-it-works 4 future-tense steps + note                            │
 │ #providers    proposition + capabilities [IN DEVELOPMENT]            │
 │ #technology   technology statement                                   │
 │ #about        Built by Tech & Artery                                 │
 │ #interest     ┌──────────────────────┐  ┌───────────────────────────┐│
 │               │ patient-interest-form│  │ provider-interest-form    ││
 │               │ name, email          │  │ practice, contact, email, ││
 │               │ + honeypot           │  │ phone (opt) + honeypot    ││
 │               └──────────┬───────────┘  └────────────┬──────────────┘│
 │ footer        disclosure, links, © Tech & Artery     │               │
 └──────────────────────────┼────────────────────────────┼──────────────┘
                            ▼                            ▼
                     js/interest-forms.js  [NEW]
                     validate → honeypot check → submissionOutcome()
                     SUBMISSION_ENDPOINT = null
                        └─▶ "not open yet, not sent or stored —
                             email hello@paysick.co.za"   (no network call)

 REMOVED links from index.html: login.html, provider-apply.html,
 providers.html (directory). Those pages are unchanged and reachable by URL.
```

### Going live with interest registration (not done in this release)

1. Get owner and legal approval for a storage backend and a POPIA purpose
   statement. Update `privacy-policy.html` to match.
2. Add an authenticated or otherwise protected, rate-limited API route,
   test-first.
3. Set `SUBMISSION_ENDPOINT` and make `submissionOutcome()` report the
   endpoint's real response.

## Terms of Service

`terms-of-service.html` gains `#credit-status` ("Credit services and
regulatory status"), which is linked from the table of contents, the hero
notice, both forms, and the homepage footer. Operator and IP owner are now
Tech & Artery (Pty) Ltd.

## Bot protection

`backend/src/middleware/bot-blocker.js` has four new named UA patterns. Rate
limits are unchanged (global 100/15 min, auth 10/15 min, `/api/v1` 30/15 min).
The homepage honeypot anchor (`/api/hp-check`), the catch-all
`X-Robots-Tag` in `vercel.json`, and `robots.txt` are unchanged.

## Test topology

```
tests/unit/homepage-repositioning.test.js   ── reads index.html, terms-of-service.html
                                             └─ requires js/interest-forms.js
tests/unit/bot-blocklist-review-v1-12.test.js ── requires backend/src/middleware/bot-blocker.js
```

---

## Platform architecture (unchanged from v1.11.0)

See [v1.11.0/ARCHITECTURE.md](../v1.11.0/ARCHITECTURE.md) and its references
for the request path, Recovery Engine, bot-protection layer, and `/api/v1`
surface.
