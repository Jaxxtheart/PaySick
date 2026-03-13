# Release Notes — PaySick v1.3.3

**Version**: 1.3.3
**Date**: 2026-03-13
**Type**: PATCH — Bug fix

---

## Summary

Fixed the demo site breaking after selecting a procedure type. Three related bugs prevented a demo user from completing a marketplace funding application.

---

## Bug Fixes

### `dashboard.html` — "Apply for Funding" routed to onboarding instead of marketplace
- **Problem**: The "Apply for Funding" nav item and the "Apply now" inline link both pointed to `onboarding.html`. A user who had already completed onboarding was immediately redirected back to `dashboard.html` (because `paysick_onboarding_complete === 'true'`), creating a dead end with no path to the procedure-type selection in `marketplace-apply.html`.
- **Fix**: Both links changed to `marketplace-apply.html`.

### `api-client.js` — Non-JSON server responses produced cryptic SyntaxError toasts
- **Problem**: `response.json()` was inside the same `try/catch` as `fetch()`. When the server returned a non-JSON body (e.g. an HTML error page), a `SyntaxError` like "Unexpected token '<'..." was caught and re-thrown, surfacing as an unhelpful toast on every page that uses `PaySickAPI` (dashboard, marketplace-apply, payments, etc.).
- **Fix**: `response.json()` wrapped in its own inner `try/catch`. Non-JSON responses now surface as `Server error (N). Please try again shortly.` with the HTTP status code.

### `demo-login.html` — Same non-JSON pattern on the login step
- **Problem**: The same `response.json()` inside a broad catch. If the API returned an HTML error page on demo login, the catch block received a `SyntaxError`, and the status message showed the raw JS error rather than a meaningful message — and more critically, the auth token was never stored so all subsequent API calls would fail with a 401.
- **Fix**: `response.json()` wrapped in its own inner `try/catch` with a readable `Server error (N). Is the server running?` message.

---

## No Changes To

- Backend API routes
- `database.js` (already fixed in v1.3.1)
- `register.html` (already fixed in v1.3.1)
- `provider-apply.html` (already fixed in v1.3.2)
