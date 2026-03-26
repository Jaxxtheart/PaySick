# Requirements & Specifications — PaySick v1.5.4

**Version**: 1.5.4
**Date**: 2026-03-26

Carries forward all requirements from v1.5.3 with the following additions.

---

## New Requirements — Auth Middleware Completeness

| ID | Requirement | Priority |
|----|-------------|----------|
| AUTH-01 | `auth.middleware.js` must export all functions that any route file imports from it | Must Have |
| AUTH-02 | `requireRole(role)` must be exported — a factory function returning middleware that allows the specified role or admin | Must Have |
| AUTH-03 | Any import of a non-existent middleware export must be treated as a bug and fixed in a PATCH release | Must Have |

---

## Carried Forward from v1.5.3

See `code-backups/v1.5.3/REQUIREMENTS.md` for the full requirements list.
