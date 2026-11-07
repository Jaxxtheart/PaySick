'use strict';

/**
 * Unit Tests — Homepage hero: Google-style search bar for the Care Agent,
 * alongside the original PaySick call to action
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Supersedes this file's earlier v1.12.1 assertions (Care Agent as the
 * hero's primary-btn, traditional CTA demoted to a text link). Per
 * explicit product direction, that flip is reverted: the original
 * "Get Started" / "Learn More" call to action about what PaySick is stays
 * exactly as it always was. The Care Agent instead gets its own
 * Google-style search bar in the hero — a single prominent input that
 * routes a typed query straight into care-agent.html.
 *
 * Run: node --test tests/unit/homepage-agent-first-cta.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

/** Extracts the <section class="hero">...</section> block. */
function getHeroSection(source) {
  const start = source.indexOf('<section class="hero"');
  assert.notEqual(start, -1, 'index.html must have a hero section');
  const end = source.indexOf('</section>', start);
  return source.slice(start, end);
}

describe('Homepage hero — the original PaySick call to action is preserved', () => {
  const hero = getHeroSection(html);

  test('the primary CTA is "Get Started", linking to login.html', () => {
    const idx = hero.indexOf('href="login.html"');
    assert.notEqual(idx, -1, 'no href="login.html" in the hero');
    const tagStart = hero.lastIndexOf('<a', idx);
    const tagEnd = hero.indexOf('>', idx);
    const anchor = hero.slice(tagStart, tagEnd + 1);
    assert.ok(
      anchor.includes('class="primary-btn"') || anchor.includes("class='primary-btn'"),
      `login.html's hero link must keep its original primary-btn styling, got: ${anchor}`
    );
  });

  test('exactly one primary-btn remains in the hero (no competing primary CTAs)', () => {
    const matches = hero.match(/class=['"]primary-btn['"]/g) || [];
    assert.equal(matches.length, 1, `expected exactly one primary-btn in the hero, found ${matches.length}`);
  });

  test('the hero paragraph talks about a "payment plan", not a fixed "three easy monthly payments"', () => {
    assert.ok(
      hero.includes('payment plan'),
      'the hero paragraph must describe a payment plan'
    );
    assert.ok(
      !hero.includes('three easy monthly payments'),
      'the hero must not hardcode a fixed 3-month cadence — the Care Agent (and the wider marketplace) offer flexible terms'
    );
  });

  test('the hero paragraph no longer asserts "Available at leading South African healthcare providers. No complicated terms, just straightforward payment solutions."', () => {
    assert.ok(
      !hero.includes('Available at leading South African healthcare providers. No complicated terms, just straightforward payment solutions.'),
      'that trailing sentence must be removed from the hero paragraph'
    );
  });

  test('"Learn More" secondary button is restored, unchanged', () => {
    assert.ok(hero.includes('>Learn More<'), 'the original "Learn More" secondary button text must be restored');
  });
});

describe('Homepage hero — Google-style search bar for the Care Agent', () => {
  const hero = getHeroSection(html);

  test('a search input for the Care Agent is present', () => {
    assert.ok(
      hero.includes('id="agent-search-input"'),
      'hero must contain an #agent-search-input search field'
    );
  });

  test('the search field sits inside a dedicated search-bar container', () => {
    assert.ok(
      hero.includes('class="agent-search"') || hero.includes("class='agent-search'"),
      'the search bar must be wrapped in a .agent-search container'
    );
  });

  test('submitting the search bar routes to care-agent.html with the typed query', () => {
    assert.ok(
      html.includes('care-agent.html?q='),
      'the search bar must navigate to care-agent.html with the query string carried over'
    );
  });
});

describe('care-agent.html — picks up a query carried over from the homepage search bar', () => {
  const careAgentHtml = fs.readFileSync(path.join(REPO_ROOT, 'care-agent.html'), 'utf8');

  test('reads the q= parameter from the URL', () => {
    assert.ok(
      careAgentHtml.includes('URLSearchParams(window.location.search)') &&
        careAgentHtml.includes(".get('q')"),
      'care-agent.html must read a ?q= query param carried over from the homepage search bar'
    );
  });
});
