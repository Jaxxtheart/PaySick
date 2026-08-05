'use strict';

/**
 * Unit Tests — removal of the v1.10.0 business-case slides
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * v1.10.0 added five slides: pricing, unit economics, provider economics,
 * capability value, and outreach at scale. The outreach slide was deleted in
 * v1.11.0 because its central claim was false. The remaining four are removed
 * here at the founder's direction.
 *
 * Consequence worth recording: v1.10.0 also deleted the deck's original
 * "Business Model" slide, on the grounds that its figures contradicted
 * fee.service.js. With the four replacement slides gone too, the deck now
 * carries no pricing or business-model slide at all. That is a deliberate state,
 * not an oversight. The old slide is NOT restored: it claimed a "2-4%
 * arrangement fee" against the 5% the platform actually charges, so bringing it
 * back would reintroduce a known-false claim. Its code remains in
 * code-backups/v1.9.0/snapshot/investor-deck.html.
 *
 * The superseded-pricing bans that lived in investor-deck-business-case.test.js
 * are not lost with that file: they move into investor-deck.test.js, so the old
 * figures still cannot creep back.
 *
 * Run: node --test tests/unit/investor-deck-business-slides-removed.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const deck = fs.readFileSync(path.join(REPO_ROOT, 'investor-deck.html'), 'utf8');

const REMOVED_SLIDES = [
  'slide-pricing',
  'slide-unit-economics',
  'slide-provider-economics',
  'slide-capability-case',
];

describe('the four business-case slides are gone', () => {
  for (const id of REMOVED_SLIDES) {
    test(`${id} no longer exists`, () => {
      assert.ok(!deck.includes(`id="${id}"`), `${id} is still in the deck`);
    });
  }

  test('their PPTX builders are gone', () => {
    for (const builder of ['slidePricing', 'slideUnit', 'slideProvider', 'slideCap']) {
      assert.ok(!deck.includes(builder), `PPTX builder still present: ${builder}`);
    }
    for (const marker of ["'PRICING'", "'UNIT ECONOMICS'", "'PROVIDER ECONOMICS'", "'CAPABILITIES'"]) {
      assert.ok(!deck.includes(marker), `downloadPPTX() still emits ${marker}`);
    }
  });

  test('their figures are gone from the deck entirely', () => {
    for (const figure of [
      'R1,147',   // gross revenue per arrangement
      'R1,009',   // contribution per arrangement
      'R12,300',  // year-one cost per provider
      'R888,000', // target profile facilitated volume
      'R55,056',
      'R48,432',
      '15.2x',    // LTV:CAC
      'R145M',    // marketplace capital relief
      'R2.13M',
      '6.2%',     // blended take rate
    ]) {
      assert.ok(!deck.includes(figure), `orphaned business-case figure: "${figure}"`);
    }
  });

  test('the pricing copy is gone', () => {
    for (const phrase of [
      'Four prices',
      'No subscription',
      'placement fee',
      'Contribution per arrangement',
      'breakeven',
      'What each capability',
    ]) {
      assert.ok(
        !deck.toLowerCase().includes(phrase.toLowerCase()),
        `orphaned business-case copy: "${phrase}"`
      );
    }
  });
});

describe('the CSS added for those slides is gone too', () => {
  // These classes had no other consumer on the deck, so leaving them behind
  // would be dead style rules.
  for (const cls of ['.ledger', '.ledger-wrap', '.assumption', '.flag-good', '.flag-bad', '.pill']) {
    test(`${cls} rule is removed`, () => {
      assert.ok(!deck.includes(`${cls} {`), `dead CSS rule left behind: ${cls}`);
      assert.ok(!deck.includes(`${cls},`), `dead CSS selector left behind: ${cls}`);
    });
  }
});

describe('deck structure is consistent at 16 slides', () => {
  test('counters, nav dots and PPTX slides are all 16', () => {
    const counters = deck.match(/\d\d \/ 16/g) || [];
    assert.equal(counters.length, 16, `expected 16 counters, found ${counters.length}`);
    assert.ok(deck.includes('16 / 16'), 'final counter 16 / 16 missing');

    const navDots = deck.match(/class="nav-dot(?: active)?" data-slide=/g) || [];
    assert.equal(navDots.length, 16, `expected 16 nav dots, found ${navDots.length}`);

    const addSlide = deck.match(/pptx\.addSlide\(\)/g) || [];
    assert.equal(addSlide.length, 16, `expected 16 PPTX slides, found ${addSlide.length}`);
  });

  test('counters run 01 through 16 with no gap or duplicate', () => {
    const seen = (deck.match(/(\d\d) \/ 16/g) || []).map((c) => c.slice(0, 2));
    const expected = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0'));
    assert.deepEqual(seen.slice().sort(), expected.slice().sort());
  });

  test('no stale "/ 20" or "/ 21" counters left behind', () => {
    for (const n of [20, 21]) {
      assert.ok(
        !new RegExp(`\\d\\d \\/ ${n}`).test(deck),
        `a slide counter still reads "/ ${n}"`
      );
    }
  });

  test('the slides that predate v1.10.0 all survive', () => {
    // Guards against the PPTX comment-numbering trap that cut six unrelated
    // blocks during the v1.11.0 removal.
    for (const id of [
      'slide-0', 'slide-1', 'slide-2', 'slide-sequencing', 'slide-3',
      'slide-4', 'slide-5', 'slide-7', 'slide-8', 'slide-9', 'slide-10',
      'slide-shield', 'slide-11', 'slide-12', 'slide-13', 'slide-14',
    ]) {
      assert.ok(deck.includes(`id="${id}"`), `collateral damage: ${id} is missing`);
    }
  });

  test('every surviving slide still has a PPTX counterpart', () => {
    const sections = (deck.match(/<section class="slide/g) || []).length;
    const addSlide = (deck.match(/pptx\.addSlide\(\)/g) || []).length;
    assert.equal(sections, addSlide, 'HTML and PPTX slide counts diverged');
  });
});

describe('the deck carries no pricing claim at all', () => {
  test('the superseded Business Model figures did not come back', () => {
    // v1.10.0 removed that slide as contradicting fee.service.js. Deleting its
    // replacements must not resurrect it.
    for (const term of [
      'R1,850 (10%)',
      '2-4% arrangement fee',
      '40% of Revenue',
      '35% of Revenue',
      '25% of Revenue',
      'Target CAC: R320',
      'Multiple revenue streams',
    ]) {
      assert.ok(!deck.includes(term), `superseded pricing claim resurrected: "${term}"`);
    }
  });
});
