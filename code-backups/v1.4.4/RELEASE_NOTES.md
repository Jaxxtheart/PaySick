# Release Notes — PaySick v1.4.4

**Version**: 1.4.4
**Date**: 2026-03-26
**Type**: PATCH — Bug fix: login shows raw SyntaxError instead of friendly message on server error

---

## Summary

Fixed `login.html` showing the raw JavaScript SyntaxError message to users when the login API returned a non-JSON response (e.g. a Vercel HTML error page during a cold-start failure or deployment issue).

**Before fix — user saw:**
```
Unexpected token 'T', "The page c"... is not valid JSON
```

**After fix — user sees:**
```
Server error (404). Please try again shortly.
```

---

## Root Cause

`response.json()` was called bare inside the outer `try/catch` in the login form submit handler. When the API returns an HTML body (not JSON), `response.json()` throws a `SyntaxError`. That error propagated to `catch (error)`, where `error.message` was set as the banner text verbatim.

`register.html` already had the correct inner try/catch pattern (added in v1.3.1). `login.html` was missed.

---

## Fix

**`login.html`** — wrapped `response.json()` in an inner try/catch:

```javascript
// Before (bare call — SyntaxError propagates to user):
const data = await response.json();

// After (protected — friendly message on non-JSON response):
let data;
try {
    data = await response.json();
} catch {
    errorMessage.textContent = `Server error (${response.status}). Please try again shortly.`;
    errorMessage.classList.add('show');
    setTimeout(() => errorMessage.classList.remove('show'), 4000);
    return;
}
```

---

## Test Added

**`tests/unit/login-error-handling.test.js`** — 8 new tests:

| Test | Result |
|------|--------|
| HTML 404 → friendly message | ✓ |
| HTML 500 → friendly message | ✓ |
| Friendly message contains no SyntaxError text | ✓ |
| Friendly message includes HTTP status code | ✓ |
| Successful 200 + accessToken → null (success) | ✓ |
| 403 EMAIL_UNVERIFIED → verification message | ✓ |
| 401 with error message → throws API message | ✓ |
| 401 with no message → throws fallback | ✓ |

**Total unit tests: 67 (was 59)**

---

## Related

- Same pattern fixed in `register.html` at v1.3.1
- Same root cause as v1.4.2 (server returning HTML 404 during cold start)
