'use strict';

/**
 * Unit Tests — removal of the "Outreach at Scale" slide
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Why it is being removed:
 *   The slide asserted "It has never sent a message, because sending is blocked
 *   on DNS and a set of API keys, not on engineering", and carried a
 *   "Blocked today, 0 sent" row. Both are false. Over 40 outreach emails have
 *   been sent. Nothing in the code gates a send: the approve route calls the
 *   email service directly, with no DNS or domain-verification check anywhere in
 *   the path. DMARC/SPF/DKIM affect inbox placement, not the ability to send,
 *   and the bulk-sender enforcement thresholds do not apply at this volume.
 *
 *   The slide was built on a claim that did not survive contact with the facts,
 *   so it is deleted rather than rewritten. The deck returns to 20 slides.
 *
 * Run: node --test tests/unit/investor-deck-outreach-slide-removed.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const deck = fs.readFileSync(path.join(REPO_ROOT, 'investor-deck.html'), 'utf8');

describe('the outreach-at-scale slide is gone', () => {
  test('the slide section no longer exists', () => {
    assert.ok(
      !deck.includes('id="slide-outreach-scale"'),
      'slide-outreach-scale is still in the deck'
    );
  });

  test('the false claims are gone from the deck entirely', () => {
    for (const claim of [
      'It has never sent a message',
      'Blocked today',
      'costed three ways',
      'sending is blocked',
      '20 sourced, 0 sent',
    ]) {
      assert.ok(!deck.includes(claim), `false claim still present: "${claim}"`);
    }
  });

  test('figures that only existed to support that slide are gone', () => {
    // These were the scenario table and funnel numbers. They have no other
    // home on the deck, so leaving any behind would be an orphan.
    for (const figure of ['R242.4M', 'R201.6M', 'R40.8M', 'R2.53M', '22.8']) {
      assert.ok(!deck.includes(figure), `orphaned outreach figure: "${figure}"`);
    }
  });

  test('the PPTX export no longer emits the slide', () => {
    assert.ok(
      !deck.includes("'OUTREACH AT SCALE'"),
      'downloadPPTX() still emits an outreach slide'
    );
    assert.ok(
      !deck.includes('slideOutreach'),
      'the slideOutreach PPTX builder is still present'
    );
  });
});

describe('deck structure is consistent at 20 slides', () => {
  test('counters, nav dots and PPTX slides are all 20', () => {
    const counters = deck.match(/\d\d \/ 20/g) || [];
    assert.equal(counters.length, 20, `expected 20 counters, found ${counters.length}`);
    assert.ok(deck.includes('20 / 20'), 'final counter 20 / 20 missing');

    const navDots = deck.match(/class="nav-dot(?: active)?" data-slide=/g) || [];
    assert.equal(navDots.length, 20, `expected 20 nav dots, found ${navDots.length}`);

    const addSlide = deck.match(/pptx\.addSlide\(\)/g) || [];
    assert.equal(addSlide.length, 20, `expected 20 PPTX slides, found ${addSlide.length}`);
  });

  test('counters run 01 through 20 with no gap or duplicate', () => {
    const seen = (deck.match(/(\d\d) \/ 20/g) || []).map((c) => c.slice(0, 2));
    const expected = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'));
    assert.deepEqual(seen.slice().sort(), expected.slice().sort());
  });

  test('no stale "/ 21" counters left behind', () => {
    assert.ok(!/\d\d \/ 21/.test(deck), 'a slide counter still reads "/ 21"');
  });

  test('the surviving business-case slides are untouched', () => {
    // Removing slide 12 must not disturb the four slides added alongside it.
    for (const id of [
      'slide-pricing',
      'slide-unit-economics',
      'slide-provider-economics',
      'slide-capability-case',
    ]) {
      assert.ok(deck.includes(`id="${id}"`), `collateral damage: ${id} is missing`);
    }
  });

  test('capability slide no longer cites the removed run-rate as its basis', () => {
    // The capability values were expressed "at the exit run-rate of the outreach
    // plan". With that slide gone the phrase points at nothing, so the basis has
    // to be stated on its own terms.
    const start = deck.indexOf('id="slide-capability-case"');
    const slide = deck.slice(deck.lastIndexOf('<section', start), deck.indexOf('</section>', start));
    assert.ok(
      !slide.includes('outreach plan'),
      'capability slide still refers to the deleted outreach plan slide'
    );
  });
});
