/**
 * Unit Tests — Outreach inbound reply handling (Resend webhook)
 * Node.js built-in test runner. No DB, no network.
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Covers the two pure, security-critical pieces of the inbound path:
 *   - verifyResendSignature: Svix-style HMAC verification of the webhook.
 *   - parseInboundEmail: defensive extraction of sender/subject/body.
 *
 * Run: node --test tests/unit/outreach-inbound.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  verifyResendSignature,
  parseInboundEmail,
} = require('../../backend/src/services/outreach/inbound.service');

// Helper: sign a payload the Svix way (mirrors the verifier's contract).
function svixSign(secret, id, timestamp, body) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${body}`;
  const sig = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  return `v1,${sig}`;
}

describe('verifyResendSignature', () => {
  const secret = 'whsec_' + Buffer.from('super-secret-signing-key-123456').toString('base64');
  const body = JSON.stringify({ type: 'email.received', data: { from: 'a@b.com' } });
  const id = 'msg_2abc';
  const ts = String(Math.floor(Date.now() / 1000));

  test('accepts a correctly-signed payload', () => {
    const headers = {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': svixSign(secret, id, ts, body),
    };
    assert.equal(verifyResendSignature(body, headers, secret), true);
  });

  test('rejects a tampered body', () => {
    const headers = {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': svixSign(secret, id, ts, body),
    };
    assert.equal(verifyResendSignature(body + 'tampered', headers, secret), false);
  });

  test('rejects a wrong secret', () => {
    const headers = {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': svixSign(secret, id, ts, body),
    };
    const otherSecret = 'whsec_' + Buffer.from('a-different-key-000000000000000').toString('base64');
    assert.equal(verifyResendSignature(body, headers, otherSecret), false);
  });

  test('accepts when the header carries multiple space-separated signatures', () => {
    const good = svixSign(secret, id, ts, body);
    const headers = {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': `v1,bogus ${good}`,
    };
    assert.equal(verifyResendSignature(body, headers, secret), true);
  });

  test('rejects when signature headers are missing', () => {
    assert.equal(verifyResendSignature(body, {}, secret), false);
  });
});

describe('parseInboundEmail', () => {
  test('extracts a bare email address from data.from', () => {
    const p = parseInboundEmail({ type: 'email.received', data: { from: 'jane@clinic.co.za', subject: 'Re: hi', text: 'Yes please' } });
    assert.equal(p.fromEmail, 'jane@clinic.co.za');
    assert.equal(p.subject, 'Re: hi');
    assert.equal(p.text, 'Yes please');
  });

  test('extracts the address from a "Name <email>" from header and lowercases it', () => {
    const p = parseInboundEmail({ data: { from: 'Dr Jane Smith <Jane@Clinic.CO.ZA>', text: 'Interested' } });
    assert.equal(p.fromEmail, 'jane@clinic.co.za');
  });

  test('falls back to top-level fields and html when text is absent', () => {
    const p = parseInboundEmail({ from: 'x@y.com', html: '<p>Sounds good</p>' });
    assert.equal(p.fromEmail, 'x@y.com');
    assert.ok(/Sounds good/.test(p.text), 'derives text from html');
  });

  test('returns null fromEmail when no address is present (never throws)', () => {
    const p = parseInboundEmail({ data: { subject: 'no sender' } });
    assert.equal(p.fromEmail, null);
  });
});
