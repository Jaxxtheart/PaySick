/**
 * CARE AGENT — LIGHTWEIGHT EMBEDDING SIMILARITY (test-first)
 *
 * Written BEFORE the implementation, per CLAUDE.md's test-first workflow.
 * Proves out the "lightweight embedding similarity" upgrade the user asked
 * for after being shown that the previous procedure-matching was pure
 * exact-substring dictionary lookup with a hardcoded 'high'/'low' label,
 * not anything probabilistic.
 *
 * What "lightweight embedding" means here, concretely: every category
 * label/keyword set is turned into a character-trigram count vector
 * (precomputed once, at module load -- this is the "precompute embeddings
 * for the category labels" step). An incoming message is turned into the
 * same kind of vector, and matched by cosine similarity rather than
 * substring containment. This is a real vector-space technique (bag-of-
 * character-n-grams, the pre-neural ancestor of word2vec/fastText) that
 * needs no API key, no npm package, and no pretrained model file -- all
 * of which are unavailable in this sandbox (see RELEASE_NOTES.md for why
 * a live LLM/embeddings-API call was not the path taken here). It
 * generalizes to unseen phrasing that shares sub-word structure with a
 * known category ("nose procedure", "rhinoplastey") in a way exact
 * substring matching never could, and produces an actual numeric score
 * instead of a hardcoded boolean label.
 */

'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const {
  extractCareRequest,
  buildTrigramVector,
  cosineSimilarity,
  findBestCategoryMatch,
  CATEGORY_EMBEDDINGS,
} = require('../../backend/src/services/care-agent-nlp.service');

test('buildTrigramVector: identical strings are maximally similar', () => {
  const a = buildTrigramVector('rhinoplasty');
  const b = buildTrigramVector('rhinoplasty');
  assert.strictEqual(cosineSimilarity(a, b), 1);
});

test('buildTrigramVector: completely disjoint strings score zero similarity', () => {
  const a = buildTrigramVector('xyz123');
  const b = buildTrigramVector('qrp987');
  assert.strictEqual(cosineSimilarity(a, b), 0);
});

test('cosineSimilarity: empty vectors never divide by zero / never NaN', () => {
  const empty = buildTrigramVector('');
  const nonEmpty = buildTrigramVector('dental implants');
  assert.strictEqual(cosineSimilarity(empty, nonEmpty), 0);
  assert.strictEqual(cosineSimilarity(empty, empty), 0);
});

test('CATEGORY_EMBEDDINGS: one precomputed vector per procedure category', () => {
  assert.ok(Array.isArray(CATEGORY_EMBEDDINGS));
  assert.ok(CATEGORY_EMBEDDINGS.length >= 10);
  for (const entry of CATEGORY_EMBEDDINGS) {
    assert.ok(entry.id, 'each entry carries a category id');
    assert.ok(entry.label, 'each entry carries a category label');
    assert.ok(entry.vector instanceof Map, 'each entry carries a precomputed vector');
    assert.ok(entry.vector.size > 0);
  }
});

test('findBestCategoryMatch: recognizes phrasing that shares no exact keyword substring, via similarity', () => {
  // "eye laser surgery" contains neither "lasik" nor any other dictionary
  // phrase as a substring -- the old exact-match engine found nothing here.
  const match = findBestCategoryMatch('eye laser surgery');
  assert.ok(match, 'expected a fuzzy match to be found');
  assert.strictEqual(match.id, 'lasik');
  assert.ok(match.score > 0.5, `expected a strong similarity score, got ${match.score}`);
});

test('findBestCategoryMatch: recognizes a near-miss variant ("nose procedure") the exact dictionary never had', () => {
  const match = findBestCategoryMatch('nose procedure');
  assert.ok(match, 'expected a fuzzy match to be found');
  assert.strictEqual(match.id, 'cosmetic');
  assert.ok(match.score > 0.2 && match.score < 0.5, `expected a moderate similarity score, got ${match.score}`);
});

test('findBestCategoryMatch: tolerates a typo that breaks substring matching entirely', () => {
  const match = findBestCategoryMatch('rhinoplastey');
  assert.ok(match, 'expected a fuzzy match despite the typo');
  assert.strictEqual(match.id, 'cosmetic');
});

test('findBestCategoryMatch: unrelated free text yields no match (score below the acceptance threshold)', () => {
  const match = findBestCategoryMatch('a growth removed from my arm');
  assert.strictEqual(match, null);
});

test('findBestCategoryMatch: near-empty / generic text yields no match', () => {
  assert.strictEqual(findBestCategoryMatch('help me pay'), null);
  assert.strictEqual(findBestCategoryMatch(''), null);
});

test('extractCareRequest: exact keyword match still wins outright, with a perfect similarity score', () => {
  const result = extractCareRequest('I need dental implants please');
  assert.strictEqual(result.procedureTypeGuess, 'dental_implants');
  assert.strictEqual(result.confidence.procedureTypeGuess, 'high');
  assert.strictEqual(result.procedureTypeSimilarity, 1);
});

test('extractCareRequest: falls back to similarity matching when no exact phrase is present', () => {
  const result = extractCareRequest("It's for a nose procedure, not sure what it's called");
  assert.strictEqual(result.procedureTypeGuess, 'cosmetic');
  assert.strictEqual(result.treatmentDescription, 'Cosmetic / Aesthetic Procedure');
  assert.ok(
    result.procedureTypeSimilarity > 0 && result.procedureTypeSimilarity < 1,
    `expected a genuine, non-boolean similarity score, got ${result.procedureTypeSimilarity}`
  );
  // A moderate score stays flagged as low confidence -- "never hide
  // uncertainty" -- even though a guess was still made available.
  assert.strictEqual(result.confidence.procedureTypeGuess, 'low');
});

test('extractCareRequest: a strong fuzzy match is surfaced as high confidence, not just exact matches', () => {
  const result = extractCareRequest('I want eye laser surgery done');
  assert.strictEqual(result.procedureTypeGuess, 'lasik');
  assert.strictEqual(result.confidence.procedureTypeGuess, 'high');
  assert.ok(result.procedureTypeSimilarity > 0.5 && result.procedureTypeSimilarity < 1);
});

test('extractCareRequest: truly unrecognized text still yields no guess -- never invents one', () => {
  const result = extractCareRequest('a growth removed from my arm');
  assert.strictEqual(result.procedureTypeGuess, null);
  assert.strictEqual(result.treatmentDescription, null);
  assert.strictEqual(result.confidence.procedureTypeGuess, 'low');
  assert.strictEqual(result.procedureTypeSimilarity, 0);
});

test('extractCareRequest: a chip-clicked category label always round-trips at similarity 1', () => {
  const { PROCEDURE_CATEGORIES } = require('../../backend/src/services/care-agent-nlp.service');
  for (const category of PROCEDURE_CATEGORIES) {
    const result = extractCareRequest(category.label);
    assert.strictEqual(result.procedureTypeGuess, category.id, `chip label "${category.label}" must round-trip`);
    assert.strictEqual(result.procedureTypeSimilarity, 1);
    assert.strictEqual(result.confidence.procedureTypeGuess, 'high');
  }
});
