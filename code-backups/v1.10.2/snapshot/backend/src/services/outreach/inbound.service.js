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

module.exports = { verifyResendSignature, parseInboundEmail, extractEmail };
