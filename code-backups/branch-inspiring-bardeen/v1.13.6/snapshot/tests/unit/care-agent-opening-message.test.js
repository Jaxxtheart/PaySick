'use strict';

/**
 * Unit Tests — the Care Agent's actual opening message
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Bug found while addressing "the opening message also needs some work":
 * POST /api/care-agent/sessions built its `reply` as
 * `nextQuestion(summary) || "Tell us what's happening..."`. For a
 * brand-new session, missingFieldsFor({}) always includes
 * quotedAmountCents, so nextQuestion({}) is NEVER null — the friendly
 * fallback text was dead code. The message every new patient actually
 * saw first was nextQuestion()'s bare amount question: "Upload the quote
 * if you have it, or tell me the quoted amount — I'll use it to work out
 * the likely shortfall." No greeting, no warmth, and (missed in the
 * earlier site-wide em-dash pass, since backend/src/services/*.js wasn't
 * in that pass's scope even though this string is genuinely rendered to
 * patients) it still had an em dash.
 *
 * Fix: the session-start reply is now an explicit, warm opening greeting
 * that introduces the agent and invites an open-ended answer, used
 * unconditionally for a brand-new session -- never routed through
 * nextQuestion(), which stays reserved for the narrower per-turn
 * follow-ups once the conversation is under way.
 *
 * Run: node --test tests/unit/care-agent-opening-message.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(
  path.join(__dirname, '../../backend/src/routes/care-agent.js'),
  'utf8'
);

const {
  nextQuestion,
  missingFieldsFor,
} = require('../../backend/src/services/care-agent.service');

describe('BUG: the friendly opening fallback text was unreachable dead code', () => {
  test('nextQuestion({}) is never null, so `nextQuestion(summary) || fallback` never uses the fallback', () => {
    assert.notEqual(nextQuestion({}), null, 'confirms the fallback text in the old code could never fire');
  });
});

describe('FIX: session-start always returns a warm, explicit opening greeting', () => {
  test("POST /sessions no longer derives its opening reply from nextQuestion()", () => {
    const createRoute = routeSource.slice(
      routeSource.indexOf("router.post('/sessions',"),
      routeSource.indexOf("router.get('/sessions/:id',")
    );
    assert.doesNotMatch(
      createRoute,
      /reply\s*=\s*\n?\s*nextQuestion\(summary\)/,
      'the opening reply must not be conditional on nextQuestion() -- it must always greet'
    );
  });

  test('a dedicated opening-greeting constant exists and introduces the agent', () => {
    assert.match(routeSource, /OPENING_GREETING/);
    const match = routeSource.match(/OPENING_GREETING\s*=\s*(['"`])([\s\S]*?)\1/);
    assert.ok(match, 'OPENING_GREETING must be a plain string constant');
    const greeting = match[2];
    assert.match(greeting, /Care Agent/i, 'must introduce itself');
    assert.doesNotMatch(greeting, /—/, 'no em dashes in patient-facing copy (site-wide rule)');
  });
});

describe('Per-turn follow-up questions are unaffected and stay em-dash-free', () => {
  test('nextQuestion() text for every stage has no em dash', () => {
    const stages = [
      {},
      { quotedAmountCents: 4800000 },
      { quotedAmountCents: 4800000, treatmentDescription: 'Dental Implants' },
    ];
    for (const summary of stages) {
      const question = nextQuestion(summary);
      if (question) assert.doesNotMatch(question, /—/, `question for ${JSON.stringify(missingFieldsFor(summary))} must not contain an em dash`);
    }
  });
});
