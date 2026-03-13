# v1.2.0 Release Notes

**Date:** 2026-03-12
**Type:** MINOR — new pages and API modules added

## What Was Added

### Payments UI (new pages)
- `payments.html` — My Payments page with tabs for active plans, upcoming, and history
- `make-payment.html` — Payment execution flow with plan selection and confirmation
- `payment-success.html` — Post-payment confirmation screen

### Provider Network — Extended API
- `POST /api/providers/apply` — Self-service provider application with AES-256-GCM encryption of banking data (replaces prior base64 stub)
- `POST /api/providers/track-cta` — CTA analytics tracking (never fails the caller; logs to audit_log)
- `GET /api/providers/admin/all` — Admin: list all providers including pending
- `GET /api/providers/admin/stats` — Admin: aggregate statistics by type, province, tier
- `PUT /api/providers/admin/:id/approve` — Admin: approve provider + set tier
- `PUT /api/providers/admin/:id/status` — Admin: activate / suspend / deactivate
- `PUT /api/providers/:id` — Admin: update provider details
- `DELETE /api/providers/admin/:id` — Admin: remove provider

All admin routes now require `authenticateToken` + `requireRole('admin')` middleware.

### Vercel Serverless
- `api/index.js` — Vercel serverless function entry point that exports the Express app
- `backend/src/server.js` — `VERCEL !== '1'` guard prevents `app.listen()` from running in serverless context
- `vercel.json` — Modernised to use `rewrites` syntax; retains `CORS_ORIGIN` + `ALLOW_DEMO_LOGIN` env vars

### Provider Section on Homepage
- `index.html` — New "Join the Network" providers section added above the footer

### Seed Data
- `backend/database/seed-providers.sql` — Initial seed of fictional SA healthcare providers (CareMax, ProHealth, MediPlus) for demo and development

### Tests
- `tests/integration/providers.test.js` — Expanded from 3 to 27 tests covering all new routes including access control (401 without auth)

## What Was Fixed

- **Security**: Provider `/apply` route used `Buffer.from(...).toString('base64')` as "encryption". Replaced with `encryptBankingData()` (AES-256-GCM, same as user banking data).
- **Auth**: All `/api/providers/admin/*` routes were unauthenticated. Added `authenticateToken + requireRole('admin')` to every admin route.
- **Vercel config**: `vercel.json` was missing `ALLOW_DEMO_LOGIN` and `CORS_ORIGIN` env vars from the old version. Restored.
- **Dashboard navigation**: Replaced emoji icons (💳 📅 📊) with class-based SVG icons matching the design system.
- **Footer links**: `providers.html` footer linked to `privacy.html` / `terms.html` (removed files). Updated to `privacy-policy.html` / `terms-of-service.html`. Removed dead Careers / Press links.
- **Nav link**: `index.html` nav linked "For Providers" to `provider-apply.html`. Updated to `providers.html`.

## Merge Resolution Summary

Merged `origin/main` (v1.1.0) into this branch. 12 files conflicted. Resolution decisions:
- `vercel.json` — modern rewrites syntax from branch + env vars from main
- `backend/src/server.js` — main's security startup banner + VERCEL guard from branch
- `backend/src/routes/providers.js` — full rewrite merging both, with security fixes
- `accessibility.html`, `licenses.html` — kept main's legally-cleaned versions
- `admin-dashboard.html`, `admin-providers.html` — kept main's SVG design-system versions
- `index.html`, `dashboard.html`, `providers.html` — kept branch's versions with manual fixes
- `provider-apply.html` — kept branch's complete version (mobile styles + footer)
- `package.json` — kept main's cleaner root package (node>=18)
