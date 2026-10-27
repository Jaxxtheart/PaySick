/**
 * PASSKEY ROUTES (v1.22.0), mounted at /api/auth/passkeys
 *
 * Registering, listing and removing a passkey require a signed-in user.
 * The two sign-in routes are, like POST /api/users/login, the way a user
 * authenticates: they hand out a challenge and verify a signature, return
 * no business data, and sit behind the auth rate limit. A verified sign-in
 * gets the same session as a password login (createSession).
 */

'use strict';

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');
const { createSession, logSecurityEvent } = require('../services/security.service');
const { createPasskeyService } = require('../services/passkey.service');
const { createPasskeyRepository } = require('../services/passkey-repository');

// The relying party is the site's own domain. Outside production it
// defaults to localhost; in production passkeys stay off until configured.
const rpId = process.env.WEBAUTHN_RP_ID || (process.env.NODE_ENV === 'production' ? null : 'localhost');
const origins = (process.env.WEBAUTHN_ORIGINS || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'))
  .split(',').map((o) => o.trim()).filter(Boolean);
const enabled = !!rpId && origins.length > 0;

const passkeys = enabled
  ? createPasskeyService({ repo: createPasskeyRepository({ query }), rp: { id: rpId, name: 'Kehr by PaySick', origins } })
  : null;

router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  if (!enabled) return res.status(503).json({ error: 'Passkeys are not available yet.' });
  next();
});

const clientIp = (req) => req.clientIP || req.ip;

router.post('/register/options', authenticateToken, async (req, res) => {
  try {
    const r = await query('SELECT email, full_name FROM users WHERE user_id = $1', [req.user.userId]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'Account not found.' });
    res.json(await passkeys.startRegistration({ userId: req.user.userId, name: u.email, displayName: u.full_name }));
  } catch (error) {
    console.error('Passkey register options error:', error.message);
    res.status(500).json({ error: 'Could not start adding a passkey.' });
  }
});

router.post('/register/verify', authenticateToken, async (req, res) => {
  try {
    const result = await passkeys.finishRegistration(req.user.userId, { challengeId: req.body.challengeId, credential: req.body.credential });
    await logSecurityEvent('PASSKEY_ADDED', req.user.userId, clientIp(req), req.get('User-Agent'), {});
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: /already registered|expired|another session/.test(error.message) ? error.message : 'That passkey could not be added. Please try again.' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    res.json({ passkeys: await passkeys.listPasskeys(req.user.userId) });
  } catch (error) {
    console.error('Passkey list error:', error.message);
    res.status(500).json({ error: 'Could not load your passkeys.' });
  }
});

router.delete('/:credentialId', authenticateToken, async (req, res) => {
  try {
    const removed = await passkeys.removePasskey(req.user.userId, req.params.credentialId);
    if (!removed) return res.status(404).json({ error: 'Passkey not found.' });
    await logSecurityEvent('PASSKEY_REMOVED', req.user.userId, clientIp(req), req.get('User-Agent'), {});
    res.json({ removed: true });
  } catch (error) {
    console.error('Passkey remove error:', error.message);
    res.status(500).json({ error: 'Could not remove the passkey.' });
  }
});

router.post('/login/options', async (req, res) => {
  try {
    res.json(await passkeys.startLogin());
  } catch (error) {
    console.error('Passkey login options error:', error.message);
    res.status(500).json({ error: 'Could not start passkey sign-in.' });
  }
});

router.post('/login/verify', async (req, res) => {
  let userId;
  try {
    ({ userId } = await passkeys.finishLogin({ challengeId: req.body.challengeId, credential: req.body.credential }));
  } catch (error) {
    await logSecurityEvent('PASSKEY_LOGIN_FAILED', null, clientIp(req), req.get('User-Agent'), { reason: error.message.slice(0, 120) }).catch(() => {});
    return res.status(401).json({ error: 'That passkey did not work. Try again, or sign in with your password.' });
  }
  try {
    const r = await query(
      `SELECT user_id, full_name, email, cell_number, status, credit_limit, risk_tier, role, locked_until
       FROM users WHERE user_id = $1`,
      [userId]
    );
    const user = r.rows[0];
    if (!user || user.status !== 'active' || (user.locked_until && new Date(user.locked_until) > new Date())) {
      return res.status(403).json({ error: 'This account cannot sign in right now. Please contact support.' });
    }
    await query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [user.user_id]);
    const session = await createSession({ user_id: user.user_id, email: user.email, role: user.role }, clientIp(req), req.get('User-Agent'));
    await logSecurityEvent('PASSKEY_LOGIN', user.user_id, clientIp(req), req.get('User-Agent'), {});
    res.json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        cell_number: user.cell_number,
        status: user.status,
        credit_limit: user.credit_limit,
        risk_tier: user.risk_tier,
        role: user.role,
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
    });
  } catch (error) {
    console.error('Passkey login error:', error.message);
    res.status(500).json({ error: 'Failed to sign in.' });
  }
});

module.exports = router;
