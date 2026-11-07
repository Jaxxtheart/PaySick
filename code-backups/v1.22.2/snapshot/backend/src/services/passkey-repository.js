/**
 * Passkey repository: the SQL behind passkey.service.js (migration 015).
 */

'use strict';

const iso = (v) => (v ? new Date(v).toISOString() : null);

function passkeyFromRow(r) {
  return {
    credentialId: r.credential_id,
    userId: r.user_id,
    publicKeyJwk: r.public_key_jwk,
    alg: r.alg,
    signCount: Number(r.sign_count),
    backupEligible: r.backup_eligible,
    createdAt: iso(r.created_at),
    lastUsedAt: iso(r.last_used_at),
  };
}

function createPasskeyRepository({ query }) {
  return {
    async insertChallenge({ challenge, purpose, userId, expiresAt }) {
      const r = await query(
        `INSERT INTO webauthn_challenges (challenge, purpose, user_id, expires_at)
         VALUES ($1, $2, $3, $4) RETURNING challenge_id`,
        [challenge, purpose, userId, expiresAt]
      );
      return { challengeId: r.rows[0].challenge_id, challenge, purpose, userId, expiresAt };
    },

    // Atomic: two requests racing on one challenge cannot both use it.
    async consumeChallenge(challengeId, at) {
      if (!/^[0-9a-f-]{36}$/i.test(challengeId)) return null;
      const r = await query(
        `UPDATE webauthn_challenges SET used_at = $2
         WHERE challenge_id = $1 AND used_at IS NULL
         RETURNING challenge, purpose, user_id, expires_at`,
        [challengeId, at]
      );
      const c = r.rows[0];
      return c ? { challengeId, challenge: c.challenge, purpose: c.purpose, userId: c.user_id, expiresAt: iso(c.expires_at) } : null;
    },

    async listPasskeys(userId) {
      const r = await query('SELECT * FROM user_passkeys WHERE user_id = $1 ORDER BY created_at', [userId]);
      return r.rows.map(passkeyFromRow);
    },

    async getPasskey(credentialId) {
      const r = await query('SELECT * FROM user_passkeys WHERE credential_id = $1', [credentialId]);
      return r.rows[0] ? passkeyFromRow(r.rows[0]) : null;
    },

    async insertPasskey(p) {
      const r = await query(
        `INSERT INTO user_passkeys (credential_id, user_id, public_key_jwk, alg, sign_count, backup_eligible)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (credential_id) DO NOTHING
         RETURNING *`,
        [p.credentialId, p.userId, JSON.stringify(p.publicKeyJwk), p.alg, p.signCount, !!p.backupEligible]
      );
      return r.rows[0] ? passkeyFromRow(r.rows[0]) : null;
    },

    async updateSignCount(credentialId, signCount, at) {
      await query('UPDATE user_passkeys SET sign_count = $2, last_used_at = $3 WHERE credential_id = $1', [credentialId, signCount, at]);
    },

    async deletePasskey(userId, credentialId) {
      const r = await query('DELETE FROM user_passkeys WHERE user_id = $1 AND credential_id = $2', [userId, credentialId]);
      return r.rowCount > 0;
    },
  };
}

module.exports = { createPasskeyRepository };
