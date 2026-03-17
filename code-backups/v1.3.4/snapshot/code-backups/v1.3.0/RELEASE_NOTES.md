# Release Notes — v1.3.0

**Date**: 2026-03-12
**Type**: MINOR — Generic provider statement, new public pages, production compliance fixes

## Summary

Merged the `claude/generic-provider-statement-k7BqU` branch. Primary change: removed hard-coded third-party healthcare brand names from the landing page and replaced with generic compliant language. Also added About and Contact pages, fixed legacy page link references, and resolved all production deployment issues introduced in this branch.

## Changed

- **`index.html`**: Replaced "Accepted at leading SA healthcare providers including Netcare, Mediclinic, Life Healthcare and more" with generic compliant copy: "Accepted at a comprehensive network of registered healthcare providers nationwide."
- **`backend/src/server.js`**: Fixed Vercel guard from incorrect `NODE_ENV !== 'production' || !process.env.VERCEL` to correct `process.env.VERCEL !== '1'`; updated version string to v1.3.0
- **`vercel.json`**: Fixed serverless function destination from `/api` to `/api/index.js`; added `CORS_ORIGIN` and `ALLOW_DEMO_LOGIN` env vars
- **`package.json`**: Replaced bloated root package.json (had duplicate Express deps) with lean version; downgraded node engine from `24.x` to `>=18.0.0`
- **`privacy.html`** / **`terms.html`**: Fixed self-referential footer links to point to canonical `privacy-policy.html` and `terms-of-service.html`
- **`contact.html`**: Replaced production-unacceptable `alert()` submit handler with inline success/error divs and proper `fetch()` POST to `/api/contact`

## Added

- **`about.html`**: About Us page with company stats, mission statement, team section, and standard nav/footer
- **`contact.html`**: Contact page with form (name, email, subject, message), phone, email, address, and proper async form handling
- **`api/index.js`**: Vercel serverless entry point exporting the Express app

## Removed

Nothing removed from this version.

## Security

- Vercel guard fix ensures `app.listen()` never runs in serverless context, preventing port-binding errors
- No new security vulnerabilities introduced
