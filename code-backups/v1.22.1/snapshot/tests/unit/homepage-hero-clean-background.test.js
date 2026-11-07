'use strict';

/**
 * Unit Tests: clean hero background (v1.22.1)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Owner request: "change this section of the homepage to a cleaner
 * background, remove the pattern". The hero (theme-blush) must:
 *   - have no repeating plus-pattern image
 *   - have no blurred brand-red glow blobs (::before / ::after)
 *   - still be a soft white → blush wash, so it flows into the
 *     blush divider that opens the next section
 *
 * Run: node --test tests/unit/homepage-hero-clean-background.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(^|[\\s}])${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[2] : null;
}

describe('hero has a clean background', () => {
  test('the hero section still uses the blush theme', () => {
    assert.match(html, /<section class="hero theme-blush" id="top">/);
  });

  test('no background pattern image on the hero', () => {
    const body = rule('.theme-blush');
    assert.ok(body, 'missing .theme-blush rule');
    assert.doesNotMatch(body, /url\(/, 'hero background still has an image/pattern');
  });

  test('no decorative glow blobs on the hero', () => {
    assert.doesNotMatch(css, /\.theme-blush::(before|after)/, 'hero still has ::before/::after glows');
  });

  test('background is a soft wash ending in the blush divider colour', () => {
    const body = rule('.theme-blush');
    assert.match(body, /background:\s*linear-gradient\(180deg,\s*#ffffff\s+0%,\s*#FFF1F3\s+100%\)/i);
    assert.match(css, /\.divider-blush\s*\{\s*color:\s*#FFF1F3;/i);
  });
});
