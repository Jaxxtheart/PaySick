'use strict';

/**
 * Unit Tests — Homepage hero: Care Agent as the primary "get started" path
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Follow-up to v1.12.0 (PaySick Care Agent), which added "Ask PaySick" as a
 * small secondary teaser below the traditional primary CTA. This PATCH
 * flips that emphasis per explicit product direction: the Care Agent
 * becomes the landing page's main "get started" action, while the
 * traditional apply-first journey (login.html) remains fully reachable —
 * demoted to a secondary/tertiary link, never removed.
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

describe('Homepage hero — Care Agent is the primary CTA', () => {
  const hero = getHeroSection(html);

  test('the hero still links to care-agent.html', () => {
    assert.ok(hero.includes('care-agent.html'), 'hero must link to care-agent.html');
  });

  test('the hero still links to login.html (traditional journey preserved, never removed)', () => {
    assert.ok(hero.includes('login.html'), 'hero must still link to login.html');
  });

  test('the care-agent.html link carries the primary-btn styling', () => {
    const idx = hero.indexOf('href="care-agent.html"');
    assert.notEqual(idx, -1, 'no href="care-agent.html" in the hero');
    const tagStart = hero.lastIndexOf('<a', idx);
    const tagEnd = hero.indexOf('>', idx);
    const anchor = hero.slice(tagStart, tagEnd + 1);
    assert.ok(
      anchor.includes('class="primary-btn"') || anchor.includes("class='primary-btn'"),
      `care-agent.html's hero link must be styled as the primary CTA, got: ${anchor}`
    );
  });

  test('the login.html link is no longer styled as the primary CTA', () => {
    const idx = hero.indexOf('href="login.html"');
    assert.notEqual(idx, -1, 'no href="login.html" in the hero');
    const tagStart = hero.lastIndexOf('<a', idx);
    const tagEnd = hero.indexOf('>', idx);
    const anchor = hero.slice(tagStart, tagEnd + 1);
    assert.ok(
      !anchor.includes('class="primary-btn"') && !anchor.includes("class='primary-btn'"),
      `login.html's hero link must be demoted off primary-btn styling, got: ${anchor}`
    );
  });

  test('the care-agent.html primary CTA appears before the login.html link (agent-first ordering)', () => {
    const agentIdx = hero.indexOf('href="care-agent.html"');
    const loginIdx = hero.indexOf('href="login.html"');
    assert.ok(agentIdx < loginIdx, 'the Care Agent CTA must lead the hero, with the traditional link following it');
  });

  test('exactly one primary-btn remains in the hero (no competing primary CTAs)', () => {
    const matches = hero.match(/class=['"]primary-btn['"]/g) || [];
    assert.equal(matches.length, 1, `expected exactly one primary-btn in the hero, found ${matches.length}`);
  });
});
