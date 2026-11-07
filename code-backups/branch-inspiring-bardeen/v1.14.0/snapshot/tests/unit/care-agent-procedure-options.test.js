'use strict';

/**
 * Unit Tests — Finite procedure list exposed as visible choices
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Follow-up to the treatment-question infinite-loop bug
 * (care-agent-treatment-loop-bug.test.js): the raw-text fallback there
 * stops the loop, but the actual product fix a real user asked for is
 * more direct — "if it's a finite list then present all the options for
 * the customer to choose from, don't leave it open ended and assume
 * they'll only pick from the invisible list." The set of procedures
 * care-agent-nlp.service.js recognizes IS finite (a fixed dictionary),
 * so it should be shown, not guessed at blind.
 *
 * This restructures the keyword dictionary into named categories with a
 * human-readable label each (PROCEDURE_CATEGORIES), derives the existing
 * phrase->category PROCEDURE_TYPE_KEYWORDS map from it so extraction
 * behavior and prior tests are unaffected, and adds a couple of keyword
 * synonyms ("aesthetic", "nose job") the reported bug actually hit.
 *
 * Run: node --test tests/unit/care-agent-procedure-options.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCareRequest,
  PROCEDURE_TYPE_KEYWORDS,
  PROCEDURE_CATEGORIES,
} = require('../../backend/src/services/care-agent-nlp.service');

describe('PROCEDURE_CATEGORIES — the finite list the UI can show as choices', () => {
  test('is a non-empty array of {id, label} the frontend can render as chips', () => {
    assert.ok(Array.isArray(PROCEDURE_CATEGORIES));
    assert.ok(PROCEDURE_CATEGORIES.length > 0);
    for (const category of PROCEDURE_CATEGORIES) {
      assert.equal(typeof category.id, 'string');
      assert.equal(typeof category.label, 'string');
      assert.ok(category.label.length > 0);
    }
  });

  test('every category id is unique', () => {
    const ids = PROCEDURE_CATEGORIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('every category id referenced by PROCEDURE_TYPE_KEYWORDS is a real category', () => {
    const categoryIds = new Set(PROCEDURE_CATEGORIES.map((c) => c.id));
    for (const id of Object.values(PROCEDURE_TYPE_KEYWORDS)) {
      assert.ok(categoryIds.has(id), `PROCEDURE_TYPE_KEYWORDS references unknown category "${id}"`);
    }
  });

  test('clicking a category label is itself recognized by extraction with high confidence', () => {
    // The whole point: a label good enough to show as a tappable chip must
    // also be good enough that clicking it (sending the label as the
    // message) is unambiguously understood — no round-trip surprise.
    for (const category of PROCEDURE_CATEGORIES) {
      const extracted = extractCareRequest(category.label);
      assert.equal(
        extracted.procedureTypeGuess,
        category.id,
        `clicking "${category.label}" must resolve to category "${category.id}", got "${extracted.procedureTypeGuess}"`
      );
      assert.equal(extracted.confidence.procedureTypeGuess, 'high');
    }
  });
});

describe('Real-world phrasing from the reported bug is now recognized', () => {
  test('"aesthetic" resolves to the cosmetic category', () => {
    const extracted = extractCareRequest("It's an aesthetic thing");
    assert.equal(extracted.procedureTypeGuess, 'cosmetic');
  });

  test('"nose job" resolves to the cosmetic category', () => {
    const extracted = extractCareRequest("It's for a nose job");
    assert.equal(extracted.procedureTypeGuess, 'cosmetic');
  });
});

describe('Existing extraction behavior is unaffected by the restructure', () => {
  test('"dental implants" still resolves to dental_implants with high confidence (regression check)', () => {
    const extracted = extractCareRequest('I need two dental implants done.');
    assert.equal(extracted.procedureTypeGuess, 'dental_implants');
    assert.equal(extracted.confidence.procedureTypeGuess, 'high');
  });

  test('PROCEDURE_TYPE_KEYWORDS is still exported for backward compatibility', () => {
    assert.ok(PROCEDURE_TYPE_KEYWORDS['dental implants']);
  });
});
