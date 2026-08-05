'use strict';

/**
 * INBOUND EMAIL REPLY HANDLING (Resend webhook)
 *
 * Pure, security-critical helpers for the inbound reply path:
 *   - verifyResendSignature: Svix-style HMAC verification (Resend signs webhooks
 *     with Svix; headers svix-id / svix-timestamp / svix-signature, secret
 *     `whsec_<base64>`).
 *   - parseInboundEmail: defensive extraction of sender / subject / body from a
 *     Resend inbound payload, tolerant of shape differences.
 *
 * No DB, no network — kept unit-testable.
 */

const crypto = require('crypto');

/**
 * Verify a Svix-signed webhook (Resend's scheme).
 * signedContent = `${svix-id}.${svix-timestamp}.${rawBody}`
 * expected = base64(HMAC_SHA256(base64decode(secret without whsec_), signedContent))
 * The `svix-signature` header is a space-separated list of `v1,<sig>` entries.
 *
 * @param {string} rawBody  the exact raw request body bytes as a string
 * @param {object} headers  request headers (lowercased keys)
 * @param {string} secret   the `whsec_...` signing secret
 * @returns {boolean}
 */
function verifyResendSignature(rawBody, headers, secret) {
  if (!secret || !headers) return false;
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !timestamp || !sigHeader) return false;

  let key;
  try {
    key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  } catch (_) {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  // The header may contain multiple `v1,<sig>` tokens separated by spaces.
  const provided = String(sigHeader).split(' ');
  for (const token of provided) {
    const commaIdx = token.indexOf(',');
    const sig = commaIdx === -1 ? token : token.slice(commaIdx + 1);
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

/** Pull the first email address out of a string like "Name <a@b.com>" or "a@b.com". */
function extractEmail(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

/** Very small HTML → text fallback (strip tags, collapse whitespace). */
function htmlToText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Extract sender email, subject, and body text from a Resend inbound payload,
 * tolerant of nesting (`data.*`) and of text-vs-html.
 * @param {object} payload
 * @returns {{fromEmail: string|null, subject: string, text: string, raw: object}}
 */
function parseInboundEmail(payload) {
  const p = payload || {};
  const d = p.data && typeof p.data === 'object' ? p.data : p;

  const fromRaw = d.from || d.sender || d.From || p.from || '';
  const fromEmail = extractEmail(typeof fromRaw === 'string' ? fromRaw : (fromRaw && fromRaw.email) || '');

  const subject = String(d.subject || p.subject || '').trim();
  let text = d.text || p.text || '';
  if (!text && (d.html || p.html)) text = htmlToText(d.html || p.html);

  return { fromEmail, subject, text: String(text || '').trim(), raw: p };
}

/**
 * Decide whether an inbound webhook request is authentic, and say why not.
 *
 * A flat true/false is not enough operationally: every failure mode looks
 * identical from the outside (a 401), so a misconfigured webhook is
 * indistinguishable from a forged request. Each reason gets its own code.
 *
 * Note what this deliberately does NOT do: it never falls back to re-serialising
 * the parsed body. A Svix signature covers the exact bytes Resend sent, and
 * `JSON.stringify(req.body)` is a different byte string in all but the luckiest
 * case, so verifying against it produces a mismatch that reads like a bad secret.
 * If the raw body is missing, that is itself the fault worth reporting, and it
 * points at the request pipeline rather than at the secret.
 *
 * @param {object} req      the request (headers, rawBody, body)
 * @param {string} secret   RESEND_WEBHOOK_SECRET, if set
 * @param {string} nodeEnv  process.env.NODE_ENV
 * @returns {{ok: boolean, code: string, reason: string}}
 */
function inboundAuthResult(req, secret, nodeEnv) {
  const headers = (req && req.headers) || {};

  // The shared-secret header is checked first because it does not depend on the
  // raw body at all, which makes it the usable escape hatch on any runtime that
  // consumes the request stream before the app sees it.
  if (secret && headers['x-webhook-secret'] === secret) {
    return { ok: true, code: 'SHARED_SECRET', reason: 'shared secret header matched' };
  }

  if (!secret) {
    if (nodeEnv === 'production') {
      return {
        ok: false,
        code: 'NO_WEBHOOK_SECRET',
        reason: 'RESEND_WEBHOOK_SECRET is not set; refusing unsigned webhooks in production',
      };
    }
    return { ok: true, code: 'DEV_NO_SECRET', reason: 'no secret set, non-production' };
  }

  if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
    return {
      ok: false,
      code: 'MISSING_SIGNATURE_HEADERS',
      reason: 'svix-id, svix-timestamp or svix-signature missing; is the caller actually Resend?',
    };
  }

  const raw = req && req.rawBody;
  if (raw == null || raw.length === 0) {
    return {
      ok: false,
      code: 'RAW_BODY_UNAVAILABLE',
      reason:
        'raw request body was not captured, so the signature cannot be verified; ' +
        'something upstream consumed the request stream before express.json() ran',
    };
  }

  if (verifyResendSignature(raw.toString('utf8'), headers, secret)) {
    return { ok: true, code: 'SVIX_SIGNATURE', reason: 'svix signature verified' };
  }

  return {
    ok: false,
    code: 'SIGNATURE_MISMATCH',
    reason: 'signature did not match; check that RESEND_WEBHOOK_SECRET is the secret for this endpoint',
  };
}

module.exports = {
  verifyResendSignature,
  parseInboundEmail,
  extractEmail,
  inboundAuthResult,
};
