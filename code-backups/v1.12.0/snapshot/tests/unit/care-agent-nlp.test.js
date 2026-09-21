'use strict';

/**
 * Unit Tests — Care Agent NLP-lite extraction
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * This is a deterministic, rule-based extraction engine — regex + keyword
 * matching, NOT a call to an external LLM (none is wired into this repo).
 * Per the "never hide uncertainty" principle, every extracted field must
 * carry a confidence flag, and fields the engine could not find must show
 * up as missing rather than be silently guessed.
 *
 * Run: node --test tests/unit/care-agent-nlp.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCareRequest,
  detectIntent,
  PROCEDURE_TYPE_KEYWORDS
} = require('../../backend/src/services/care-agent-nlp.service');

describe('extractCareRequest — quoted amount', () => {
  test('extracts a Rand amount with high confidence', () => {
    const result = extractCareRequest('My dentist quoted R48,000 for the work.');
    assert.equal(result.quotedAmountCents, 4800000);
    assert.equal(result.confidence.quotedAmountCents, 'high');
  });

  test('picks the largest amount when several are mentioned', () => {
    const result = extractCareRequest('The deposit is R5,000 but the total quote is R48,000.');
    assert.equal(result.quotedAmountCents, 4800000);
  });

  test('handles amounts without a decimal component', () => {
    const result = extractCareRequest('R12500 was the invoice total.');
    assert.equal(result.quotedAmountCents, 1250000);
  });

  test('returns null and low confidence when no amount is present', () => {
    const result = extractCareRequest('I need two dental implants.');
    assert.equal(result.quotedAmountCents, null);
    assert.equal(result.confidence.quotedAmountCents, 'low');
  });
});

describe('extractCareRequest — treatment / procedure type', () => {
  test('recognises "dental implants" as a known procedure type', () => {
    const result = extractCareRequest('I need two dental implants done at Cape Dental Studio.');
    assert.equal(result.procedureTypeGuess, 'dental_implants');
    assert.equal(result.confidence.procedureTypeGuess, 'high');
  });

  test('prefers a multi-word phrase over a shorter substring match', () => {
    // "implants" alone would map differently; the multi-word phrase must win.
    assert.ok(PROCEDURE_TYPE_KEYWORDS['dental implants']);
    const result = extractCareRequest('Getting dental implants next month.');
    assert.equal(result.procedureTypeGuess, 'dental_implants');
  });

  test('returns null with low confidence when no known procedure keyword is found', () => {
    const result = extractCareRequest('I have a bill I need help with.');
    assert.equal(result.procedureTypeGuess, null);
    assert.equal(result.confidence.procedureTypeGuess, 'low');
  });
});

describe('extractCareRequest — provider name', () => {
  test('extracts a provider name following "at"', () => {
    const result = extractCareRequest('My dentist quoted R48,000 at Cape Dental Studio.');
    assert.equal(result.providerName, 'Cape Dental Studio');
    // Name extraction is a weak heuristic — must never claim high confidence.
    assert.equal(result.confidence.providerName, 'low');
  });

  test('returns null when no provider phrase is present', () => {
    const result = extractCareRequest('I need help affording a procedure.');
    assert.equal(result.providerName, null);
  });
});

describe('extractCareRequest — never fabricates missing data', () => {
  test('does not invent a scheme contribution figure', () => {
    const result = extractCareRequest('My dentist quoted R48,000 and I think Discovery will cover some of it.');
    assert.equal(result.quotedAmountCents, 4800000);
    assert.equal(result.schemeContributionCents, undefined,
      'the engine must never guess a Rand figure for scheme contribution — only extract what is explicitly stated');
  });

  test('extracts an explicitly stated scheme contribution', () => {
    const result = extractCareRequest('Discovery said they will pay R16,600 towards it.');
    assert.equal(result.schemeContributionCents, 1660000);
  });
});

describe('detectIntent', () => {
  test('classifies quote-related language as has_quote', () => {
    assert.equal(detectIntent('I have a medical quote for R48,000.'), 'has_quote');
  });

  test('classifies bill/invoice language as has_bill', () => {
    assert.equal(detectIntent('I already have a medical bill I cannot pay.'), 'has_bill');
  });

  test('classifies medical-aid shortfall language as medical_aid_shortfall', () => {
    assert.equal(detectIntent('I need help understanding my medical aid shortfall.'), 'medical_aid_shortfall');
  });

  test('classifies uncertainty language as unsure', () => {
    assert.equal(detectIntent("I'm not sure what I can afford."), 'unsure');
  });

  test('classifies a known treatment mention with no quote/bill words as know_treatment', () => {
    assert.equal(detectIntent('I know I need dental implants.'), 'know_treatment');
  });

  test('falls back to general for unrelated text', () => {
    assert.equal(detectIntent('Hello, can you help me?'), 'general');
  });
});
