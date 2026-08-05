# PaySick v1.10.1 — Release Notes

**Date**: 2026-08-04
**Type**: PATCH — routing fix
**Previous**: [v1.10.0](../v1.10.0/) (2026-08-04)

---

## Summary

`https://paysick.co.za/investors` returned a Vercel `404 NOT_FOUND`. The deck was
live the whole time, just not at the path people actually type.

The deck lives in `investor-deck.html`. With `cleanUrls: true` Vercel serves it
at `/investor-deck`, and `vercel.json` rewrote only `/health` and `/api/(.*)`,
so `/investors` resolved to nothing. This release adds the alias.

---

## The bug

| | |
|---|---|
| Reported as | `404: NOT_FOUND`, `Code: NOT_FOUND`, `ID: cpt1:cpt1::9cx8t-1785874438630-a7e23dc77041` |
| Actual path served | `/investor-deck` |
| Path requested | `/investors` |
| Root cause | No rewrite rule for `/investors`, and `cleanUrls` only strips the `.html` extension from a real file; it does not invent aliases |

Worth noting for the record: this was a Vercel path-not-found, not a build or
deployment failure. A missing deployment returns `DEPLOYMENT_NOT_FOUND`, so the
deployment had resolved correctly and only the path was wrong.

### Why it was not caught earlier

The only in-repo link to the deck is in `research.html`, and it correctly points
at `investor-deck.html`. Every internal link worked. `/investors` was only ever
reached by typing it or following a link shared out of band, so no broken-link
check would have found it.

---

## Fixed

- **`vercel.json`**: added a rewrite from `/investors` to
  `/investor-deck.html`, placed above the existing `/health` and `/api/(.*)`
  rules so it cannot shadow them.

A rewrite rather than a redirect: the address bar keeps `/investors`, so a link
already shared with an investor keeps working and keeps reading as the path it
was given.

The destination names the `.html` file explicitly. `cleanUrls` resolves the
extension for incoming request paths, not for rewrite destinations, so
`/investor-deck` as a destination would not have resolved.

## Added

- **`tests/unit/investors-route.test.js`** — 8 assertions. Pins the rewrite's
  existence, its destination, that it is a rewrite and not a redirect, that it
  does not shadow the API rules, and that the alias is covered by the bot
  protections.

---

## Bot protection review

CLAUDE.md requires that every new page or route be reviewed against the bot
crawling protections before merging. `/investors` is a new path, so:

| Protection | Status on `/investors` |
|---|---|
| `robots.txt` disallow all | Covered. `User-agent: *` / `Disallow: /` applies to every path. |
| `X-Robots-Tag` header | Covered. The `vercel.json` catch-all header block matches `/(.*)`, which includes `/investors`. |
| Rate limiting | Not applicable. Static asset served by Vercel's edge; the request never reaches Express, exactly as for `/investor-deck` and every other page. |
| Bot fingerprinting | Not applicable, same reason. |
| Honeypot | Inherited from the deck page itself; the alias serves the identical document. |
| No public source maps | Unchanged; no build step and no `.map` files. |
| API authentication | Not applicable. The rewrite targets a static file, and a test asserts the destination does not start with `/api/`. |

No protection is weakened by the alias: it serves byte-identical content to a
path that was already public.

---

## Test results

```
node --test tests/unit/*.test.js
# tests 677
# pass  676
# fail  1
```

8 new assertions, written and confirmed failing before the fix.

The single failure is `tests/unit/email-service.test.js`, which cannot resolve
`nodemailer` from the repository root because it is a `backend/` dependency. It
fails identically on a clean checkout and predates this release. Unrelated to
this change.

---

## Verification after deploy

`/investors` and `/investor-deck` should both return the deck. Both should carry
`X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`.
