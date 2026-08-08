'use strict';

/**
 * Unit Tests — SANParks media licensing page
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * A media library is the single most scrape-attractive thing this platform could
 * ship: the whole point of the page is to show imagery and name a price for it.
 * So the CLAUDE.md "Bot Crawling Prevention" rules are not boilerplate here, they
 * are the product. In particular the JS-rendering requirement — "pages must
 * require client-side JS execution to render meaningful content, so that headless
 * HTTP scrapers receive no usable payload" — means the catalogue and the price
 * list must NOT exist in the served HTML. They arrive from an authenticated API
 * call after the page boots.
 *
 * Run: node --test tests/unit/sanparks-page.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const PAGE = path.join(REPO_ROOT, 'sanparks.html');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

// ─── The page exists and follows house conventions ───────────────────────────

describe('sanparks.html exists and is branded', () => {
  test('the file exists', () => {
    assert.ok(fs.existsSync(PAGE), 'sanparks.html missing');
  });

  test('has a PaySick page title', () => {
    assert.match(read('sanparks.html'), /<title>[^<]*PaySick[^<]*<\/title>/);
  });

  test('uses the shared site header and footer classes', () => {
    const html = read('sanparks.html');
    assert.ok(html.includes('site-header'), 'missing .site-header');
    assert.ok(html.includes('site-footer'), 'missing .site-footer');
  });

  test('declares a lang attribute and a viewport meta', () => {
    const html = read('sanparks.html');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /name="viewport"/);
  });

  test('footer carries the same legal links as the other standalone pages', () => {
    const html = read('sanparks.html');
    for (const link of ['terms-of-service.html', 'privacy-policy.html', 'accessibility.html']) {
      assert.ok(html.includes(link), `footer link to ${link} missing`);
    }
  });

  test('is reachable from the home page', () => {
    assert.ok(read('index.html').includes('sanparks.html'), 'index.html has no link to the SANParks page');
  });
});

// ─── Bot protection on the page itself ───────────────────────────────────────

describe('sanparks.html carries the CLAUDE.md bot protections', () => {
  test('declares a robots meta with all five directives', () => {
    const html = read('sanparks.html');
    const meta = html.match(/<meta\s+name="robots"\s+content="([^"]+)"/i);
    assert.ok(meta, 'no robots meta tag');
    for (const directive of ['noindex', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex']) {
      assert.ok(meta[1].includes(directive), `robots meta missing "${directive}"`);
    }
  });

  test('contains a honeypot link that real users cannot reach', () => {
    const html = read('sanparks.html');
    const idx = html.indexOf('href="/api/hp-check"');
    assert.notEqual(idx, -1, 'no honeypot link');

    const anchor = html.slice(html.lastIndexOf('<a', idx), html.indexOf('>', idx) + 1);
    assert.ok(anchor.includes('display:none') || anchor.includes('display: none'), 'honeypot must be display:none');
    assert.ok(anchor.includes('aria-hidden="true"'), 'honeypot must be aria-hidden');
    assert.ok(anchor.includes('tabindex="-1"'), 'honeypot must be tabindex="-1"');
    assert.ok(anchor.includes('rel="nofollow"'), 'honeypot must be rel="nofollow"');
  });
});

// ─── The payload a headless scraper would receive ────────────────────────────

describe('sanparks.html renders its catalogue client-side only', () => {
  const html = read('sanparks.html');

  test('has a catalogue container that is empty in the served HTML', () => {
    const match = html.match(/<div[^>]*id="assetGrid"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(match, 'no #assetGrid container');
    assert.equal(
      match[1].replace(/<!--[\s\S]*?-->/g, '').trim(),
      '',
      'the catalogue container must be empty in source — a scraper must get nothing'
    );
  });

  test('has a plan container that is empty in the served HTML', () => {
    const match = html.match(/<div[^>]*id="planGrid"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(match, 'no #planGrid container');
    assert.equal(
      match[1].replace(/<!--[\s\S]*?-->/g, '').trim(),
      '',
      'plan pricing must not be present in source'
    );
  });

  test('fetches the catalogue and the plans from the API at runtime', () => {
    assert.ok(html.includes('/api/sanparks/assets'), 'page never calls the asset endpoint');
    assert.ok(html.includes('/api/sanparks/plans'), 'page never calls the plans endpoint');
  });

  test('no rand price appears as static markup anywhere on the page', () => {
    // Prices live in the API response, not the document. Anything matching a
    // formatted rand amount in the source means a scraper gets it for free.
    const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    const priceLike = withoutScripts.match(/R\s?\d[\d  ,.]*\d/g) || [];
    assert.deepEqual(priceLike, [], `static prices leaked into the markup: ${priceLike.join(', ')}`);
  });

  test('tells users without JavaScript what is going on rather than showing a blank page', () => {
    assert.ok(/<noscript>/i.test(html), 'no <noscript> fallback');
  });

  test('sends the bearer token with catalogue requests — no unauthenticated data', () => {
    assert.ok(/Authorization/i.test(html), 'the page must send an Authorization header');
  });
});

// ─── The product the page describes ──────────────────────────────────────────

describe('sanparks.html describes the subscription product', () => {
  const html = read('sanparks.html');

  test('offers both renewable term lengths', () => {
    assert.ok(/\b1\s*year\b/i.test(html) || /12[\s-]month/i.test(html), 'no one-year term offered');
    assert.ok(/\b2\s*year\b/i.test(html) || /24[\s-]month/i.test(html), 'no two-year term offered');
  });

  test('has a term selector wired to the quote', () => {
    assert.ok(/id="termToggle"|data-term="12"|data-term="24"/.test(html), 'no term selector');
  });

  test('explains that rights transfer happens with the purchase', () => {
    assert.ok(/rights/i.test(html), 'the page never mentions rights');
    assert.ok(
      /chain of title|certificate/i.test(html),
      'the page should surface the rights certificate / chain of title'
    );
  });

  test('names SANParks and conservation', () => {
    assert.ok(/SANParks/i.test(html));
    assert.ok(/conservation/i.test(html), 'the conservation levy is the point — say so');
  });
});
