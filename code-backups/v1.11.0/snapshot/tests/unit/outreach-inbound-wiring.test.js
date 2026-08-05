'use strict';

/**
 * Unit Tests — inbound reply webhook wiring
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Context: the Resend inbound webhook was never connected, so replies were never
 * captured. `getContactedDueForFollowup` only skips a lead that has an inbound
 * touch row, and inbound rows are created solely by POST /api/outreach/inbound.
 * With the webhook unwired, a provider who replies is never flipped to
 * `replied`, so the sequence keeps advancing on them: they receive the day 3
 * bump, the day 7 value mail and the day 14 breakup after already answering.
 *
 * Connecting the webhook is a configuration task. This file covers the one
 * genuine code defect on that path, which would otherwise make the webhook fail
 * confusingly the moment it IS connected:
 *
 *   checkInboundSignature falls back to `JSON.stringify(req.body)` when the raw
 *   body is unavailable. A Svix signature is computed over the exact bytes
 *   Resend sent. A re-serialised body is a different byte string in all but the
 *   luckiest case (key order, unicode escaping, whitespace), so verification
 *   fails and the endpoint returns a flat 401 with no indication of why. The
 *   operator sees "webhook connected, still nothing works" and has nothing to
 *   go on. Serverless runtimes that pre-parse the request body are exactly the
 *   environment where this bites.
 *
 * The fix: never attempt verification against a re-serialised body, and return
 * a distinct reason code for each failure mode so a misconfiguration is
 * diagnosable from the response alone.
 *
 * Run: node --test tests/unit/outreach-inbound-wiring.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const {
  verifyResendSignature,
  parseInboundEmail,
  inboundAuthResult,
} = require('../../backend/src/services/outreach/inbound.service');

const routeSource = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/routes/outreach.js'),
  'utf8'
);
const serverSource = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/server.js'),
  'utf8'
);

const SECRET = 'whsec_' + Buffer.from('supersecretkeymaterial').toString('base64');

/** Build a correctly Svix-signed request for a given raw body. */
function signed(rawBody, secret = SECRET) {
  const id = 'msg_2abc';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  return {
    headers: {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${sig}`,
    },
    rawBody: Buffer.from(rawBody, 'utf8'),
  };
}

// ─── The defect: no verification against a re-serialised body ───────────────

describe('inboundAuthResult reports a specific reason', () => {
  test('a correctly signed request is accepted', () => {
    const raw = JSON.stringify({ type: 'email.received', data: { from: 'a@b.com' } });
    const req = signed(raw);
    const result = inboundAuthResult(req, SECRET, 'production');
    assert.equal(result.ok, true, result.reason);
  });

  test('a missing secret in production is refused with its own code', () => {
    const raw = '{}';
    const req = signed(raw);
    const result = inboundAuthResult(req, undefined, 'production');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NO_WEBHOOK_SECRET');
  });

  test('a missing secret outside production still allows local testing', () => {
    const result = inboundAuthResult({ headers: {}, rawBody: Buffer.from('{}') }, undefined, 'development');
    assert.equal(result.ok, true);
    assert.equal(result.code, 'DEV_NO_SECRET');
  });

  test('an unavailable raw body is refused with its own code, never re-serialised', () => {
    // This is the defect. Previously the code fell back to
    // JSON.stringify(req.body), which cannot match the signed bytes.
    const req = signed('{"a":1}');
    delete req.rawBody;
    req.body = { a: 1 };
    const result = inboundAuthResult(req, SECRET, 'production');
    assert.equal(result.ok, false);
    assert.equal(
      result.code,
      'RAW_BODY_UNAVAILABLE',
      'a re-serialised body must never be used to verify a signature'
    );
  });

  test('an empty raw body with a populated parsed body is treated as unavailable', () => {
    // The shape produced when an upstream runtime consumed the stream before
    // express.json() ran: verify() fires with a zero-length buffer.
    const req = signed('{"a":1}');
    req.rawBody = Buffer.alloc(0);
    req.body = { a: 1 };
    const result = inboundAuthResult(req, SECRET, 'production');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'RAW_BODY_UNAVAILABLE');
  });

  test('missing svix headers are refused with their own code', () => {
    const result = inboundAuthResult(
      { headers: {}, rawBody: Buffer.from('{}') },
      SECRET,
      'production'
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, 'MISSING_SIGNATURE_HEADERS');
  });

  test('a wrong signature is refused as a mismatch, distinctly from the above', () => {
    const req = signed('{"a":1}');
    req.rawBody = Buffer.from('{"a":2}'); // body no longer matches the signature
    const result = inboundAuthResult(req, SECRET, 'production');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'SIGNATURE_MISMATCH');
  });

  test('the shared-secret header remains a valid fallback', () => {
    // Independent of raw body handling, so it is the escape hatch when a
    // runtime makes Svix verification impossible.
    const result = inboundAuthResult(
      { headers: { 'x-webhook-secret': SECRET }, rawBody: Buffer.from('{}') },
      SECRET,
      'production'
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, 'SHARED_SECRET');
  });
});

// ─── Signature verification itself is unchanged ─────────────────────────────

describe('verifyResendSignature still behaves', () => {
  test('accepts a valid signature over the exact bytes', () => {
    const raw = '{"type":"email.received"}';
    const { headers } = signed(raw);
    assert.equal(verifyResendSignature(raw, headers, SECRET), true);
  });

  test('rejects when a single byte of the body differs', () => {
    const { headers } = signed('{"type":"email.received"}');
    assert.equal(verifyResendSignature('{"type":"email.receivea"}', headers, SECRET), false);
  });

  test('rejects a missing secret or missing headers', () => {
    assert.equal(verifyResendSignature('{}', {}, SECRET), false);
    assert.equal(verifyResendSignature('{}', signed('{}').headers, ''), false);
  });
});

// ─── The route surfaces the reason ──────────────────────────────────────────

describe('the route makes a misconfiguration diagnosable', () => {
  test('the 401 response carries the reason code', () => {
    assert.match(
      routeSource,
      /code:\s*(auth\.code|result\.code)/,
      'the inbound 401 does not return the specific failure code'
    );
  });

  test('the route no longer re-serialises the body for verification', () => {
    assert.ok(
      !routeSource.includes('JSON.stringify(req.body'),
      'route still falls back to a re-serialised body'
    );
  });
});

// ─── The raw body capture that the whole path depends on ────────────────────

describe('raw body capture is in place', () => {
  test('express.json declares a verify hook that stores the raw buffer', () => {
    assert.match(
      serverSource,
      /verify:\s*\(req,\s*res,\s*buf\)\s*=>\s*\{\s*req\.rawBody\s*=\s*buf/,
      'express.json() no longer captures req.rawBody, which breaks signature verification'
    );
  });
});

// ─── Payload parsing against Resend's actual inbound shape ──────────────────

describe('parseInboundEmail handles the Resend inbound payload', () => {
  test('reads the nested data envelope Resend sends', () => {
    const parsed = parseInboundEmail({
      type: 'email.received',
      data: {
        from: 'Dr Naidoo <reception@clinic.co.za>',
        subject: 'Re: A quick question',
        text: 'Yes, please send the details.',
      },
    });
    assert.equal(parsed.fromEmail, 'reception@clinic.co.za');
    assert.equal(parsed.subject, 'Re: A quick question');
    assert.match(parsed.text, /send the details/);
  });

  test('falls back to HTML when no text part is present', () => {
    const parsed = parseInboundEmail({
      data: { from: 'a@b.co.za', html: '<p>Interested.</p><p>Call me.</p>' },
    });
    assert.equal(parsed.fromEmail, 'a@b.co.za');
    assert.match(parsed.text, /Interested/);
    assert.ok(!parsed.text.includes('<p>'), 'HTML tags leaked into the body text');
  });

  test('a payload with no sender yields a null address rather than throwing', () => {
    const parsed = parseInboundEmail({ data: { subject: 'orphan' } });
    assert.equal(parsed.fromEmail, null);
  });
});
