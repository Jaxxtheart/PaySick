/**
 * Investor deck submission-readiness tests.
 *
 * The deck is exported to PDF for investor submissions, so every claim must be
 * internally consistent and match what the platform actually does. These tests
 * lock in the fixes from the pre-submission review: sequential slide counters,
 * no claims contradicted elsewhere in the deck or by the shipped product, and
 * no data-source integrations presented as live when they are still pending.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const deck = fs.readFileSync(
  path.join(__dirname, '..', '..', 'investor-deck.html'),
  'utf8'
);

test('slide counters run 01 to 15 in order with no duplicates', () => {
  const counters = [...deck.matchAll(/<span class="slide-number">(\d\d) \/ 15<\/span>/g)].map(m => m[1]);
  const expected = Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0'));
  assert.deepStrictEqual(counters, expected);
});

test('no 60-second approval claim (real flow can route to human review)', () => {
  for (const term of ['60-Second', '60 Second', 'Applies in 60s']) {
    assert.ok(!deck.includes(term), `unsupported speed claim present: "${term}"`);
  }
});

test('provider payout copy matches the two-stage 80/20 payout on the Shield slide', () => {
  for (const term of ['24hrs', 'within 24 hours', 'in 24 hours', 'Provider Paid Upfront', 'Providers get paid upfront']) {
    assert.ok(!deck.includes(term), `payout claim contradicts 80/20 architecture: "${term}"`);
  }
});

test('the ask does not describe building an MVP that is already live', () => {
  assert.ok(!deck.includes('build the MVP'), 'ask still says the round builds the MVP');
});

test('market sizing bullet does not compare R240B spend to a larger R259.3B', () => {
  assert.ok(!deck.includes('R240B, but'), 'self-contradictory R240B vs R259.3B comparison present');
  assert.ok(deck.includes('R259.3B'), 'scheme-settled benefits figure missing');
});

test('pending data integrations are not presented as live proprietary sources', () => {
  for (const term of ['MedCredits', 'Discovery, Bonitas, Momentum', 'Employer garnish']) {
    assert.ok(!deck.includes(term), `pending or unsupported data source named: "${term}"`);
  }
});

test('expansion story is consistent with the UK-first roadmap', () => {
  assert.ok(!deck.includes('$200B+ continental'), 'superseded Africa-expansion bullet still present');
});

test('ask is a $250,000 request with dollar use of funds and no deal terms', () => {
  for (const term of ['$250,000', '$100,000', '$75,000', '$50,000', '$25,000']) {
    assert.ok(deck.includes(term), `ask content missing: "${term}"`);
  }
  // Funding type (equity vs grant) is not yet confirmed, so no valuation terms.
  for (const term of ['Pre-Money', '$24M', 'Equity Offered', 'Equity: 25%']) {
    assert.ok(!deck.includes(term), `deal term present before funding type is confirmed: "${term}"`);
  }
});

test('15-slide cut: Moats table and Medical Risk Score slides are dropped', () => {
  for (const term of ['Sustainable competitive', 'competitors-table', 'The <span class="highlight">Medical Risk Score</span>', "'The Medical Risk Score'"]) {
    assert.ok(!deck.includes(term), `dropped slide content still present: "${term}"`);
  }
  // Provider scoring, the Medical Risk Score's one distinct idea, moves to the risk slide.
  assert.ok(deck.includes('Provider risk scoring'), 'provider risk scoring line missing from risk slide');
});
