# v1.8.3 — Race Condition Fix: Reset Token Atomicity

**Date**: 2026-07-25
**Type**: PATCH — Bug fix

---

## Summary

The forgot-password handler issued two separate non-atomic DB queries:

1. `UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false`
2. `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (...)`

With nothing tying them together, two concurrent requests for the same user could
both read "no existing token", both insert, and the second insert silently made the
first token unreachable. More commonly (the sequential case), a user who clicked
"Resend" would invalidate their first token and then wonder why the first email's
link said "Reset link is invalid or has already been used."

## Changes

### `backend/src/migrations/008_reset_token_unique.sql` (new)
- Adds a **partial unique index** on `password_reset_tokens (user_id) WHERE used = false`
- The DB now enforces at most one active (unused) reset token per user at all times
- A concurrent INSERT while an unused token exists is rejected (unique violation → rollback)
- Idempotent: uses `CREATE UNIQUE INDEX IF NOT EXISTS`

### `backend/src/routes/users.js`
- The UPDATE (invalidate) + INSERT (new token) are now wrapped in a single `transaction()` call
- The transaction's row-level lock serializes concurrent requests at the DB level
- Together with the unique index, this eliminates the race condition entirely

### `tests/unit/reset-token-race.test.js` (new)
- 6 new tests (test-first: confirmed failing before implementation)

---

## Tests

- **New**: 6 tests in `tests/unit/reset-token-race.test.js`
- **Total passing**: 63 / 63 (0 failures)

---

## Deployment Note

Run migration `008_reset_token_unique.sql` against the production database:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_tokens_active_per_user
    ON password_reset_tokens (user_id)
    WHERE used = false;
```

This is a non-blocking index build on a small table and can be run live without downtime.
