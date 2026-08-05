'use strict';

/**
 * Unit Tests — Investor deck business case, pricing and scale slides
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Background:
 *   The deck's business-model slide carried figures that the shipped platform
 *   contradicts. `backend/src/services/fee.service.js` charges providers a 5%
 *   service fee on settlement and charges patients nothing, yet the slide
 *   claimed a "2-4% arrangement fee" and a 10% blended take rate
 *   (R1,850 on an R18,500 arrangement). No slide showed what a single provider
 *   has to do to be profitable, and nothing tied the outreach agent's configured
 *   caps (backend/src/config/outreach.config.js) to a provider-acquisition rate.
 *
 * These tests pin four things:
 *   1. Pricing on the deck matches the pricing in fee.service.js.
 *   2. A per-arrangement contribution model exists and is internally consistent.
 *   3. Per-provider breakeven volume is stated explicitly.
 *   4. Capability values are stated at a common reference scale.
 *
 * The outreach-plan assertions that lived here were removed in v1.11.0 along
 * with the slide they covered: it claimed sending was blocked when over 40
 * emails had in fact been sent, and nothing in the code gates a send.
 *
 * Run: node --test tests/unit/investor-deck-business-case.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const deck = fs.readFileSync(path.join(REPO_ROOT, 'investor-deck.html'), 'utf8');
const feeService = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/services/fee.service.js'),
  'utf8'
);

/** Isolate one slide's markup so assertions cannot pass on a different slide. */
function slideById(id) {
  const start = deck.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `no slide with id="${id}" found`);
  const sectionStart = deck.lastIndexOf('<section', start);
  const sectionEnd = deck.indexOf('</section>', start);
  return deck.slice(sectionStart, sectionEnd);
}

// ─── 1. Pricing matches the shipped fee service ──────────────────────────────

describe('Pricing on the deck matches fee.service.js', () => {
  test('the four new business-case slides exist', () => {
    for (const id of [
      'slide-pricing',
      'slide-unit-economics',
      'slide-provider-economics',
      'slide-capability-case',
    ]) {
      assert.ok(deck.includes(`id="${id}"`), `missing slide: ${id}`);
    }
  });

  test('fee service still charges providers 5% and patients zero', () => {
    // Guards the assumption the deck slides are built on. If these rates move,
    // the deck must move with them.
    assert.match(feeService, /PROVIDER_SERVICE_FEE_PCT\s*=\s*0\.05/);
    assert.match(feeService, /PATIENT_LATE_FEE_PCT_PER_MONTH\s*=\s*0\.05/);
    assert.match(feeService, /PATIENT_BASE_INTEREST_RATE\s*=\s*0\.00/);
  });

  test('pricing slide states the 5% provider service fee', () => {
    const slide = slideById('slide-pricing');
    assert.ok(slide.includes('5%'), 'provider service fee rate missing');
    assert.match(slide, /service fee/i, 'service fee not named');
  });

  test('pricing slide states the patient pays nothing', () => {
    const slide = slideById('slide-pricing');
    assert.match(
      slide,
      /R0|zero/i,
      'patient-pays-nothing pricing not stated'
    );
  });

  test('pricing slide states the 2% marketplace placement fee', () => {
    const slide = slideById('slide-pricing');
    assert.ok(slide.includes('2%'), 'marketplace placement fee missing');
    assert.match(slide, /placement fee/i, 'placement fee not named');
  });

  test('pricing slide states the 5% per month late fee', () => {
    const slide = slideById('slide-pricing');
    assert.match(slide, /late fee/i, 'late fee not disclosed');
  });

  test('pricing slide states there is no provider subscription', () => {
    // Deliberate pricing decision: transaction-only, no seat or setup fee.
    const slide = slideById('slide-pricing');
    assert.match(slide, /no subscription/i, 'no-subscription stance missing');
  });

  test('superseded take-rate and fee claims are gone from the whole deck', () => {
    for (const term of [
      'R1,850 (10%)',
      '2-4% arrangement fee',
      '40% of Revenue',
      '35% of Revenue',
      '25% of Revenue',
      'Target CAC: R320',
    ]) {
      assert.ok(!deck.includes(term), `superseded pricing claim present: "${term}"`);
    }
  });
});

