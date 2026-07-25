/**
 * Investor deck content integrity tests.
 *
 * The /investor-deck route is a single self-contained file (investor-deck.html)
 * whose slide HTML and client-side PPTX generator both hold the commercial
 * figures. These tests lock in the corrected market-sizing / Phase-1 figures
 * (White Paper V6.0) and guarantee no superseded figure survives on either the
 * page or in the generated PPTX.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const deck = fs.readFileSync(
  path.join(__dirname, '..', '..', 'investor-deck.html'),
  'utf8'
);

test('superseded market/exit/team figures are gone', () => {
  const banned = [
    'R240 billion',        // heading market claim
    'Total Addressable',   // removed TAM label (R240B as context is still allowed)
    'R85B',
    'zero dominant',
    'R2.2B',
    'R3.5B',
    'Ex-Discovery',
    'Ex-Amazon',
    'Ex-Capitec',
    'Ex-TransUnion',
    '01 / 15', // old slide-counter denominator
  ];
  for (const term of banned) {
    assert.ok(!deck.includes(term), `superseded content still present: "${term}"`);
  }
});

test('corrected slide 03 market ladder is present', () => {
  for (const term of ['R25', '50B', 'R4.8', 'R150', 'R37 billion', 'Credit-Addressable', 'The Elective Four']) {
    assert.ok(deck.includes(term), `missing corrected slide-03 content: "${term}"`);
  }
});

test('slide 08 risk figures are recomputed and consistent (PD 1.4%, net loss 0.63%)', () => {
  assert.ok(deck.includes('0.63%'), 'net loss rate 0.63% missing');
  // PD × LGD = net loss: 1.4% × 45% = 0.63%
  assert.ok(deck.includes('1.4%'), 'Phase 1 PD 1.4% missing');
});

test('slide 12 reframed as operating model, no filled bench', () => {
  for (const term of ['Operating Model', 'The team this round builds', 'Appointed', 'Seed hire']) {
    assert.ok(deck.includes(term), `missing operating-model content: "${term}"`);
  }
});

test('slide 13 exit range corrected', () => {
  assert.ok(deck.includes('R300M') && deck.includes('R2.5B'), 'corrected exit range missing');
});

test('Phase 1 / Phase 2 sequencing content exists', () => {
  for (const term of ['Phase 1', 'Phase 2', 'wedge, not a ceiling']) {
    assert.ok(deck.includes(term), `missing sequencing content: "${term}"`);
  }
});

test('slide counter, nav dots and PPTX slide count are all 16', () => {
  const counters = deck.match(/\d\d \/ 16/g) || [];
  assert.strictEqual(counters.length, 16, `expected 16 "NN / 16" counters, found ${counters.length}`);
  assert.ok(deck.includes('16 / 16'), 'final counter 16 / 16 missing');

  const navDots = deck.match(/class="nav-dot(?: active)?" data-slide=/g) || [];
  assert.strictEqual(navDots.length, 16, `expected 16 nav dots, found ${navDots.length}`);

  const addSlide = deck.match(/pptx\.addSlide\(\)/g) || [];
  assert.strictEqual(addSlide.length, 16, `expected 16 PPTX slides, found ${addSlide.length}`);
});

test('no prohibited customer-facing lending vocabulary introduced', () => {
  // Product framing must stay payment-facilitation, not credit provision.
  for (const term of ['borrower', 'loan book', 'originations', 'underwriting']) {
    assert.ok(!deck.toLowerCase().includes(term), `prohibited term present: "${term}"`);
  }
});
