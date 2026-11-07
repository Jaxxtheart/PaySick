'use strict';

/**
 * Unit Tests: Privacy policy covers Kehr pre-approval (v1.21.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Journey A reads data the policy did not yet describe: a credit bureau
 * check, a one-time bank read through an open-banking provider, an identity
 * and liveness check through a verification partner, medical scheme cover,
 * optional health history, and documents the patient uploads. It also makes
 * an assessment by automated means, so POPIA s71 applies, and providers can
 * send plan links. POPIA s18 requires all of this to be stated at collection.
 *
 * Run: node --test tests/unit/privacy-policy-kehr-preapproval.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../privacy-policy.html'), 'utf8');

function text(fragment) {
  return fragment
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

function sectionById(id) {
  const m = html.match(new RegExp(`<h2[^>]*id="${id}"[\\s\\S]*?(?=<h2|<div class="contact-box")`));
  assert.ok(m, `expected a section with id="${id}"`);
  return text(m[0]);
}

const all = text(html);

describe('privacy-policy.html: Kehr pre-approval (section 4B)', () => {
  test('is listed in the contents', () => {
    assert.match(html, /<a href="#kehr-preapproval">/);
  });

  const s = () => sectionById('kehr-preapproval');

  test('names each source read, each behind its own consent', () => {
    for (const re of [/credit bureau/i, /open-banking/i, /once/i, /medical scheme/i, /payslip or bank statement/i, /separate consent/i]) {
      assert.match(s(), re);
    }
  });

  test('says the selfie is checked by a verification partner and not kept', () => {
    assert.match(s(), /selfie/i);
    assert.match(s(), /verification partner/i);
    assert.match(s(), /not keep the (photo|selfie)/i);
  });

  test('says health history is optional and declining never counts against you', () => {
    assert.match(s(), /health history/i);
    assert.match(s(), /never counts against you/i);
  });

  test('says consent can be withdrawn at any time', () => {
    assert.match(s(), /withdraw/i);
  });

  test('explains the automated assessment and the right to have a person review it (s71)', () => {
    assert.match(s(), /automated/i);
    assert.match(s(), /a person/i);
    assert.match(s(), /Section 71/);
  });

  test('says what a provider sees from a pass, and what it does not', () => {
    assert.match(s(), /provider/i);
    assert.match(s(), /never sees? your income, bank details or health information/i);
  });

  test('names the debit order creditor', () => {
    assert.match(s(), /Tech & Artery \(Pty\) Ltd/);
    assert.match(s(), /KEHR\*PLAN/);
  });
});

describe('privacy-policy.html: operators and retention for pre-approval', () => {
  test('lists the open-banking and identity verification partners as operators', () => {
    const ops = sectionById('s8');
    assert.match(ops, /open-banking provider/i);
    assert.match(ops, /identity verification partner/i);
  });

  test('has a retention row for pre-approvals and consents', () => {
    assert.match(sectionById('s10'), /Kehr pre-approvals/);
  });

  test('is re-versioned for this change', () => {
    assert.match(all, /Version: 1\.6/);
  });
});
