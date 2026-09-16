-- ============================================
-- SECURITY TABLES MIGRATION
-- PaySick Banking-Grade Security Implementation
-- ============================================

-- Add password_hash column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- User Sessions Table (Opaque Token Storage)
CREATE TABLE IF NOT EXISTS user_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    access_token_hash VARCHAR(64) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE,
    access_expires_at TIMESTAMP NOT NULL,
    refresh_expires_at TIMESTAMP NOT NULL,
    ip_address INET,
    user_agent TEXT,
    device_fingerprint VARCHAR(64),
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revoke_reason VARCHAR(255),
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast token lookups
CREATE INDEX IF NOT EXISTS idx_sessions_access_token ON user_sessions(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(access_expires_at) WHERE revoked = false;

-- Security Audit Log
CREATE TABLE IF NOT EXISTS security_audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(user_id),
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON security_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip ON security_audit_log(ip_address, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_type ON security_audit_log(event_type, created_at DESC);

-- Encrypted Banking Details Table (replaces plaintext storage)
CREATE TABLE IF NOT EXISTS encrypted_banking_details (
    banking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    encrypted_data TEXT NOT NULL,  -- AES-256-GCM encrypted JSON
    bank_name VARCHAR(100),  -- Can be stored in plaintext for display
    account_type VARCHAR(50),
    last_four_digits VARCHAR(4),  -- Last 4 digits for display
    is_primary BOOLEAN DEFAULT false,
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banking_user ON encrypted_banking_details(user_id);

-- API Keys for Lenders (encrypted)
ALTER TABLE lenders
ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64),
ADD COLUMN IF NOT EXISTS api_key_created_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT;

-- Password Reset Tokens
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

-- Session cleanup function (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions
    WHERE refresh_expires_at < NOW() - INTERVAL '7 days'
    OR (revoked = true AND revoked_at < NOW() - INTERVAL '30 days');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Audit log cleanup (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM security_audit_log
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND event_type NOT IN ('LOGIN_FAILED', 'SESSIONS_REVOKED', 'PASSWORD_CHANGED');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Security event types enum (for documentation)
COMMENT ON TABLE security_audit_log IS 'Event types: LOGIN, LOGIN_FAILED, LOGOUT, TOKEN_REFRESH, SESSIONS_REVOKED, PASSWORD_CHANGED, PASSWORD_RESET_REQUESTED, BANKING_ADDED, BANKING_UPDATED, ADMIN_ACTION';

-- Add role column if not exists
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Create admin check constraint
ALTER TABLE users
DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE users
ADD CONSTRAINT valid_role CHECK (role IN ('user', 'admin', 'lender', 'provider'));
