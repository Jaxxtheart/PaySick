/**
 * Provider plan links — signed, expiring, phone-bound.
 *
 * A provider sends a patient a link instead of a form. The token is an HMAC
 * over a minimal payload: link id, provider id, a hash of the patient's phone
 * and an expiry. No phone number, name or amount travels in the clear; the
 * amount lives server-side against the link id.
 *
 * Token format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256).
 */

'use strict';

const crypto = require('crypto');

const LINK_VALIDITY_DAYS = 7;
const MIN_SECRET_LENGTH = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalisePhone(value) {
  let digits = String(value || '').replace(/[^\d]/g, '');
  if (digits.startsWith('27') && digits.length === 11) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 10) digits = digits.slice(1);
  if (!/^[6-8]\d{8}$/.test(digits)) return null;
  return `+27${digits}`;
}

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`Plan links need a secret of at least ${MIN_SECRET_LENGTH} characters`);
  }
}

function sign(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function phoneHash(phone, secret) {
  return crypto.createHmac('sha256', secret).update(`phone:${phone}`).digest('base64url').slice(0, 22);
}

function createPlanLink({ linkId, providerId, patientPhone, secret, now = new Date() }) {
  requireSecret(secret);
  const phone = normalisePhone(patientPhone);
  if (!phone) throw new Error('A valid South African cellphone number is required');
  if (!linkId || !providerId) throw new Error('linkId and providerId are required');

  const expiresAt = new Date(now.getTime() + LINK_VALIDITY_DAYS * DAY_MS);
  const payload = { lid: linkId, pid: providerId, ph: phoneHash(phone, secret), exp: expiresAt.getTime() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${payloadB64}.${sign(payloadB64, secret)}`, expiresAt: expiresAt.toISOString() };
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyPlanLink({ token, secret, patientPhone, now = new Date() }) {
  requireSecret(secret);
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'MALFORMED' };

  const [payloadB64, sig] = parts;
  if (!safeEqual(sign(payloadB64, secret), sig)) return { ok: false, reason: 'BAD_SIGNATURE' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_) {
    return { ok: false, reason: 'MALFORMED' };
  }
  if (!payload || typeof payload.exp !== 'number' || !payload.lid || !payload.pid || !payload.ph) {
    return { ok: false, reason: 'MALFORMED' };
  }

  if (now.getTime() >= payload.exp) return { ok: false, reason: 'EXPIRED' };

  const phone = normalisePhone(patientPhone);
  if (!phone || !safeEqual(phoneHash(phone, secret), payload.ph)) return { ok: false, reason: 'PHONE_MISMATCH' };

  return { ok: true, linkId: payload.lid, providerId: payload.pid };
}

module.exports = {
  LINK_VALIDITY_DAYS,
  normalisePhone,
  createPlanLink,
  verifyPlanLink,
};
