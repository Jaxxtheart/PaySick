# Release Notes — PaySick v1.3.4

**Version**: 1.3.4
**Date**: 2026-03-13
**Type**: PATCH — UI fix

---

## Summary

Cleaned up the demo access entry point on the login page. Two separate demo links previously appeared on the page; one has been removed and the remaining link is now positioned below the fold, requiring a deliberate scroll to reach it.

---

## Changed

- **`login.html`**: Removed the duplicate "Demo" link from the `.back-home` row. The sole remaining "Demo access" link is positioned below the fold with increased top margin (`80px`) so it does not compete visually with the primary login flow.

---

## Files Changed

| File | Change |
|------|--------|
| `login.html` | Removed duplicate demo link; pushed single "Demo access" link below fold |
