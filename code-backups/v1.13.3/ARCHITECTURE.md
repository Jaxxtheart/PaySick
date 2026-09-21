# Architecture — PaySick v1.13.3

**Version**: 1.13.3
**Date**: 2026-09-21

---

## Changes from v1.13.2

One-line text change. No route, service, table, schema, or functional
behavior changed.

```
backend/src/services/underwriting.service.js
   "Tech and Artery (Pty) Ltd | Registration No. 2023/123456/07"
-> "Tech and Artery (Pty) Ltd | Registration No. K2015/346764/07"
```

## Test topology

```
tests/unit/
   └── entity-registration-number.test.js   [NEW] — asserts the stale
                                              placeholder number is gone
                                              and the real one is present,
                                              still paired with the
                                              entity name on one line
```

Runner: `node --test tests/unit/*.test.js` — 806 tests, 804 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). The edited file was syntax-checked with `node --check`.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
