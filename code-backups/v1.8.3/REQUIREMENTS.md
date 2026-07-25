# Requirements & Specifications — PaySick v1.8.3

**Version**: 1.8.3
**Date**: 2026-07-25

Carries forward all requirements from v1.8.2 with the following additions.

---

## New Requirements

### Password Reset Atomicity

| ID | Requirement |
|----|-------------|
| RESET-05 | The database must enforce at most one active (unused) password reset token per user at all times via a partial unique index on `password_reset_tokens (user_id) WHERE used = false` |
| RESET-06 | The token invalidation (UPDATE) and new token insertion (INSERT) in the forgot-password handler must execute within a single database transaction |

---

## Inherited Requirements (unchanged from v1.8.2)

All v1.8.2 requirements remain in effect. See `code-backups/v1.8.2/REQUIREMENTS.md`.
