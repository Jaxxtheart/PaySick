'use strict';

/**
 * Unit Tests — Shield™ IP slide in the investor deck
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Background:
 *   claude/update-paysick-investor-deck-v9VKG (April) added a Shield™ slide, but
 *   bundled it with a business-model pivot (marketplace out, direct balance-sheet
 *   funding in, R30M ask) that main's newer July deck contradicts. The decision
 *   was to take the Shield IP slide only and leave main's marketplace narrative
 *   intact.
 *
 *   The branch's slide also has to be reframed before it can land:
 *     - investor-deck.test.js blocks the word "underwriting" in deck copy
 *       (product framing must stay payment-facilitation, not credit provision)
 *     - it quoted PD 3.2% / net loss 1.4%, which main's slide 08 has since
 *       recomputed to PD 1.4% / net loss 0.63%
 *     - it described a "Capital Gate: balance sheet capacity check", which is
 *       the rejected funding model
 *
 *   So this pins the slide to the engine that actually ships in
 *   backend/src/services/shield-gates.service.js.
 *
 * Run: node --test tests/unit/investor-deck-shield.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const deck = fs.readFileSync(path.join(REPO_ROOT, 'investor-deck.html'), 'utf8');
const shieldService = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/services/shield-gates.service.js'),
  'utf8'
);

/** The slide's own markup, isolated so assertions cannot pass on other slides. */
function shieldSlide() {
  const start = deck.indexOf('id="slide-shield"');
  assert.notEqual(start, -1, 'no slide with id="slide-shield" found');
  const sectionStart = deck.lastIndexOf('<section', start);
  const sectionEnd = deck.indexOf('</section>', start);
  return deck.slice(sectionStart, sectionEnd);
}

// ─── The slide exists and is wired into the deck ─────────────────────────────

describe('Shield slide is present and navigable', () => {
  test('deck contains a Shield slide section', () => {
    assert.ok(deck.includes('id="slide-shield"'), 'Shield slide section missing');
  });

  test('slide carries the Shield trademark and IP framing', () => {
    const slide = shieldSlide();
    assert.ok(slide.includes('Shield™'), 'Shield™ trademark missing from the slide');
    assert.match(slide, /IP|moat|proprietary/i, 'slide does not frame Shield as proprietary IP');
  });

  test('deck counters, nav dots and PPTX slides are all 17', () => {
    const counters = deck.match(/\d\d \/ 17/g) || [];
    assert.strictEqual(counters.length, 17, `expected 17 "NN / 17" counters, found ${counters.length}`);
    assert.ok(deck.includes('17 / 17'), 'final counter 17 / 17 missing');

    const navDots = deck.match(/class="nav-dot(?: active)?" data-slide=/g) || [];
    assert.strictEqual(navDots.length, 17, `expected 17 nav dots, found ${navDots.length}`);

    const addSlide = deck.match(/pptx\.addSlide\(\)/g) || [];
    assert.strictEqual(addSlide.length, 17, `expected 17 PPTX slides, found ${addSlide.length}`);
  });

  test('no stale "/ 16" counters left behind', () => {
    assert.ok(!/\d\d \/ 16/.test(deck), 'a slide counter still reads "/ 16"');
  });

  test('the exported PPTX includes a Shield slide', () => {
    assert.match(deck, /addText\(\s*['"][^'"]*Shield/i, 'downloadPPTX() does not emit a Shield slide');
  });
});

// ─── The slide describes the engine that actually ships ──────────────────────

describe('Shield slide matches the shipped five-gate engine', () => {
  const GATES = ['Provider', 'Affordability', 'Urgency', 'Tariff', 'Circuit Breaker'];

  for (const gate of GATES) {
    test(`names the ${gate} gate`, () => {
      assert.ok(
        shieldSlide().includes(gate),
        `Shield slide does not mention the ${gate} gate`
      );
    });

    test(`${gate} gate exists in shield-gates.service.js`, () => {
      const token = gate.toUpperCase().replace(/ /g, '_');
      assert.ok(
        shieldService.includes(token),
        `shield-gates.service.js has no ${token} constant — the slide would overclaim`
      );
    });
  }

  test('describes it as a five-gate engine', () => {
    assert.match(shieldSlide(), /five|5/i, 'slide does not state the gate count');
  });
});

// ─── The rejected pivot did not ride along ───────────────────────────────────

describe('Shield slide does not smuggle in the rejected balance-sheet pivot', () => {
  test('no R30M / R20M capital ask', () => {
    const slide = shieldSlide();
    assert.ok(!slide.includes('R30M'), 'R30M capital ask present');
    assert.ok(!slide.includes('R20M'), 'R20M balance sheet ask present');
  });

  test('no "Capital Gate" — that gate does not exist in the engine', () => {
    assert.ok(!shieldSlide().includes('Capital Gate'), 'Capital Gate present');
  });

  test('deck still presents the marketplace model', () => {
    assert.ok(deck.includes('Marketplace'), 'marketplace framing was lost');
  });
});

// ─── House style rules the existing deck tests enforce ───────────────────────

describe('Shield slide obeys existing deck copy rules', () => {
  test('does not use the prohibited term "underwriting"', () => {
    assert.ok(
      !shieldSlide().toLowerCase().includes('underwriting'),
      'product framing must stay payment-facilitation, not credit provision'
    );
  });

  test('uses no other prohibited lending vocabulary', () => {
    const slide = shieldSlide().toLowerCase();
    for (const term of ['borrower', 'loan book', 'originations']) {
      assert.ok(!slide.includes(term), `prohibited term present: "${term}"`);
    }
  });

  test('contains no em dashes', () => {
    assert.ok(!shieldSlide().includes('—'), 'em dash (—) present in Shield slide copy');
  });

  test('does not restate superseded risk figures from slide 08', () => {
    const slide = shieldSlide();
    assert.ok(!slide.includes('3.2%'), 'stale PD 3.2% present; slide 08 recomputed it to 1.4%');
    assert.ok(!slide.includes('45%'), 'stale LGD 45% present');
  });
});
