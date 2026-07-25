# Architecture — PaySick v1.8.3

**Version**: 1.8.3
**Date**: 2026-07-25

No structural changes from v1.8.2. This patch changes transactional behaviour
in the forgot-password handler and adds a DB constraint.

See `code-backups/v1.8.0/ARCHITECTURE.md` for the full system diagram.

---

## Token Lifecycle Change

```
Before (v1.8.2) — non-atomic:
  UPDATE password_reset_tokens SET used=true WHERE user_id=$1 AND used=false
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
  ← Two separate queries; race window between them

After (v1.8.3) — atomic:
  BEGIN
    UPDATE password_reset_tokens SET used=true WHERE user_id=$1 AND used=false
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
  COMMIT
  ← Single transaction + DB unique index enforces at most one active token
```

## New DB Constraint

```sql
-- Enforced at the DB level (not just application logic)
CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_tokens_active_per_user
    ON password_reset_tokens (user_id)
    WHERE used = false;
```
