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
    '01 / 17', // superseded 17-slide denominator
    '01 / 20', // superseded 20-slide denominator
    '01 / 21', // superseded 21-slide denominator
    // Pricing claims from the Business Model slide removed in v1.10.0. They
    // contradicted fee.service.js (5% provider fee, R0 patient). Guarded here
    // because the v1.10.0 replacement slides that carried these bans were
    // themselves removed in v1.12.0.
    'R1,850 (10%)',
    '2-4% arrangement fee',
    '40% of Revenue',
    '35% of Revenue',
    '25% of Revenue',
    'Target CAC: R320',
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
  for (const term of ['Phase 1', 'Phase 2', 'Trojan Horse']) {
    assert.ok(deck.includes(term), `missing sequencing content: "${term}"`);
  }
});

test('no em dashes anywhere in the deck (en dashes in ranges are allowed)', () => {
  assert.ok(!deck.includes('—'), 'em dash (—) present in deck copy');
});

test('slide 15 ask updated to $8M with recalculated valuation', () => {
  assert.ok(deck.includes('$8M') && deck.includes('$8 million'), 'ask amount not updated to $8M');
  assert.ok(deck.includes('$24M'), 'pre-money valuation not recalculated');
  assert.ok(!deck.includes('R25M') && !deck.includes('Raising R25 million'), 'superseded R25M ask still present');
});

test('slide 14 roadmap reflects UK expansion and 2027 shift', () => {
  assert.ok(deck.includes('UK Expansion'), 'UK Expansion milestone missing');
  assert.ok(!deck.includes('Africa Expansion') && !deck.includes('Kenya, Nigeria'), 'superseded Africa Expansion still present');
  assert.ok(deck.includes('Exit Potential (2027+)'), 'exit potential not shifted to 2027+');
});

// Slide count history: 16 -> 17 with the Shield™ slide (v1.9.0); 17 -> 21 with
// the five business-case slides (v1.10.0); 21 -> 20 when outreach-scale was
// deleted as factually wrong (v1.11.0); 20 -> 16 when the remaining four
// business-case slides were removed (v1.12.0), returning the deck to its
// pre-v1.10.0 length.
// See tests/unit/investor-deck-shield.test.js for the Shield slide's coverage,
// and tests/unit/investor-deck-business-slides-removed.test.js for the removal.
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
