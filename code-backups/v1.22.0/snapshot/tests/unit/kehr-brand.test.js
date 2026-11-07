/**
 * Unit Tests — Kehr brand identity (v1.20.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Owner direction: replace "Care Agent" with a new brand identity that
 * aligns with PaySick's CI, called "Kehr". Kehr is the identity for the
 * harness, so everywhere the patient meets it (the page and its address,
 * the homepage search bar, the privacy policy, the assistant's own words)
 * it is Kehr, endorsed "by PaySick". Internal code names (care-agent.*,
 * /api/care-agent) are unchanged so nothing breaks.
 *
 * Run: node --test tests/unit/kehr-brand.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

/** Visible text and attributes only: drops HTML, CSS and JS comments. */
function withoutComments(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
}

/** PaySick CI (DESIGN_SYSTEM.md) — Kehr's tokens must use these exact values. */
const PAYSICK_CI = {
  '--kehr-red': '#E01E37',
  '--kehr-red-bright': '#FF4757',
  '--kehr-ink': '#1A1A1A',
  '--kehr-slate': '#4A4A4A',
  '--kehr-mist': '#8A8A8A',
  '--kehr-line': '#E5E5E5',
  '--kehr-paper': '#FAFAFA',
};

describe('kehr.html is the Kehr page', () => {
  test('exists', () => {
    assert.ok(exists('kehr.html'));
  });

  const page = exists('kehr.html') ? read('kehr.html') : '';
  const visible = withoutComments(page);

  test('is titled Kehr, endorsed by PaySick', () => {
    assert.match(page, /<title>Kehr by PaySick<\/title>/);
  });

  test('shows the Kehr mark and wordmark with the PaySick endorsement', () => {
    assert.match(page, /<svg[^>]*class="kehr-mark"/);
    assert.match(page, /class="kehr-wordmark"[^>]*>Kehr</);
    assert.match(page, /class="kehr-endorse"[^>]*>by PaySick</);
  });

  test('defines the Kehr colour tokens with the PaySick CI values', () => {
    for (const [token, hex] of Object.entries(PAYSICK_CI)) {
      assert.match(page, new RegExp(`${token}:\\s*${hex}\\b`, 'i'), token);
    }
  });

  test('uses the PaySick CI system font stack', () => {
    assert.match(page, /--kehr-font:\s*-apple-system, BlinkMacSystemFont, 'Segoe UI'/);
  });

  test('never calls itself the Care Agent, an agent, or an assistant', () => {
    assert.doesNotMatch(visible, /Care Agent/);
    assert.doesNotMatch(visible.replace(/user-agent/gi, ''), /\bagent\b(?![-_])/i);
    assert.doesNotMatch(visible, /\bassistant\b/i);
  });

  test('keeps the privacy notice, linked to the Kehr section', () => {
    assert.match(page, /href="privacy-policy\.html#kehr"/);
  });

  test('keeps the honeypot trap', () => {
    assert.match(page, /<a href="\/api\/hp-check" style="display:none" aria-hidden="true" tabindex="-1" rel="nofollow">/);
  });
});

describe('care-agent.html forwards old links to kehr.html', () => {
  const stub = read('care-agent.html');

  test('replaces the location with kehr.html, keeping the query', () => {
    assert.match(stub, /window\.location\.replace\('kehr\.html' \+ window\.location\.search\)/);
  });

  test('is small: no app code left behind', () => {
    assert.ok(stub.length < 2500, `stub is ${stub.length} characters`);
    assert.doesNotMatch(stub, /PaySickAPI/);
  });

  test('is not indexed and keeps the honeypot', () => {
    assert.match(stub, /<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">/);
    assert.match(stub, /href="\/api\/hp-check"/);
  });

  test('links to kehr.html for visitors without JavaScript', () => {
    assert.match(stub, /<noscript>[\s\S]*href="kehr\.html"[\s\S]*<\/noscript>/);
  });
});

describe('entry points use Kehr', () => {
  const index = read('index.html');

  test('the homepage search bar is "Ask Kehr" and opens kehr.html', () => {
    assert.match(index, /aria-label="Ask Kehr"/);
    assert.match(index, /placeholder="[^"]*Ask Kehr[^"]*"/);
    assert.ok(index.includes("'kehr.html?q=' + encodeURIComponent(query)"));
    assert.doesNotMatch(withoutComments(index), /Care Agent|Ask PaySick/);
  });

  test('login and onboarding return a held question to kehr.html', () => {
    assert.match(read('login.html'), /window\.location\.href = 'kehr\.html'/);
    assert.match(read('onboarding.html'), /heldQuestion \? 'kehr\.html'/);
  });
});

describe('privacy policy names Kehr', () => {
  const policy = read('privacy-policy.html');

  test('section 4A is Kehr, with the old anchor kept for existing links', () => {
    assert.match(policy, /<h2 id="kehr">4A\. Kehr by PaySick<\/h2>/);
    assert.match(policy, /<span id="care-agent"><\/span>/);
    assert.match(policy, /<a href="#kehr">/);
  });

  test('mentions the old name once, so people who knew it can find it', () => {
    const mentions = withoutComments(policy).match(/Care Agent/g) || [];
    assert.equal(mentions.length, 1);
    assert.match(policy, /formerly called the PaySick Care Agent/);
  });
});

describe('Kehr speaks as Kehr', () => {
  const routeSource = read('backend/src/routes/care-agent.js');
  const { SYSTEM_PROMPT } = require('../../backend/src/services/care-agent-llm.service');
  const serverSource = read('backend/src/server.js');

  test('the opening greeting introduces Kehr', () => {
    const greeting = /const OPENING_GREETING =\s*\n?\s*"([^"]+)"/.exec(routeSource);
    assert.ok(greeting);
    assert.match(greeting[1], /^Hi, I'm Kehr from PaySick\./);
    assert.doesNotMatch(greeting[1], /agent|assistant/i);
  });

  test('the model is told it is Kehr and never to call itself an agent', () => {
    assert.match(SYSTEM_PROMPT, /^You are Kehr, PaySick's/);
    assert.match(SYSTEM_PROMPT, /Never call yourself an agent, an assistant or an AI/);
  });

  test('errors a patient can see say Kehr, not Care Agent', () => {
    assert.match(routeSource, /'Failed to start a conversation with Kehr'/);
    assert.match(serverSource, /'Too many requests to Kehr\. Please try again shortly\.'/);
  });
});

describe('KEHR_BRAND.md', () => {
  test('exists and covers the identity', () => {
    assert.ok(exists('KEHR_BRAND.md'));
    const doc = read('KEHR_BRAND.md');
    for (const heading of ['## Name', '## Mark', '## Wordmark and lockups', '## Colour', '## Typography', '## Voice', '## Usage rules']) {
      assert.ok(doc.includes(heading), heading);
    }
    for (const hex of Object.values(PAYSICK_CI)) assert.ok(doc.includes(hex), hex);
    assert.match(doc, /class="kehr-mark"/);
  });
});
