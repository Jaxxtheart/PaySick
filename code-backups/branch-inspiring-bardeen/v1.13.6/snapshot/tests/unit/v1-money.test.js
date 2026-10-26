/**
 * Unit tests — monetary arithmetic (cents-only).
 *
 * CLAUDE.md: All money is stored and calculated in cents as integers.
 * Never use floating point for monetary values.
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { toCents, toRands, formatRands, calculateMdr, affordabilityRatio } =
  require('../../backend/src/utils/money');

describe('toCents', () => {
  test('converts rand to integer cents', () => {
    assert.equal(toCents(1), 100);
    assert.equal(toCents(123.45), 12345);
  });

  test('rounds to nearest cent', () => {
    assert.equal(toCents(1.235), 124);
    assert.equal(toCents(1.234), 123);
  });
});

describe('toRands', () => {
  test('converts cents to rand value', () => {
    assert.equal(toRands(12345), 123.45);
    assert.equal(toRands(100), 1);
  });
});

describe('formatRands', () => {
  test('returns R-prefixed string with 2 decimals', () => {
    const out = formatRands(123456);
    assert.ok(out.startsWith('R'));
    // en-ZA: "R1 234,56" — assert two-decimal cents portion is present
    assert.match(out, /[,.]56$/);
  });
});

describe('calculateMdr', () => {
  test('default 5% MDR rounded to integer cents', () => {
    assert.equal(calculateMdr(100000), 5000);
  });

  test('custom MDR percent', () => {
    assert.equal(calculateMdr(100000, 7.5), 7500);
  });

  test('result is always an integer', () => {
    assert.ok(Number.isInteger(calculateMdr(123457, 5)));
  });
});

describe('affordabilityRatio', () => {
  test('returns instalment / income', () => {
    const r = affordabilityRatio(100000, 500000);
    assert.ok(Math.abs(r - 0.2) < 1e-9);
  });
});
