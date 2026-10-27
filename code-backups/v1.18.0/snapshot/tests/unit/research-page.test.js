'use strict';

/**
 * Unit Tests — Research page
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Background:
 *   claude/add-white-paper-section-rRW63 (February) added a research page that
 *   published PaySick White Paper V4, along with the .docx/.pdf binaries and the
 *   Python scripts that generated them. main never took any of it, and the
 *   changelog now references White Paper V6.0 as current, so that payload is two
 *   revisions stale.
 *
 *   The decision was to land the page structure and its navigation, but NOT the
 *   stale V4 document. So this pins:
 *     - the page exists, is branded consistently, and is reachable from the site
 *     - it states plainly that the paper is not yet published, rather than
 *       shipping a dead download button or a stale document
 *     - no V4 artefacts leak back in
 *     - the CLAUDE.md bot-crawling protections that every page must carry
 *
 * Run: node --test tests/unit/research-page.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const RESEARCH = path.join(REPO_ROOT, 'research.html');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

// ─── The page exists and matches house conventions ───────────────────────────

describe('research.html exists and is branded', () => {
  test('the file exists', () => {
    assert.ok(fs.existsSync(RESEARCH), 'research.html missing');
  });

  test('has a PaySick page title', () => {
    assert.match(read('research.html'), /<title>[^<]*PaySick[^<]*<\/title>/);
  });

  test('uses the shared site header and footer classes', () => {
    const html = read('research.html');
    assert.ok(html.includes('site-header'), 'missing .site-header');
    assert.ok(html.includes('site-footer'), 'missing .site-footer');
  });

  test('footer carries the same legal links as the other standalone pages', () => {
    const html = read('research.html');
    for (const link of ['terms-of-service.html', 'privacy-policy.html', 'accessibility.html']) {
      assert.ok(html.includes(link), `footer link to ${link} missing`);
    }
  });

  test('declares a lang attribute and a viewport meta', () => {
    const html = read('research.html');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /name="viewport"/);
  });
});

// ─── It is reachable ─────────────────────────────────────────────────────────

describe('research page is reachable from the site', () => {
  test('index.html links to it', () => {
    assert.ok(
      read('index.html').includes('research.html'),
      'index.html has no link to the research page'
    );
  });
});

// ─── No stale V4 payload ─────────────────────────────────────────────────────

describe('the stale White Paper V4 payload did not come along', () => {
  test('no V4 binaries in the repo', () => {
    for (const artefact of [
      'PaySick_Underwriting_Risk_WhitePaper_V4.docx',
      'PaySick_Underwriting_Risk_WhitePaper_V4.html',
      'PaySick_Underwriting_Risk_WhitePaper_V4.pdf',
    ]) {
      assert.ok(!fs.existsSync(path.join(REPO_ROOT, artefact)), `${artefact} should not be committed`);
    }
  });

  test('no docx/pdf generator scripts', () => {
    const strays = fs
      .readdirSync(REPO_ROOT)
      .filter((f) => /^generate_(docx|pdf).*\.py$/.test(f));
    assert.deepStrictEqual(strays, [], `unexpected generator scripts: ${strays.join(', ')}`);
  });

  test('the page does not reference a V4 document', () => {
    assert.ok(!read('research.html').includes('V4'), 'page still references White Paper V4');
  });

  test('the page has no download link to a document that is not in the repo', () => {
    const html = read('research.html');
    const hrefs = [...html.matchAll(/href="([^"]+\.(?:pdf|docx))"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      const target = path.join(REPO_ROOT, href.replace(/^\//, ''));
      assert.ok(fs.existsSync(target), `dead download link: ${href}`);
    }
  });
});

// ─── It is honest about the missing paper ────────────────────────────────────

describe('the page states the paper is not yet published', () => {
  test('carries a clearly worded pending notice', () => {
    assert.match(
      read('research.html'),
      /not yet published|coming soon|in preparation|forthcoming/i,
      'page does not say the paper is unpublished'
    );
  });

  test('offers a contact route in place of a download', () => {
    assert.match(read('research.html'), /mailto:|contact\.html/, 'no contact route offered');
  });
});

// ─── CLAUDE.md bot-crawling protections ──────────────────────────────────────

describe('research page carries the standard bot protections', () => {
  test('includes the hidden honeypot link', () => {
    const html = read('research.html');
    assert.ok(html.includes('href="/api/hp-check"'), 'honeypot link missing');
    const idx = html.indexOf('href="/api/hp-check"');
    const anchor = html.slice(html.lastIndexOf('<a', idx), html.indexOf('>', idx) + 1);
    assert.ok(anchor.includes('display:none'), 'honeypot anchor is not display:none');
    assert.ok(anchor.includes('aria-hidden="true"'), 'honeypot anchor is not aria-hidden');
    assert.ok(anchor.includes('tabindex="-1"'), 'honeypot anchor is not tabindex="-1"');
    assert.ok(anchor.includes('rel="nofollow"'), 'honeypot anchor is not rel="nofollow"');
  });

  test('robots.txt still disallows everything, so the page is not indexable', () => {
    const robots = read('robots.txt');
    assert.match(robots, /User-agent:\s*\*/);
    assert.match(robots, /Disallow:\s*\//);
  });
});