// ─── 2. Per-arrangement contribution model ──────────────────────────────────

describe('Unit economics per arrangement are stated and consistent', () => {
  test('gross revenue per arrangement is R1,147 at a 6.2% blended take', () => {
    // 5% x R18,500 = R925 provider service fee
    // 2% x R18,500 x 60% marketplace share = R222 placement fee
    // R925 + R222 = R1,147 -> 6.2% of R18,500
    const slide = slideById('slide-unit-economics');
    assert.ok(slide.includes('R925'), 'provider service fee rand value missing');
    assert.ok(slide.includes('R222'), 'placement fee rand value missing');
    assert.ok(slide.includes('R1,147'), 'gross revenue per arrangement missing');
    assert.ok(slide.includes('6.2%'), 'blended take rate missing');
  });

  test('the arithmetic on the slide actually adds up', () => {
    const AVERAGE_BILL = 18500;
    const serviceFee = AVERAGE_BILL * 0.05;
    const placementFee = AVERAGE_BILL * 0.02 * 0.6;
    assert.equal(serviceFee, 925);
    assert.equal(placementFee, 222);
    assert.equal(serviceFee + placementFee, 1147);
    assert.equal(
      ((serviceFee + placementFee) / AVERAGE_BILL * 100).toFixed(1),
      '6.2'
    );
  });

  test('cost to serve is broken out and nets to R1,009 contribution', () => {
    // R66 verification stack + R25 collection rails + R47 expected credit loss
    // on the 40% PaySick funds directly = R138. R1,147 - R138 = R1,009.
    const slide = slideById('slide-unit-economics');
    for (const value of ['R66', 'R25', 'R47', 'R1,009']) {
      assert.ok(slide.includes(value), `missing unit-economics line: ${value}`);
    }
    assert.equal(1147 - (66 + 25 + 47), 1009);
  });

  test('expected credit loss ties to the deck net loss rate of 0.63%', () => {
    // 0.63% x R18,500 x 40% direct-funded share = R46.62, carried as R47
    assert.equal(Math.round(0.0063 * 18500 * 0.4), 47);
    assert.ok(deck.includes('0.63%'), 'net loss rate missing from the deck');
  });
});

// ─── 3. Per-provider profitability ──────────────────────────────────────────

describe('Provider-level breakeven and scale are explicit', () => {
  test('slide names the volume a provider must do to cover year one', () => {
    // Year-one cost per provider at funded scale:
    //   R2,700 CAC + R4,200 onboarding + R5,400 servicing = R12,300
    //   R12,300 / R1,009 contribution = 12.2 -> 13 arrangements
    const slide = slideById('slide-provider-economics');
    assert.ok(slide.includes('13'), 'year-one breakeven volume missing');
    assert.match(slide, /breakeven|break even/i, 'breakeven not named');
    assert.equal(Math.ceil(12300 / 1009), 13);
  });

  test('steady-state breakeven of 6 arrangements a year is stated', () => {
    // After year one only the R5,400 servicing cost recurs.
    const slide = slideById('slide-provider-economics');
    assert.ok(slide.includes('6'), 'steady-state breakeven missing');
    assert.equal(Math.ceil(5400 / 1009), 6);
  });

  test('a sub-scale practice is shown losing money in year one', () => {
    // 1 arrangement a month = 12 x R1,009 = R12,108 vs R12,300 of cost.
    const slide = slideById('slide-provider-economics');
    assert.ok(slide.includes('R12,108'), 'sub-scale contribution missing');
    assert.equal(12 * 1009 - 12300, -192);
  });

  test('the target practice profile is quantified', () => {
    // 4 arrangements a month = 48/yr = R888,000 facilitated, R55,056 gross,
    // R48,432 contribution.
    const slide = slideById('slide-provider-economics');
    for (const value of ['R888,000', 'R55,056', 'R48,432']) {
      assert.ok(slide.includes(value), `missing target-profile figure: ${value}`);
    }
    assert.equal(48 * 18500, 888000);
    assert.equal(48 * 1147, 55056);
    assert.equal(48 * 1009, 48432);
  });

  test('payback and LTV:CAC are recomputed off the new contribution', () => {
    // Acquisition + onboarding = R6,900. Monthly net at 4/month =
    // 4 x R1,009 - R450 servicing = R3,586. R6,900 / R3,586 = 1.9 months.
    const slide = slideById('slide-provider-economics');
    assert.ok(slide.includes('1.9'), 'payback period missing');
    assert.ok(slide.includes('15.2x'), 'LTV:CAC missing');
    assert.equal((6900 / (4 * 1009 - 450)).toFixed(1), '1.9');
  });

  test('provider CAC is stated for both founder-led and funded scale', () => {
    const slide = slideById('slide-provider-economics');
    assert.ok(slide.includes('R4,800'), 'founder-led CAC missing');
    assert.ok(slide.includes('R2,700'), 'at-scale CAC missing');
  });
});

