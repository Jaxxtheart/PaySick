-- ============================================================
-- EMAIL VERIFICATION
-- Adds email confirmation fields to the users table.
-- Token stored as SHA-256 hex (64 chars); raw token sent by email.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified            BOOLEAN                  DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token  VARCHAR(64),
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP WITH TIME ZONE;

-- Sparse index — only rows with a pending token need to be looked up quickly
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON users(email_verification_token)
  WHERE email_verification_token IS NOT NULL;
