'use strict';

/**
 * Unit Tests: homepage section contrast and design elements (v1.17.1)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Owner request: "add more design elements to contrast the different
 * sections of the homepage". This pins the structure of that design:
 *   - every section has its own visual theme, and no two neighbours share one
 *   - each section after the hero has a small eyebrow label
 *   - decorative artwork (heartbeat line, dividers, provider flow, technology
 *     network, watermark) is hidden from assistive technology
 *   - motion respects prefers-reduced-motion
 *   - scroll-reveal never hides content when JavaScript is off
 * Copy and links are pinned separately (homepage-repositioning.test.js,
 * homepage-care-agent.test.js) and must not change.
 *
 * Run: node --test tests/unit/homepage-section-design.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

const SECTION_IDS = ['top', 'features', 'how-it-works', 'providers', 'technology', 'about', 'start'];

function sectionTag(id) {
  const m = html.match(new RegExp(`<section[^>]*id="${id}"[^>]*>`));
  assert.ok(m, `missing <section id="${id}">`);
  return m[0];
}

function sectionHtml(id) {
  return html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?<\\/section>`))[0];
}

function theme(id) {
  const m = sectionTag(id).match(/\btheme-([a-z]+)\b/);
  assert.ok(m, `<section id="${id}"> has no theme-* class`);
  return m[1];
}

describe('each homepage section has its own visual theme', () => {
  test('every section carries a theme-* class with a CSS rule', () => {
    for (const id of SECTION_IDS) {
      const t = theme(id);
      assert.match(css, new RegExp(`\\.theme-${t}\\s*\\{`), `no CSS rule for .theme-${t}`);
    }
  });

  test('no two neighbouring sections share a theme', () => {
    for (let i = 1; i < SECTION_IDS.length; i += 1) {
      assert.notEqual(theme(SECTION_IDS[i - 1]), theme(SECTION_IDS[i]), `${SECTION_IDS[i - 1]} and ${SECTION_IDS[i]} look the same`);
    }
  });

  test('at least two sections are dark, for strong contrast', () => {
    const dark = SECTION_IDS.filter((id) => /theme-(dark|ink)\b/.test(sectionTag(id)));
    assert.ok(dark.length >= 2, `expected at least 2 dark sections, got ${dark.length}`);
  });
});

describe('section labels and artwork', () => {
  test('every section after the hero has an eyebrow label', () => {
    for (const id of SECTION_IDS.slice(1)) {
      assert.match(sectionHtml(id), /class="section-eyebrow"/, `${id} has no eyebrow`);
    }
  });

  test('the hero has an animated heartbeat line, hidden from assistive technology', () => {
    assert.match(sectionHtml('top'), /<svg class="pulse-line"[^>]*aria-hidden="true"/);
    assert.match(css, /@keyframes pulse-draw/);
  });

  test('sections after the hero open with a curved divider, hidden from assistive technology', () => {
    for (const id of SECTION_IDS.slice(1)) {
      assert.match(sectionHtml(id), /<div class="divider[^"]*" aria-hidden="true">\s*<svg/, `${id} has no divider`);
    }
  });

  test('the providers section has a decorative flow illustration', () => {
    assert.match(sectionHtml('providers'), /<div class="provider-flow" aria-hidden="true"[^>]*>/);
  });

  test('the technology section has a decorative network and capability chips', () => {
    const tech = sectionHtml('technology');
    assert.match(tech, /<svg class="tech-network"[^>]*aria-hidden="true"/);
    assert.match(tech, /class="tech-chips"/);
  });

  test('the about section has a logo watermark', () => {
    assert.match(sectionHtml('about'), /<svg class="about-watermark"[^>]*aria-hidden="true"/);
  });
});

describe('motion and progressive enhancement', () => {
  test('reduced-motion users get no animation', () => {
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n {8}\}/);
    assert.ok(reduced, 'expected a prefers-reduced-motion block');
    assert.match(reduced[0], /animation:\s*none/);
    assert.match(reduced[0], /\[data-reveal\]/);
  });

  test('reveal-on-scroll only hides content once JavaScript has opted in', () => {
    assert.doesNotMatch(css, /(^|\n)\s*\[data-reveal\]\s*\{[^}]*opacity:\s*0/, 'content must not be hidden without JS');
    assert.match(css, /\.js-reveal \[data-reveal\]\s*\{[^}]*opacity:\s*0/);
    assert.match(html, /IntersectionObserver/);
  });
});