// ─── 4. Capability business case ────────────────────────────────────────────

describe('Each shipped capability carries a business case', () => {
  test('the capability slide names the modules that actually ship', () => {
    const slide = slideById('slide-capability-case');
    for (const capability of [
      'Shield',
      'Marketplace',
      'DebiCheck',
      'Circuit',
      'Outreach',
    ]) {
      assert.match(
        slide,
        new RegExp(capability, 'i'),
        `capability not covered: ${capability}`
      );
    }
  });

  test('every capability row carries a rand or percentage figure', () => {
    const slide = slideById('slide-capability-case');
    const figures = slide.match(/R[\d,.]+[MK]?|\d+(\.\d+)?%/g) || [];
    assert.ok(
      figures.length >= 8,
      `capability slide has only ${figures.length} quantified claims`
    );
  });

  test('marketplace capital relief is quantified at exit run-rate', () => {
    // 60% of R242M facilitated volume sits on partner balance sheets.
    const slide = slideById('slide-capability-case');
    assert.ok(slide.includes('R145M'), 'capital relief figure missing');
    assert.equal(Math.round(242.4 * 0.6), 145);
  });

  test('the v1 API surface is presented as a distribution channel', () => {
    const slide = slideById('slide-capability-case');
    assert.match(slide, /api/i, 'v1 API surface not covered');
  });
});

// ─── 5. Structural integrity after the additions ────────────────────────────

describe('Deck structure survives the four new slides', () => {
  test('counters, nav dots and PPTX slides are all 20', () => {
    const counters = deck.match(/\d\d \/ 20/g) || [];
    assert.equal(counters.length, 20, `expected 20 counters, found ${counters.length}`);
    assert.ok(deck.includes('20 / 20'), 'final counter 20 / 20 missing');

    const navDots = deck.match(/class="nav-dot(?: active)?" data-slide=/g) || [];
    assert.equal(navDots.length, 20, `expected 20 nav dots, found ${navDots.length}`);

    const addSlide = deck.match(/pptx\.addSlide\(\)/g) || [];
    assert.equal(addSlide.length, 20, `expected 20 PPTX slides, found ${addSlide.length}`);
  });

  test('slide counters run 01 through 20 with no gaps or duplicates', () => {
    // The pre-existing deck skipped 12 and printed 13 twice.
    const seen = (deck.match(/(\d\d) \/ 20/g) || []).map((c) => c.slice(0, 2));
    const expected = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'));
    assert.deepEqual(seen.slice().sort(), expected.slice().sort());
  });

  test('no stale "/ 17" or "/ 21" counters left behind', () => {
    assert.ok(!/\d\d \/ 17/.test(deck), 'a slide counter still reads "/ 17"');
    assert.ok(!/\d\d \/ 21/.test(deck), 'a slide counter still reads "/ 21"');
  });

  test('no em dashes introduced by the new slides', () => {
    assert.ok(!deck.includes('—'), 'em dash present in deck copy');
  });

  test('no prohibited lending vocabulary in the new slides', () => {
    for (const term of ['borrower', 'loan book', 'originations', 'underwriting']) {
      assert.ok(
        !deck.toLowerCase().includes(term),
        `prohibited term present: "${term}"`
      );
    }
  });

  test('the new slides are exported to PPTX', () => {
    for (const marker of ['PRICING', 'UNIT ECONOMICS', 'PROVIDER ECONOMICS', 'CAPABILITIES']) {
      assert.ok(
        deck.includes(`'${marker}'`),
        `downloadPPTX() does not emit a ${marker} slide`
      );
    }
  });
});
