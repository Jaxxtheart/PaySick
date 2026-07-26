/**
 * Unit Tests — Outreach fit scorer (§6.2)
 * Node.js built-in test runner. No DB, no network.
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Run: node --test tests/unit/outreach-scoring.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { fitScore } = require('../../backend/src/services/outreach/scoring.service');

describe('fitScore', () => {
  test('a top-tier aesthetics lead in a target metro with website+email scores high', () => {
    const s = fitScore({
      vertical: 'aesthetics',
      metro: 'Johannesburg',
      website: 'https://clinic.example',
      email: 'hello@clinic.example',
      rating: 5,
      ratings_count: 200,
    });
    // 40 (sector) + 20 (geo) + 15 (website) + 15 (email) + 5 (rating) + 5 (count) = 100
    assert.equal(s, 100);
  });

  test('an unknown vertical uses the 0.3 fallback weight', () => {
    const s = fitScore({ vertical: 'chiropractic', metro: 'Nowhere' });
    // 0.3*40 = 12 (sector) + 5 (non-target geo) + 0 + 0 = 17
    assert.equal(s, 17);
  });

  test('non-target metro scores 5 for geo, target metro scores 20', () => {
    const base = { vertical: 'dental' };
    const target = fitScore({ ...base, metro: 'Cape Town' });
    const nonTarget = fitScore({ ...base, metro: 'Bloemfontein' });
    assert.equal(target - nonTarget, 15);
  });

  test('missing website and email contribute nothing', () => {
    const withChannels = fitScore({ vertical: 'aesthetics', metro: 'Durban', website: 'x', email: 'y' });
    const without = fitScore({ vertical: 'aesthetics', metro: 'Durban' });
    assert.equal(withChannels - without, 30);
  });

  test('rating contributes only when both rating and ratings_count are present', () => {
    const withRatingOnly = fitScore({ vertical: 'orthopaedics', metro: 'Pretoria', rating: 4 });
    const withNeither = fitScore({ vertical: 'orthopaedics', metro: 'Pretoria' });
    assert.equal(withRatingOnly, withNeither);
  });

  test('score is always an integer in the 0..100 range', () => {
    const s = fitScore({ vertical: 'general_surgery', metro: 'Somewhere', rating: 3.2, ratings_count: 17 });
    assert.equal(Number.isInteger(s), true);
    assert.ok(s >= 0 && s <= 100);
  });
});
