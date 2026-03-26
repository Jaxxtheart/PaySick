# Architecture — PaySick v1.4.4

**Version**: 1.4.4
**Date**: 2026-03-26

Architecture unchanged from v1.4.3. This is a frontend-only patch.

---

## Frontend Error Handling Pattern (standardised in v1.4.4)

All fetch() calls in form submit handlers must follow this pattern:

```
fetch('/api/...')
  └── response received
        ├── try { data = await response.json() }
        │     └── success → handle data
        └── catch (SyntaxError) → show "Server error (N). Please try again shortly."
              NOT: raw error.message
```

Pages that now correctly implement this:
- `register.html` — since v1.3.1
- `login.html` — since v1.4.4  ← FIXED
- `onboarding.html` — outer try/catch swallows and continues (acceptable for that flow)
- `provider-apply.html` — since v1.3.2
- `demo-login.html` — since v1.3.3

---

All other architecture unchanged from v1.4.3. See `code-backups/v1.4.3/ARCHITECTURE.md`.
