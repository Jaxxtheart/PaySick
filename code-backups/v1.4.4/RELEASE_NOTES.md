# Release Notes — PaySick v1.4.4

**Version**: 1.4.4
**Date**: 2026-03-26
**Type**: PATCH — Bug fix: login shows raw SyntaxError to user on non-JSON server response

---

## Summary

`login.html` was calling `response.json()` bare inside the outer try/catch. When the API returned an HTML error page (e.g. a Vercel "The page cannot be found" page), the SyntaxError message ("Unexpected token 'T', \"The page c\"... is not valid JSON") propagated to the outer catch block and was shown verbatim to users in the error banner.

Fixed by wrapping `response.json()` in an inner try/catch — the same defensive pattern already in place in `register.html` since v1.3.1.

---

## Fixed

- `login.html` — inner try/catch around `response.json()`. Non-JSON server responses (HTML 404, HTML 500, etc.) now display "Server error (N). Please try again shortly." instead of the raw SyntaxError text.

---

## Added

- `tests/unit/login-error-handling.test.js` — 8 regression tests covering:
  - HTML 404 → friendly message
  - HTML 500 → friendly message
  - No SyntaxError text in user-visible message
  - Status code present in friendly message
  - Successful 200 + accessToken → null (handled by caller)
  - 403 EMAIL_UNVERIFIED → verification message
  - 401 with error body → API error message
  - 401 with empty body → fallback message

**Total unit tests: 67** (was 59 in v1.4.3).

---

## Note on Snapshot

This version was developed as part of the `claude/footer-company-mobile-login-ZSy48` branch together with v1.5.0. The full codebase snapshot at this point is equivalent to the v1.5.0 snapshot minus the forgot-password / reset-password additions. See `code-backups/v1.5.0/snapshot/` for the closest complete reference.
