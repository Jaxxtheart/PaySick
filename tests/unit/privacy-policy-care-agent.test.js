'use strict';

/**
 * Unit Tests: Privacy policy covers the PaySick Care Agent (v1.17.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * v1.13.0 added the Care Agent. It stores conversation messages and details
 * extracted from uploaded quotes, invoices and medical-scheme statements
 * (which can include health information) in care_agent_sessions /
 * care_agent_audit_log, and, when ANTHROPIC_API_KEY is set, sends messages
 * and uploaded documents to Anthropic's API (USA) for processing. The
 * uploaded file itself is not stored. POPIA s18 requires the data subject to
 * be told all of this at collection, so privacy-policy.html must say it.
 *
 * Run: node --test tests/unit/privacy-policy-care-agent.test.js
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

describe('privacy-policy.html: Care Agent section', () => {
  test('has a dedicated Care Agent section linked from the contents', () => {
    assert.match(html, /<h2[^>]*id="kehr"[^>]*>[^<]*Kehr[^<]*<\/h2>/);
    assert.match(html, /<a href="#kehr">/);
  });

  test('says what the Care Agent collects', () => {
    const s = sectionById('kehr');
    assert.match(s, /conversation/i);
    assert.match(s, /quote/i);
    assert.match(s, /invoice/i);
    assert.match(s, /scheme statement/i);
  });

  test('says the uploaded file itself is not stored, only the details read from it', () => {
    assert.match(sectionById('kehr'), /file itself is not stored/i);
  });

  test('says messages and documents are sent to Anthropic for processing', () => {
    assert.match(sectionById('kehr'), /Anthropic/);
  });

  test('says a question typed before signing in is held in the browser for up to 24 hours', () => {
    assert.match(sectionById('kehr'), /held in your browser for up to 24 hours/i);
  });

  test('says using the Care Agent is optional', () => {
    assert.match(sectionById('kehr'), /optional/i);
  });
});

describe('privacy-policy.html: Care Agent reflected in the existing sections', () => {
  test('special personal information covers health details shared with the Care Agent', () => {
    assert.match(sectionById('s6'), /Kehr/);
  });

  test('Anthropic is listed as an operator', () => {
    assert.match(sectionById('s8'), /Anthropic/);
  });

  test('Anthropic is covered under cross-border transfers', () => {
    assert.match(sectionById('s9'), /Anthropic/);
  });

  test('retention table has a Care Agent row', () => {
    assert.match(sectionById('s10'), /Kehr/);
  });
});

describe('privacy-policy.html: responsible party and version', () => {
  test('names Tech & Artery (Pty) Ltd with its registration number', () => {
    assert.match(sectionById('s1'), /Tech & Artery \(Pty\) Ltd/);
    assert.match(sectionById('s1'), /K2015\/346764\/07/);
  });

  test('is re-dated and re-versioned for this change', () => {
    // v1.5 (v1.20.0): the Care Agent is renamed Kehr.
    assert.match(all, /Effective Date: 27 October 2026/);
    assert.match(all, /Version: 1\.5/);
  });
});

describe('care-agent.html: notice at the point of collection (POPIA s18)', () => {
  const page = fs.readFileSync(path.resolve(__dirname, '../../kehr.html'), 'utf8');

  test('shows a privacy notice next to the message composer, linking to the Care Agent section', () => {
    const notice = page.match(/<p class="privacy-notice"[\s\S]*?<\/p>/);
    assert.ok(notice, 'expected a <p class="privacy-notice"> on the Care Agent page');
    assert.match(notice[0], /href="privacy-policy.html#kehr"/);
    assert.match(text(notice[0]), /Anthropic/);
  });

  test('the notice sits next to the composer', () => {
    const noticeAt = page.indexOf('class="privacy-notice"');
    const inputAt = page.indexOf('id="message-input"');
    const composerAt = page.lastIndexOf('id="composer"', inputAt);
    assert.ok(noticeAt !== -1 && composerAt !== -1);
    assert.ok(noticeAt > composerAt - 400 && noticeAt < inputAt + 2000, 'notice should be next to the composer');
  });
});
