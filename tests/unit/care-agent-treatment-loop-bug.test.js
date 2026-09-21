'use strict';

/**
 * Unit Tests — BUG: Care Agent loops forever asking "What treatment or
 * procedure is this for?" when the patient's answer doesn't match one of
 * the ~14 hardcoded procedure keywords in care-agent-nlp.service.js.
 *
 * Reported: a user typed "It's for a nose job", then "Nose procedure",
 * then "Aesthetic" — none contain a dictionary phrase (the dictionary has
 * "rhinoplasty" and "cosmetic surgery", not "nose job"/"aesthetic"), so
 * extractCareRequest() never sets treatmentDescription, the merge never
 * fills it, and nextQuestion() repeats the identical question forever
 * with no way for the patient to escape the loop.
 *
 * Written BEFORE the fix (test-first bug-fixing workflow, per CLAUDE.md):
 * confirmed failing against the current code before any fix is attempted.
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
  test('"nose job" does not match any known procedure keyword (root cause)', () => {
    const extracted = extractCareRequest("It's for a nose job");
    assert.equal(extracted.treatmentDescription, null, 'confirms the dictionary has no entry for "nose job"');
  });

  test('without the raw-message fallback, mergeCareSummary alone cannot resolve it', () => {
    const extracted = extractCareRequest("It's for a nose job");
    const merged = mergeCareSummary({ quotedAmountCents: 4800000 }, extracted);
    assert.equal(merged.treatmentDescription, undefined, 'no fallback -> still missing, this is the bug');
  });
});

describe('FIX CONTRACT: an unrecognized answer must make forward progress', () => {
  test('after one unrecognized answer, treatmentDescription is populated from what the patient typed', () => {
    const summary = { quotedAmountCents: 4800000 };
    const turn = simulateTurn(summary, "It's for a nose job");

    assert.notEqual(turn.summary.treatmentDescription, null, 'treatmentDescription must no longer be missing');
    assert.notEqual(turn.summary.treatmentDescription, undefined);
    assert.match(turn.summary.treatmentDescription, /nose/i);
  });

  test('the loop is broken across three consecutive unrecognized answers', () => {
    let summary = { quotedAmountCents: 4800000 };

    let turn = simulateTurn(summary, "It's for a nose job");
    const firstQuestion = nextQuestion({ quotedAmountCents: 4800000 });
    assert.match(firstQuestion, /treatment|procedure/i);
    summary = turn.summary;

    assert.ok(!missingFieldsFor(summary).includes('treatmentDescription'), 'resolved after the first reply');
    assert.notEqual(turn.reply, firstQuestion, 'must have moved on, not repeated the same question');

    // A second turn on the now-updated summary must not regress back into
    // asking about treatment again.
    turn = simulateTurn(summary, 'Nose procedure');
    assert.ok(!missingFieldsFor(turn.summary).includes('treatmentDescription'));
  });

  test('does not silently invent a procedure category it was never told', () => {
    const summary = { quotedAmountCents: 4800000 };
    const turn = simulateTurn(summary, "It's for a nose job");
    // procedureTypeGuess must stay whatever extraction actually found —
    // null, since "nose job" isn't in the keyword dictionary. The fix
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

  test('once treatmentDescription is already confirmed, a later unrelated reply never overwrites it', () => {
    const summary = { quotedAmountCents: 4800000, treatmentDescription: 'Nose job' };
    const turn = simulateTurn(summary, 'yes I already submitted it to Discovery');
    assert.equal(turn.summary.treatmentDescription, 'Nose job', 'patient-set values always win');
  });
});
