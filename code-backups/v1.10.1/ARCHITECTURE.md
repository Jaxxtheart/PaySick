# Architecture — PaySick v1.10.1

**Version**: 1.10.1
**Date**: 2026-08-04

---

## Changes from v1.10.0

One rewrite rule in `vercel.json`. No application code changed: no route, no
service, no middleware, no schema, no migration.

The change is worth a diagram only because it clarifies something the previous
architecture documents left implicit, and which caused the bug: **static pages
and API routes resolve through two entirely different mechanisms**, and
`cleanUrls` only helps one of them.

---

## Path resolution

```
  Request
     │
     ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Vercel edge                                                     │
  │                                                                 │
  │  1. headers: /(.*)  ─▶  X-Robots-Tag on EVERY response          │
  │                          (applies before anything below)        │
  │                                                                 │
  │  2. rewrites, in declaration order:                             │
  │       /investors   ─▶ /investor-deck.html          [NEW v1.10.1]│
  │       /health      ─▶ /api/index.js                             │
  │       /api/(.*)    ─▶ /api/index.js                             │
  │                                                                 │
  │  3. cleanUrls: true                                             │
  │       /investor-deck ─▶ investor-deck.html                      │
  │       /login         ─▶ login.html                              │
  │       ... every other page, by filename                         │
  │                                                                 │
  │  4. static file lookup                                          │
  │       no match ─▶ 404 NOT_FOUND        ◀── /investors landed    │
  │                                            here before v1.10.1  │
  └──────────────────────────────┬──────────────────────────────────┘
                                 │ only /health and /api/* get this far
                                 ▼
                    api/index.js ─▶ Express
                      helmet, limiters, botBlocker,
                      honeypot, route dispatch
```

### The distinction that caused the bug

`cleanUrls` is **filename-derived**. It lets `/investor-deck` resolve to
`investor-deck.html` because that file exists. It cannot produce `/investors`,
because no `investors.html` exists. Aliases that do not correspond to a filename
must be declared as rewrites.

The same applies in the other direction, and is the second trap: a rewrite
**destination** is not subject to `cleanUrls`. Writing
`"destination": "/investor-deck"` would have failed, because at that point Vercel
is looking for a file, not applying the clean-URL rule again. The destination
must be `/investor-deck.html`.

### Ordering

Rewrites are evaluated top to bottom, so a rule placed above `/api/(.*)` can
swallow API traffic. `/investors` is an exact-match source with no capture group,
so it cannot, but the ordering constraint is now asserted by test
(`tests/unit/investors-route.test.js`) rather than left to reviewer attention,
because the next alias added may not be so narrow.

---

## Why a rewrite and not a redirect

```
  redirect:  GET /investors ─▶ 308 ─▶ GET /investor-deck ─▶ deck
                                      └─ address bar now reads /investor-deck

  rewrite:   GET /investors ────────────────────────────▶ deck
                                      └─ address bar still reads /investors
```

The deck's URL is shared out of band, in email and in conversation. A redirect
would silently rewrite the path under a reader who was given `/investors`, and
would mean the canonical link and the shared link disagree. A rewrite keeps them
the same. Since the whole site is `noindex` and `Disallow: /`, there is no SEO
duplicate-content cost to two paths serving one document.

---

## Bot protection coverage

Unchanged in shape. The point worth recording is that the alias needs no new
declaration to be protected, because both relevant controls are already
path-agnostic:

```
  robots.txt          User-agent: *  /  Disallow: /      ─▶ matches every path
  vercel.json headers source: "/(.*)"                    ─▶ matches every path
                      X-Robots-Tag: noindex, nofollow,
                      noarchive, nosnippet, noimageindex
```

The Express-layer controls (rate limiting, `botBlocker`, honeypot) do not apply
to `/investors` for the same reason they do not apply to `/investor-deck` or any
other page: static requests terminate at the edge and never reach Express. This
is the pre-existing design recorded in v1.9.0's architecture, and is precisely
why the `X-Robots-Tag` had to be declared in `vercel.json` as well as in
`server.js`.
