'use strict';

/**
 * Unit Tests — Bot protection on statically-served pages
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Two CLAUDE.md "Bot Crawling Prevention" requirements are only half-met once the
 * express middleware from PR #47 lands, because the HTML pages are NOT served by
 * express — Vercel serves them as static files and vercel.json only rewrites
 * /health and /api/*. So:
 *
 *   1. "X-Robots-Tag HTTP header — every response must include
 *      noindex, nofollow, noarchive, nosnippet, noimageindex"
 *      backend/src/server.js sets this, but it never runs for /index.html,
 *      /login, /investor-deck, etc. It has to be declared in vercel.json headers.
 *
 *   2. "Honeypot traps — include hidden links or fields invisible to real users.
 *      Any client that follows a honeypot link must be permanently blocked."
 *      The GET /api/hp-check trap handler exists, but nothing links to it, so no
 *      crawler will ever walk into it. Each entry-point page needs a hidden link.
 *
 * Run: node --test tests/unit/static-bot-protection.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const VERCEL_JSON = path.join(REPO_ROOT, 'vercel.json');

const REQUIRED_ROBOTS_DIRECTIVES = [
  'noindex',
  'nofollow',
  'noarchive',
  'nosnippet',
  'noimageindex',
];

/** Entry-point pages a crawler is most likely to land on first. */
const HONEYPOT_PAGES = [
  'index.html',
  'login.html',
  'register.html',
  'providers.html',
  'investor-deck.html',
];

const HONEYPOT_PATH = '/api/hp-check';

// ─── X-Robots-Tag on static responses ────────────────────────────────────────

describe('vercel.json — X-Robots-Tag on every static response', () => {
  const config = JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf8'));

  test('declares a headers array', () => {
    assert.ok(
      Array.isArray(config.headers),
      'vercel.json must declare a "headers" array — express never sees static page requests'
    );
  });

  test('has a rule matching every path', () => {
    const sources = (config.headers || []).map((h) => h.source);
    assert.ok(
      sources.some((s) => s === '/(.*)' || s === '/:path*'),
      `expected a catch-all header source, got ${JSON.stringify(sources)}`
    );
  });

  test('catch-all rule sets X-Robots-Tag with all five directives', () => {
    const catchAll = (config.headers || []).find(
      (h) => h.source === '/(.*)' || h.source === '/:path*'
    );
    assert.ok(catchAll, 'no catch-all header rule found');

    const robotsHeader = (catchAll.headers || []).find(
      (h) => h.key.toLowerCase() === 'x-robots-tag'
    );
    assert.ok(robotsHeader, 'catch-all rule must set X-Robots-Tag');

    for (const directive of REQUIRED_ROBOTS_DIRECTIVES) {
      assert.ok(
        robotsHeader.value.includes(directive),
        `X-Robots-Tag must include "${directive}", got "${robotsHeader.value}"`
      );
    }
  });
});

// ─── Honeypot links are actually reachable by crawlers ───────────────────────

describe('Honeypot trap links are present in served HTML', () => {
  for (const page of HONEYPOT_PAGES) {
    test(`${page} contains a hidden link to ${HONEYPOT_PATH}`, () => {
      const html = fs.readFileSync(path.join(REPO_ROOT, page), 'utf8');
      assert.ok(
        html.includes(HONEYPOT_PATH),
        `${page} must link to the honeypot trap so crawlers walk into it`
      );
    });

    test(`${page} honeypot link is hidden from real users and screen readers`, () => {
      const html = fs.readFileSync(path.join(REPO_ROOT, page), 'utf8');
      // Locate the href specifically — a bare path match would also hit prose
      // or comments mentioning the trap.
      const idx = html.indexOf(`href="${HONEYPOT_PATH}"`);
      assert.notEqual(idx, -1, `${page} has no honeypot link`);

      // Inspect the anchor tag that carries the honeypot href.
      const tagStart = html.lastIndexOf('<a', idx);
      const tagEnd = html.indexOf('>', idx);
      const anchor = html.slice(tagStart, tagEnd + 1);

      assert.ok(
        anchor.includes('display:none') || anchor.includes('display: none'),
        `${page} honeypot anchor must be display:none so real users never click it`
      );
      assert.ok(
        anchor.includes('aria-hidden="true"'),
        `${page} honeypot anchor must be aria-hidden so screen-reader users never reach it`
      );
      assert.ok(
        anchor.includes('tabindex="-1"'),
        `${page} honeypot anchor must be tabindex="-1" so keyboard users never tab into it`
      );
      assert.ok(
        anchor.includes('rel="nofollow"'),
        `${page} honeypot anchor must be rel="nofollow" so well-behaved crawlers are not punished`
      );
    });
  }
});
