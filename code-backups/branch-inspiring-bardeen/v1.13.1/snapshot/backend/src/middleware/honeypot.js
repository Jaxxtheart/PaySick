'use strict';

/**
 * Honeypot Trap Middleware
 *
 * Provides hidden trap endpoints that real users never visit.
 * Any client that hits the honeypot endpoint is permanently blocked
 * for the session (in-memory block list).
 *
 * CLAUDE.md requirement: Honeypot traps — include hidden links or fields invisible
 * to real users. Any client that follows a honeypot link must be permanently blocked
 * for that session.
 */

/**
 * In-memory set of blocked IP addresses.
 * Persists for the lifetime of the server process.
 *
 * @type {Set<string>}
 */
const blockedIPs = new Set();

/**
 * Returns true if the given IP has triggered the honeypot.
 *
 * @param {string} ip
 * @returns {boolean}
 */
function isHoneypotBlocked(ip) {
  return blockedIPs.has(ip);
}

/**
 * Records an IP as having triggered the honeypot.
 * Called directly by honeypotTrapHandler; also exported for testing.
 *
 * @param {string} ip
 */
function recordHoneypotHit(ip) {
  blockedIPs.add(ip);
}

/**
 * Express middleware that blocks any IP already in the honeypot block list.
 * Apply globally before API routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function honeypotBlockMiddleware(req, res, next) {
  const ip = req.ip;
  if (isHoneypotBlocked(ip)) {
    return res.status(403).json({
      error: 'Forbidden',
      code: 'HONEYPOT_BLOCKED',
    });
  }
  next();
}

/**
 * Route handler for the hidden honeypot endpoint (e.g. GET /api/hp-check).
 * Returns a convincing 200 response to lure bots, but records the IP for blocking.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function honeypotTrapHandler(req, res) {
  const ip = req.ip;
  recordHoneypotHit(ip);
  return res.status(200).json({ ok: true });
}

module.exports = {
  blockedIPs,
  isHoneypotBlocked,
  recordHoneypotHit,
  honeypotBlockMiddleware,
  honeypotTrapHandler,
};
