'use strict';

/**
 * PASSWORD RESET — TOKEN ISSUANCE
 *
 * Issues a single-use, time-limited password-reset token: store the sha256 hash,
 * email the raw token to the user.
 *
 * NOTE (bug fix): this intentionally does NOT invalidate previously-issued unused
 * tokens. Each token is already single-use (marked `used` on redemption) and
 * expires after `expiryMs`. Force-invalidating earlier tokens on every request
 * meant that requesting a link twice — or an accidental double-fire of the
 * forgot-password request — killed the first email's link, so clicking it gave
 * "Reset link is invalid or has already been used." Letting unexpired tokens
 * coexist is safe and eliminates that failure.
 *
 * Dependencies are injected (`query`, `sendPasswordResetEmail`) so the logic is
 * unit-testable without a DB or SMTP.
 */

const crypto = require('crypto');

const DEFAULT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * @param {{query: Function, sendPasswordResetEmail: Function}} deps
 * @param {{user_id: string, email: string, full_name: string}} user
 * @param {{expiryMs?: number}} [opts]
 */
async function issueResetToken(deps, user, opts = {}) {
  const { query, sendPasswordResetEmail } = deps;
  const expiryMs = opts.expiryMs ?? DEFAULT_EXPIRY_MS;

  const rawToken = crypto.randomBytes(32).toString('hex');           // 64 hex chars
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expiryMs);

  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.user_id, tokenHash, expiresAt]
  );

  // Email the RAW token (never the hash). Caller decides how to handle failures.
  await sendPasswordResetEmail(user.email, user.full_name, rawToken);
}

module.exports = { issueResetToken, DEFAULT_EXPIRY_MS };
