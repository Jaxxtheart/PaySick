# Release Notes — PaySick v1.3.2

**Version**: 1.3.2
**Date**: 2026-03-13
**Type**: PATCH — Bug fix

---

## Summary

Applied the same server-resilience and error-display fixes (introduced in v1.3.1 for user registration) to the provider registration flow in `provider-apply.html`.

---

## Bug Fixes

### `response.json()` failure masked as unhelpful alert on provider application
- **File**: `provider-apply.html`
- **Problem**: The submit handler had two `response.json()` calls — one on the error path and one on the success path — both inside the same `try/catch`. If the server returned a non-JSON body (e.g. the HTML error page produced when the hosting layer catches a crashed API process), `response.json()` threw a `SyntaxError`. The catch block then fired `alert()` with the raw SyntaxError message, which is not meaningful to a user.
- **Fix**: Wrapped `response.json()` in its own inner try/catch. Non-JSON responses now surface as `Server error (N)` with the actual HTTP status code. The single `response.json()` call now handles both success and error bodies (eliminating the double-parse), and all error paths display the message in an inline banner rather than `alert()`.

### `alert()` replaced with inline error banner
- **File**: `provider-apply.html`
- **Problem**: Error feedback used `alert()`, which blocks the browser, cannot be styled, and forces the user to dismiss a modal before being able to correct their form.
- **Fix**: Added `.error-banner` CSS class and `#errorBanner` element above the submit button. All error paths write to this element instead.

---

## No Changes To

- API routes or backend logic
- `database.js` (already fixed in v1.3.1)
- Any other frontend pages
