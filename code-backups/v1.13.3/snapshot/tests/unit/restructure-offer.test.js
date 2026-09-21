'use strict';

/**
 * Unit Tests — Restructure Offers
 *
 * Builds a restructured payment schedule for a delinquent case and
 * enforces the hard rule (shared with outcome-gate.service.js /
 * OutcomeGateService): no restructuring may increase total cost to the
 * patient by more than 25%.
 *
 * Written BEFORE implementation (test-first workflow, CLAUDE.md).
 * Run: node --test tests/unit/restructure-offer.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRestructureOffer,
  MAX_RESTRUCTURE_COST_INCREASE
} = require('../../backend/src/services/restructure-offer.service');

const {
  MAX_RESTRUCTURE_COST_INCREASE: SHARED_POLICY_CAP
} = require('../../backend/src/utils/restructure-policy');

describe('restructure-offer.service — shares the 25% cap with the restructure policy used post-disbursement', () => {
  test('re-exports the same constant value OutcomeGateService enforces post-disbursement', () => {
    assert.equal(MAX_RESTRUCTURE_COST_INCREASE, SHARED_POLICY_CAP);
    assert.equal(MAX_RESTRUCTURE_COST_INCREASE, 0.25);
  });
});

describe('buildRestructureOffer — offer construction', () => {
  test('spreads the remaining balance evenly across the new term', () => {
    const offer = buildRestructureOffer({
      originalOutstandingCents: 30000,
      remainingBalanceCents: 30000,
      newTermMonths: 3
    });
    assert.equal(offer.newMonthlyAmountCents, 10000);
    assert.equal(offer.newTermMonths, 3);
  });

  test('rounds the monthly amount up so the plan never under-collects', () => {
    const offer = buildRestructureOffer({
      originalOutstandingCents: 10000,
      remainingBalanceCents: 10000,
      newTermMonths: 3
    });
    // 10000 / 3 = 3333.33 -> must round up to 3334, never down
    assert.equal(offer.newMonthlyAmountCents, 3334);
  });

  test('a balance identical to the original outstanding amount has 0% cost increase and is approvable', () => {
    const offer = buildRestructureOffer({
      originalOutstandingCents: 8500,
      remainingBalanceCents: 8500,
      newTermMonths: 4
    });
    assert.equal(offer.costIncreasePct, 0);
    assert.equal(offer.withinCap, true);
    assert.equal(offer.approvable, true);
  });

  test('a cost increase under 25% (accrued late fees) is approvable', () => {
    const offer = buildRestructureOffer({
      originalOutstandingCents: 8500,
      remainingBalanceCents: 9500, // ~11.8% increase
      newTermMonths: 4
    });
    assert.ok(offer.costIncreasePct < MAX_RESTRUCTURE_COST_INCREASE);
    assert.equal(offer.withinCap, true);
    assert.equal(offer.approvable, true);
  });

  test('a cost increase over 25% is rejected as not approvable', () => {
    const offer = buildRestructureOffer({
      originalOutstandingCents: 8500,
      remainingBalanceCents: 12000, // ~41% increase
      newTermMonths: 4
    });
    assert.ok(offer.costIncreasePct > MAX_RESTRUCTURE_COST_INCREASE);
    assert.equal(offer.withinCap, false);
    assert.equal(offer.approvable, false);
  });

  test('a cost increase of exactly 25% is at the boundary and approvable', () => {
    const offer = buildRestructureOffer({
      originalOutstandingCents: 10000,
      remainingBalanceCents: 12500, // exactly 25%
      newTermMonths: 5
    });
    assert.equal(offer.costIncreasePct, 0.25);
    assert.equal(offer.withinCap, true);
  });

  test('rejects a non-positive remainingBalanceCents', () => {
    assert.throws(() => buildRestructureOffer({
      originalOutstandingCents: 8500,
      remainingBalanceCents: 0,
      newTermMonths: 3
    }));
  });

  test('rejects a non-positive newTermMonths', () => {
    assert.throws(() => buildRestructureOffer({
      originalOutstandingCents: 8500,
      remainingBalanceCents: 8500,
      newTermMonths: 0
    }));
  });
});
