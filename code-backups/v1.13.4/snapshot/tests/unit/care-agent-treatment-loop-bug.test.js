'use strict';

/**
 * Unit Tests — BUG: Care Agent loops forever asking "What treatment or
 * procedure is this for?" when the patient's answer doesn't match one of
 * the ~14 hardcoded procedure keywords in care-agent-nlp.service.js.
 *
 * Reported: a user typed "It's for a nose job", then "Nose procedure",
 * then "Aesthetic" — none contained a dictionary phrase at the time (the
 * dictionary had "rhinoplasty" and "cosmetic surgery", not "nose
 * job"/"aesthetic"), so extractCareRequest() never set
 * treatmentDescription, the merge never filled it, and nextQuestion()
 * repeated the identical question forever with no way for the patient to
 * escape the loop.
 *
 * Two independent fixes landed for this report:
 *  1. The finite procedure list is now shown to the patient as tappable
 *     choices (see care-agent-procedure-options.test.js and
 *     PROCEDURE_CATEGORIES in care-agent-nlp.service.js), and that same
 *     restructure added "nose job"/"aesthetic" as recognized synonyms of
 *     the cosmetic category — so the exact phrases from the report are
 *     now recognized outright, no fallback needed.
 *  2. This suite's fallback mechanism (below) is the safety net for
 *     whatever the *next* unrecognized phrase turns out to be — the
 *     procedure list can never cover every possible wording, so a reply
 *     that still matches nothing must still make forward progress rather
 *     than loop. It uses a still-genuinely-unrecognized example message
 *     ("a growth removed from my arm") to keep exercising that path.
 *
 * Written BEFORE the fix (test-first bug-fixing workflow, per CLAUDE.md):
 * confirmed failing against the current code before any fix was attempted.
 *
 * FIX CONTRACT this suite defines: mergeCareSummary() gains an optional
 * third parameter, the raw patient message, used ONLY as a fallback for
 * whichever field was the single top-priority missing field on the PRIOR
 * summary (i.e. the field the just-asked question was actually about),
 * and ONLY for treatmentDescription — never fabricating a procedure
 * category (procedureTypeGuess stays whatever extraction found, i.e.
 * null), and never misfiling a reply meant for a different pending
 * question (amount, medical aid) as a treatment description.
 *
 * Run: node --test tests/unit/care-agent-treatment-loop-bug.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeCareSummary,
  missingFieldsFor,
  nextQuestion,
} = require('../../backend/src/services/care-agent.service');

const { extractCareRequest } = require('../../backend/src/services/care-agent-nlp.service');

/**
 * Simulates exactly what routes/care-agent.js's POST /messages handler
 * must do with one incoming message against a prior summary: extract,
 * merge (with the raw message available as a fallback), and decide the
 * next question.
 */
function simulateTurn(priorSummary, message) {
  const extracted = extractCareRequest(message);
  const merged = mergeCareSummary(priorSummary, extracted, message);
  return { summary: merged, reply: nextQuestion(merged) };
}

describe('BUG REPRO: unrecognized treatment answers loop forever (pre-fix baseline)', () => {
  test('an unrecognized phrase does not match any known procedure keyword (root cause)', () => {
    const extracted = extractCareRequest('It was a growth removed from my arm');
    assert.equal(extracted.treatmentDescription, null, 'confirms the dictionary has no entry for this phrasing');
  });

  test('without the raw-message fallback, mergeCareSummary alone cannot resolve it', () => {
    const extracted = extractCareRequest('It was a growth removed from my arm');
    const merged = mergeCareSummary({ quotedAmountCents: 4800000 }, extracted);
    assert.equal(merged.treatmentDescription, undefined, 'no fallback -> still missing, this is the bug');
  });
});

describe('FIX CONTRACT: an unrecognized answer must make forward progress', () => {
  test('after one unrecognized answer, treatmentDescription is populated from what the patient typed', () => {
    const summary = { quotedAmountCents: 4800000 };
    const turn = simulateTurn(summary, 'It was a growth removed from my arm');

    assert.notEqual(turn.summary.treatmentDescription, null, 'treatmentDescription must no longer be missing');
    assert.notEqual(turn.summary.treatmentDescription, undefined);
    assert.match(turn.summary.treatmentDescription, /arm/i);
  });

  test('the loop is broken across three consecutive unrecognized answers', () => {
    let summary = { quotedAmountCents: 4800000 };

    let turn = simulateTurn(summary, 'It was a growth removed from my arm');
    const firstQuestion = nextQuestion({ quotedAmountCents: 4800000 });
    assert.match(firstQuestion, /treatment|procedure/i);
    summary = turn.summary;

    assert.ok(!missingFieldsFor(summary).includes('treatmentDescription'), 'resolved after the first reply');
    assert.notEqual(turn.reply, firstQuestion, 'must have moved on, not repeated the same question');

    // A second turn on the now-updated summary must not regress back into
    // asking about treatment again.
    turn = simulateTurn(summary, 'A skin procedure');
    assert.ok(!missingFieldsFor(turn.summary).includes('treatmentDescription'));
  });

  test('does not silently invent a procedure category it was never told', () => {
    const summary = { quotedAmountCents: 4800000 };
    const turn = simulateTurn(summary, 'It was a growth removed from my arm');
    // procedureTypeGuess must stay whatever extraction actually found —
    // null, since this phrasing isn't in the keyword dictionary. The fix
    // must not guess a fake category like "cosmetic" just to fill it.
    assert.equal(turn.summary.procedureTypeGuess, undefined,
      'a null procedureTypeGuess must never be recorded as a real category (mergeCareSummary drops null/undefined fields)');
  });

  test('a known keyword still takes priority over the raw-text fallback', () => {
    const summary = { quotedAmountCents: 4800000 };
    const turn = simulateTurn(summary, 'I need dental implants');
    assert.equal(turn.summary.procedureTypeGuess, 'dental_implants');
    assert.equal(turn.summary.treatmentDescription, 'Dental Implants');
  });

  test('a reply to an EARLIER, different pending question is not misfiled as the treatment description', () => {
    // Nothing known yet — the pending question is the AMOUNT question,
    // not treatment. An unrecognized answer here must not get stuffed
    // into treatmentDescription just because no procedure keyword matched.
    const summary = {};
    const turn = simulateTurn(summary, 'umm not sure how much honestly');
    assert.equal(turn.summary.treatmentDescription, undefined,
      'the fallback must only apply when treatmentDescription is the field actually being asked about');
  });

  test('a very long raw-text fallback is capped so the editable summary stays readable', () => {
    const summary = { quotedAmountCents: 4800000 };
    const ramble = 'x'.repeat(300);
    const turn = simulateTurn(summary, ramble);
    assert.ok(turn.summary.treatmentDescription.length <= 204, 'must be capped (200 chars + a short ellipsis marker), not stored verbatim at 300 chars');
    assert.ok(turn.summary.treatmentDescription.length < ramble.length);
  });

  test('once treatmentDescription is already confirmed, a later unrelated reply never overwrites it', () => {
    const summary = { quotedAmountCents: 4800000, treatmentDescription: 'Nose job' };
    const turn = simulateTurn(summary, 'yes I already submitted it to Discovery');
    assert.equal(turn.summary.treatmentDescription, 'Nose job', 'patient-set values always win');
  });
});
