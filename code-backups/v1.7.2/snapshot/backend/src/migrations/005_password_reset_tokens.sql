-- ============================================
-- PASSWORD RESET TOKENS TABLE
-- Extracted from 003_security_tables.sql to ensure
-- this table is created even when migration 003 times
-- out on cold start (before the DB pool warms up).
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT false,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token_hash) WHERE used = false;
