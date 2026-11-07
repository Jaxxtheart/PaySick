/**
 * Unit tests — provider scoring (tier + status + cap + payout delay).
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateTier,
  calculateStatus,
  tierConfig
} = require('../../backend/src/services/provider-scoring.service');

describe('calculateTier', () => {
  test('NEW when application count < 20', () => {
    assert.equal(calculateTier(0.01, 10), 'NEW');
  });

  test('PREMIUM at pd <= 2% and >= 100 applications', () => {
    assert.equal(calculateTier(0.02, 100), 'PREMIUM');
  });

  test('ESTABLISHED at pd <= 3% and >= 50', () => {
    assert.equal(calculateTier(0.03, 60), 'ESTABLISHED');
  });

  test('DEVELOPING at pd <= 5% and >= 20', () => {
    assert.equal(calculateTier(0.05, 25), 'DEVELOPING');
  });

  test('falls back to NEW when pd is high', () => {
    assert.equal(calculateTier(0.07, 25), 'NEW');
  });
});

describe('calculateStatus', () => {
  test('SUSPENDS when pd >= 8%', () => {
    assert.equal(calculateStatus(0.08, 'ACTIVE'), 'SUSPENDED');
  });

  test('THROTTLES when pd >= 6%', () => {
    assert.equal(calculateStatus(0.06, 'ACTIVE'), 'THROTTLED');
  });

  test('restores ACTIVE when throttled provider recovers below 4%', () => {
    assert.equal(calculateStatus(0.03, 'THROTTLED'), 'ACTIVE');
  });

  test('keeps current status when no thresholds crossed', () => {
    assert.equal(calculateStatus(0.04, 'ACTIVE'), 'ACTIVE');
  });
});

describe('tierConfig', () => {
  test('caps and payout delays match spec', () => {
    assert.equal(tierConfig.NEW.perPatientCapCents, 1_000_000);
    assert.equal(tierConfig.NEW.payoutDelayDays, 5);
    assert.equal(tierConfig.DEVELOPING.perPatientCapCents, 2_500_000);
    assert.equal(tierConfig.DEVELOPING.payoutDelayDays, 3);
    assert.equal(tierConfig.ESTABLISHED.perPatientCapCents, 5_000_000);
    assert.equal(tierConfig.ESTABLISHED.payoutDelayDays, 2);
    assert.equal(tierConfig.PREMIUM.perPatientCapCents, 10_000_000);
    assert.equal(tierConfig.PREMIUM.payoutDelayDays, 1);
  });
});
