# Release Notes — PaySick v1.5.2

**Version**: 1.5.2
**Date**: 2026-03-26
**Type**: PATCH — Bug fix: API routes still returning HTML 404 after v1.5.1

---

## Summary

Despite the v1.5.1 fix (moving deps to root `package.json`), `/api/*` routes continued returning Vercel's HTML 404 page. The file-based catch-all `api/[...slug].js` was not being reliably invoked by Vercel in production for `/api/*` requests — even with dependencies correctly installed.

## Root Cause

`api/[...slug].js` as a file-based Vercel catch-all requires Vercel's routing engine to correctly pattern-match the `[...slug]` dynamic segment. In production this was not happening — Vercel did not route `/api/users/forgot-password` (or any `/api/*` path) to the catch-all function.

## Fix

Added an explicit `rewrites` entry in `vercel.json` that unconditionally routes all `/api/(.*)` requests to `api/index.js`. Explicit rewrites are processed before file-based routing and are guaranteed to invoke the named function. Combined with the v1.5.1 fix (deps in root `package.json` so functions bundle correctly), this closes the 404 loop.

### vercel.json — before (v1.5.1)

```json
"rewrites": [
  { "source": "/health",    "destination": "/api/index.js" }
]
```

### vercel.json — after (v1.5.2)

```json
"rewrites": [
  { "source": "/health",    "destination": "/api/index.js" },
  { "source": "/api/(.*)", "destination": "/api/index.js" }
]
```

## Files Changed

| File | Change |
|------|--------|
| `vercel.json` | Added `/api/(.*)` → `/api/index.js` rewrite |

## No Breaking Changes

All API routes, frontend pages, database schema, and business logic are unchanged.
The health endpoint continues to work via its own rewrite.
Static pages (HTML, JS, CSS) are unaffected.
