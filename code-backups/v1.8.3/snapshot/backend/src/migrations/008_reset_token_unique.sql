-- Migration 008: Enforce at most one active reset token per user
--
-- Problem: the forgot-password handler invalidates old tokens and inserts a new
-- one in two separate, non-atomic queries.  If two requests for the same user
-- overlap, both may see no existing token, both insert, and one of the two
-- tokens silently becomes unreachable — the user clicks the first link and gets
-- "Reset link is invalid or has already been used."
--
-- Fix: a partial unique index that the DB enforces atomically.
-- Only one row per user may have used = false at any point in time.
-- A concurrent INSERT while an unused token already exists is rejected with a
-- unique-violation error, which the transaction() wrapper converts into a
-- rollback — leaving the existing valid token intact.
--
-- The handler also wraps the UPDATE + INSERT in a single transaction() so that
-- the operations are atomic and the row-level lock from the UPDATE serializes
-- concurrent requests correctly.
--
-- Idempotent: safe to run more than once.

CREATE UNIQUE INDEX IF NOT EXISTS uq_reset_tokens_active_per_user
    ON password_reset_tokens (user_id)
    WHERE used = false;
