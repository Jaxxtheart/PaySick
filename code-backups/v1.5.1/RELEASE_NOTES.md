# Release Notes — PaySick v1.5.1

**Version**: 1.5.1
**Date**: 2026-03-26
**Type**: PATCH — Bug fix: API routes returning HTML 404 in Vercel production

---

## Summary

All `/api/*` routes in production (paysick.co.za) were returning Vercel's HTML 404 page instead of JSON responses. This caused the frontend's `response.json()` call to throw, surfacing "Server error (404). Please try again shortly." on all pages that make API calls (login, register, forgot-password, etc.).

## Root Cause

Vercel's serverless function bundler (`@vercel/nft`) traces `require()` calls starting from `api/index.js` and `api/[...slug].js`. These files require `../backend/src/server`, which in turn requires `express`, `pg`, `helmet`, and other packages. All these packages lived exclusively in `backend/node_modules/`.

The root `package.json` had a `postinstall` script (`cd backend && npm install`) intended to install backend dependencies into `backend/node_modules` during Vercel's build. However, if `postinstall` failed silently (e.g., network error, policy restriction), `backend/node_modules` would be empty or absent. With no `express` in any discoverable `node_modules`, `@vercel/nft` could not trace the dependency graph and the functions were never bundled — leaving Vercel with no function to invoke for `/api/*` paths, hence the HTML 404.

## Fix

Moved all backend production dependencies from `backend/package.json` into the root `package.json`. Vercel's primary `npm install` (which always runs and targets the root) now installs all required packages into root `node_modules`. Node.js module resolution from `backend/src/server.js` walks up the directory tree and finds packages in root `node_modules` — no secondary install step required.

Removed the `postinstall` script from root `package.json` since it is no longer needed for production.

### Before

**Root `package.json`** — no `dependencies`, only a `postinstall` relying on a separate `npm install`:
```json
{
  "scripts": {
    "postinstall": "cd backend && npm install"
  }
}
```

### After

**Root `package.json`** — all production dependencies declared directly:
```json
{
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "nodemailer": "^6.9.9",
    "pg": "^8.11.3",
    "uuid": "^9.0.1"
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Added all backend production dependencies; removed `postinstall` script |

## No Breaking Changes

- All API routes, frontend pages, database schema, and business logic are unchanged.
- `backend/package.json` is unchanged — local development using `cd backend && npm install` still works.
- The catch-all `api/[...slug].js` and `api/index.js` are unchanged.
