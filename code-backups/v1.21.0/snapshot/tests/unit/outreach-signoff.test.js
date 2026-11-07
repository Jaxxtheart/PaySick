/**
 * Unit Tests — Outreach message sign-off normalisation
 * Node.js built-in test runner. No DB, no network.
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Every outreach message must be signed off exactly "Best, The PaySick Team",
 * enforced in code (not left to the LLM). Any personal/other sign-off the model
 * produces is replaced; a message with no sign-off gets one appended; a message
 * already correctly signed is left unchanged (no duplication).
 *
 * Run: node --test tests/unit/outreach-signoff.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSignoff, SIGNOFF } = require('../../backend/src/services/outreach/signoff');

describe('normalizeSignoff', () => {
  test('appends the team sign-off when none is present', () => {
    const out = normalizeSignoff('Hi Dr Smith,\n\nWe pay you in full within 24 hours.');
    assert.ok(out.endsWith(SIGNOFF), 'ends with the team sign-off');
    assert.ok(out.includes('pay you in full'), 'body preserved');
  });

  test('replaces a personal sign-off (founder name) with the team sign-off', () => {
    const out = normalizeSignoff('Body copy here.\n\nBest,\nMosiuwa');
    assert.equal(out, 'Body copy here.\n\nBest,\nThe PaySick Team');
  });

  test('replaces "Regards, <Full Name>" too', () => {
    const out = normalizeSignoff('Body copy here.\n\nRegards,\nMosiuwa Tshabalala');
    assert.equal(out, 'Body copy here.\n\nBest,\nThe PaySick Team');
  });

  test('does not duplicate when already correctly signed', () => {
    const already = 'Body copy here.\n\nBest,\nThe PaySick Team';
    assert.equal(normalizeSignoff(already), already);
  });

  test('does not falsely strip a mid-sentence closing word', () => {
    const out = normalizeSignoff('We want the best for your patients.\n\nEvery booking counts.');
    assert.ok(out.includes('We want the best for your patients.'), 'body kept');
    assert.ok(out.includes('Every booking counts.'), 'second line kept');
    assert.ok(out.endsWith(SIGNOFF));
  });

  test('handles empty / non-string input by returning just the sign-off', () => {
    assert.equal(normalizeSignoff(''), SIGNOFF);
    assert.equal(normalizeSignoff(null), SIGNOFF);
    assert.equal(normalizeSignoff(undefined), SIGNOFF);
  });

  test('SIGNOFF is exactly "Best, The PaySick Team"', () => {
    assert.equal(SIGNOFF.replace(/\n/g, ' '), 'Best, The PaySick Team');
  });
});
