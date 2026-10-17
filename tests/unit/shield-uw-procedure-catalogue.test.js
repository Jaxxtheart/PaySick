/**
 * Shield Underwriting — procedure catalogue.
 *
 * Maps the free-text procedure types used by the marketplace and v1 API onto
 * the MRS clinical-risk categories (the Elective Four + UNCLASSIFIED), and
 * channel urgency labels onto the engine's urgency scale.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { procedureCategoryFor, normaliseUrgency } = require('../../backend/src/shield/procedure-catalogue');

describe('procedure catalogue', () => {
  const cases = [
    ['dental_implants', 'DENTISTRY'], ['dental_veneers', 'DENTISTRY'], ['orthodontics', 'DENTISTRY'],
    ['lasik', 'OPHTHALMOLOGY'], ['cataract_surgery', 'OPHTHALMOLOGY'],
    ['cosmetic', 'AESTHETICS'], ['rhinoplasty', 'AESTHETICS'], ['aesthetic_botox', 'AESTHETICS'],
    ['fertility', 'FERTILITY'], ['ivf_cycle', 'FERTILITY'],
    ['knee_replacement', 'UNCLASSIFIED'], [null, 'UNCLASSIFIED'], ['', 'UNCLASSIFIED']
  ];
  for (const [type, cat] of cases) {
    test(`${type} → ${cat}`, () => assert.equal(procedureCategoryFor(type), cat));
  }

  test('urgency labels from every channel map onto ELECTIVE / SEMI_URGENT / URGENT', () => {
    assert.equal(normaliseUrgency('elective'), 'ELECTIVE');
    assert.equal(normaliseUrgency('planned'), 'ELECTIVE');
    assert.equal(normaliseUrgency('SEMI_URGENT'), 'SEMI_URGENT');
    assert.equal(normaliseUrgency('urgent'), 'URGENT');
    assert.equal(normaliseUrgency(undefined), 'SEMI_URGENT');
  });
});
