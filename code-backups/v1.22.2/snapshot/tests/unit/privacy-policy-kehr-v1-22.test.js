'use strict';

/**
 * Unit Tests: Privacy policy covers v1.22.0 (document reader, WhatsApp, passkeys)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 *   - Uploaded payslips and statements are now read by the AI model
 *     (Anthropic) into figures; the file is not kept.
 *   - Plan links can be sent on WhatsApp (Meta), a new operator and a
 *     cross-border transfer; the message carries the provider name and the
 *     link only.
 *   - Passkeys: the fingerprint or face check happens on the device; we
 *     store a public key only and never receive biometric information.
 *
 * Run: node --test tests/unit/privacy-policy-kehr-v1-22.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../privacy-policy.html'), 'utf8');
const text = (f) => f.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
function sectionById(id) {
  const m = html.match(new RegExp(`<h2[^>]*id="${id}"[\\s\\S]*?(?=<h2|<div class="contact-box")`));
  assert.ok(m, `expected a section with id="${id}"`);
  return text(m[0]);
}

describe('privacy-policy.html v1.7', () => {
  test('section 4B says an uploaded payslip or statement is read by the AI model and the file is not kept', () => {
    const s = sectionById('kehr-preapproval');
    assert.match(s, /AI model/);
    assert.match(s, /Anthropic/);
    assert.match(s, /do not keep the file/i);
  });

  test('section 4B says plan links can come on WhatsApp with the provider name and the link only', () => {
    const s = sectionById('kehr-preapproval');
    assert.match(s, /WhatsApp/);
    assert.match(s, /only if you agreed/i);
    assert.match(s, /never the amount/i);
  });

  test('section 4B explains passkeys: no biometric information reaches us', () => {
    const s = sectionById('kehr-preapproval');
    assert.match(s, /passkey/i);
    assert.match(s, /never (receive|reaches) us|we never receive/i);
    assert.match(s, /public key/i);
  });

  test('WhatsApp (Meta) is an operator and a cross-border transfer', () => {
    assert.match(sectionById('s8'), /WhatsApp/);
    assert.match(sectionById('s9'), /WhatsApp|Meta/);
  });

  test('is re-versioned', () => {
    assert.match(text(html), /Version: 1\.7/);
  });
});
