'use strict';

/**
 * Unit Tests — /investors route alias
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Bug: https://paysick.co.za/investors returned a Vercel 404 (NOT_FOUND).
 *
 * The deck lives in investor-deck.html. With `cleanUrls: true` Vercel serves it
 * at /investor-deck, and vercel.json rewrites only /health and /api/(.*), so
 * /investors resolved to nothing. The page was reachable the whole time, just
 * not at the path everyone actually types. research.html is the only in-repo
 * link to it and correctly points at investor-deck.html, which is why this was
 * never caught by a broken internal link.
 *
 * Fix: rewrite /investors to the deck. A rewrite rather than a redirect, so the
 * address bar keeps the path the reader was given.
 *
 * Run: node --test tests/unit/investors-route.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const vercel = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8')
);

/** The rewrite rules, as an array (vercel.json may omit the key entirely). */
const rewrites = vercel.rewrites || [];

function rewriteFor(source) {
  return rewrites.find((r) => r.source === source);
}

describe('/investors resolves to the deck', () => {
  test('the deck file the alias points at actually exists', () => {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, 'investor-deck.html')),
      'investor-deck.html is missing, so any alias to it would 404 too'
    );
  });

  test('vercel.json rewrites /investors', () => {
    const rule = rewriteFor('/investors');
    assert.ok(rule, '/investors has no rewrite rule, so it 404s');
  });

  test('the rewrite targets investor-deck.html', () => {
    const rule = rewriteFor('/investors');
    assert.equal(
      rule.destination,
      '/investor-deck.html',
      'rewrite must name the .html file; cleanUrls does not resolve the extension for a rewrite destination'
    );
  });

  test('it is a rewrite, not a redirect', () => {
    // A redirect would bounce the reader to /investor-deck and change the URL
    // they were given. The alias exists so the shared link survives.
    const redirects = vercel.redirects || [];
    assert.ok(
      !redirects.some((r) => r.source === '/investors'),
      '/investors is a redirect; it should be a rewrite so the path is preserved'
    );
  });

  test('the alias does not shadow the API or health rewrites', () => {
    // Order matters in vercel.json: a broad source placed above /api/(.*) would
    // swallow API traffic.
    const sources = rewrites.map((r) => r.source);
    const investorsAt = sources.indexOf('/investors');
    const apiAt = sources.indexOf('/api/(.*)');
    assert.notEqual(apiAt, -1, 'the /api rewrite disappeared');
    assert.ok(
      investorsAt > -1 && investorsAt !== apiAt,
      '/investors must be its own rule'
    );
    assert.ok(
      !/^\/\(\.\*\)/.test(rewrites[investorsAt].source),
      '/investors must not be a catch-all'
    );
  });
});

describe('the alias inherits the bot protections', () => {
  // CLAUDE.md: "Every new page or API route added must be reviewed to confirm
  // all protections above apply before merging." /investors is a new path, so
  // this is that review.

  test('the catch-all X-Robots-Tag header still covers every path', () => {
    const headers = vercel.headers || [];
    const catchAll = headers.find((h) => h.source === '/(.*)');
    assert.ok(catchAll, 'catch-all header block missing');
    const tag = (catchAll.headers || []).find(
      (h) => h.key === 'X-Robots-Tag'
    );
    assert.ok(tag, 'X-Robots-Tag missing from the catch-all block');
    for (const directive of [
      'noindex',
      'nofollow',
      'noarchive',
      'nosnippet',
      'noimageindex',
    ]) {
      assert.ok(
        tag.value.includes(directive),
        `X-Robots-Tag is missing "${directive}"`
      );
    }
  });

  test('robots.txt still disallows all crawlers from all paths', () => {
    const robots = fs.readFileSync(path.join(REPO_ROOT, 'robots.txt'), 'utf8');
    assert.match(robots, /User-agent:\s*\*/i, 'no wildcard user-agent rule');
    assert.match(robots, /Disallow:\s*\//, 'robots.txt does not disallow /');
  });

  test('the alias serves a page, not an API surface', () => {
    // No authentication requirement applies: this is a static marketing page
    // with no business logic or data behind it, same as /investor-deck.
    const rule = rewriteFor('/investors');
    assert.ok(
      rule && !rule.destination.startsWith('/api/'),
      '/investors must not be wired to an API handler'
    );
  });
});
