'use strict';

/**
 * Unit Tests: Care Agent entry point on the homepage
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The PaySick Care Agent was built on the unmerged branch
 * claude/inspiring-bardeen-b97kat (its v1.12.0 to v1.16.0). It is being
 * ported onto the repositioned homepage. The homepage gets the branch's
 * Google-style "Ask PaySick" search bar in the hero, which hands the typed
 * query to care-agent.html. Everything else on the homepage (copy, links,
 * "Get Started") stays exactly as it is.
 *
 * Run: node --test tests/unit/homepage-care-agent.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

function hero() {
  const m = html.match(/<section[^>]*id="top"[\s\S]*?<\/section>/);
  assert.ok(m, 'expected the hero <section id="top">');
  return m[0];
}

describe('homepage hero: Care Agent search bar', () => {
  test('has the search bar form with a labelled input', () => {
    const h = hero();
    assert.match(h, /<form class="agent-search" id="agent-search-form" role="search"/);
    assert.match(h, /id="agent-search-input"/);
    assert.match(h, /aria-label="Ask PaySick"/);
  });

  test('has a short hint naming the Care Agent', () => {
    assert.match(hero(), /<p class="agent-search-hint">[^<]*Care Agent[^<]*<\/p>/);
  });

  test('submitting routes to care-agent.html, carrying the typed query', () => {
    assert.ok(html.includes("'care-agent.html?q=' + encodeURIComponent(query)"));
  });

  test('the existing hero CTAs are unchanged', () => {
    const h = hero();
    assert.match(h, /<a href="login.html" class="primary-btn">Get Started<\/a>/);
    assert.match(h, /<a href="#how-it-works"[^>]*>Explore how it works<\/a>/);
    assert.match(h, /<a href="#providers"[^>]*>Partner with PaySick<\/a>/);
  });
});

describe('care-agent.html exists and accepts the carried-over query', () => {
  const page = path.join(REPO_ROOT, 'care-agent.html');

  test('the page exists', () => {
    assert.ok(fs.existsSync(page));
  });

  test('reads the q= parameter', () => {
    const src = fs.readFileSync(page, 'utf8');
    assert.ok(src.includes('URLSearchParams(window.location.search)') && src.includes(".get('q')"));
  });

  test('links back to the homepage', () => {
    assert.match(fs.readFileSync(page, 'utf8'), /href="index.html"/);
  });
});
