-- =============================================
-- Migration 015: passkey sign-in (v1.22.0)
--
-- See services/passkey.service.js and webauthn.service.js.
--
--   user_passkeys        one row per passkey: the credential id, its public
--                        key (JWK), algorithm and signature counter. Only
--                        the public half is stored; the signing key stays on the patient's device.
--   webauthn_challenges  server-side challenges, single use, 5 minutes,
--                        tied to a purpose and (for registration) a user.
-- =============================================

CREATE TABLE IF NOT EXISTS user_passkeys (
  credential_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id),
  public_key_jwk JSONB NOT NULL,
  alg INTEGER NOT NULL CHECK (alg IN (-7, -257)),
  sign_count BIGINT NOT NULL DEFAULT 0,
  backup_eligible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user ON user_passkeys (user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL,
  purpose VARCHAR(10) NOT NULL CHECK (purpose IN ('register', 'login')),
  user_id UUID REFERENCES users(user_id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry ON webauthn_challenges (expires_at) WHERE used_at IS NULL;
