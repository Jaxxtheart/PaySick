# Requirements & Specifications — PaySick v1.10.1

**Version**: 1.10.1
**Date**: 2026-08-04

Carries forward all requirements from v1.10.0 and its predecessors, and adds the
requirements below. This is a PATCH release: a routing fix, no new functionality.

---

## New Requirements

### Public route aliases

| ID | Requirement | Priority |
|----|-------------|----------|
| ROUTE-01 | The investor deck must be reachable at `/investors` as well as `/investor-deck` | Must Have |
| ROUTE-02 | `/investors` must be served by a rewrite, not a redirect, so a link already shared keeps its path in the address bar | Must Have |
| ROUTE-03 | A rewrite destination must name the file including its extension; `cleanUrls` resolves extensions for incoming request paths only, not for rewrite destinations | Must Have |
| ROUTE-04 | A page alias must not be declared as a catch-all, and must not be ordered so that it shadows the `/health` or `/api/(.*)` rewrites | Must Have |
| ROUTE-05 | Every public path alias must be covered by a test asserting the target file exists, so an alias cannot outlive the page it points at | Must Have |
| ROUTE-06 | A rewrite whose source is a marketing page must not resolve to an API handler | Must Have |

---

## Amended Requirements

- **BOT-01** and **BOT-02** (v1.9.0) are confirmed to extend to path aliases.
  `robots.txt` disallows all paths and the `vercel.json` `X-Robots-Tag` header
  block matches `/(.*)`, so an alias inherits both without further declaration.
  `tests/unit/investors-route.test.js` asserts this rather than assuming it.

- The CLAUDE.md rule that "every new page or API route added must be reviewed to
  confirm all protections above apply before merging" is read to include **path
  aliases to existing pages**. The review for `/investors` is recorded in
  [RELEASE_NOTES.md](./RELEASE_NOTES.md).

---

## Carried Forward

All requirements from v1.10.0 and earlier remain in force, including the pricing
and economics requirements introduced in v1.10.0 (PRICE-01 through PRICE-08,
ECON-01 through ECON-09, CAP-01 through CAP-04, OUT-01 through OUT-06,
DECK-01 through DECK-06) and the bot crawling prevention set (BOT-01 through
BOT-08).

No requirement was deprecated in this release.
