/**
 * CARE AGENT — LLM TOOL-CALLING AGENT (test-first)
 *
 * Written BEFORE the implementation, per CLAUDE.md's test-first workflow.
 *
 * Per explicit user direction ("No I want the LLM. AGENTIC OPTION. This
 * then makes PaySick 2.0 a harness for healthcare payments"), replaces the
 * local trigram-similarity fallback as the Care Agent's PRIMARY reasoning
 * engine with a real Anthropic API tool-calling loop: the model reasons
 * freely and decides which of PaySick's deterministic functions to call
 * (record what the patient said, compute the shortfall, build payment-term
 * options) and when -- PaySick's own code is the harness that executes
 * those calls and validates every input, never trusting the model's word
 * for a number or a category it didn't get from calling a tool.
 *
 * "AI reasons, PaySick controls" still holds, now enforced at a new
 * boundary: the model can trigger get_shortfall/build_term_options, but
 * those tools are the exact same tested, pure functions
 * (computeShortfallCents/buildTermOptions) already used elsewhere --
 * the model never does the arithmetic itself. update_care_summary
 * independently re-validates every field (amount must be a non-negative
 * integer, procedureTypeGuess must be one of the fixed known category
 * ids) rather than trusting the tool call's input blindly -- exactly the
 * same "the LLM is never trusted to be the sole guardrail" pattern
 * outreach/claude.service.js already uses for its own terminology linter.
 * Nothing that moves money (/approve, /execute) is reachable from this
 * tool loop at all -- those remain separate, human-consent-gated routes
 * this file never touches.
 *
 * This sandbox has no outbound internet access, so the live Anthropic API
 * itself cannot be exercised here (same constraint noted in
 * outreach/claude.service.js's own module header). Every test below
 * exercises the orchestration loop and tool-execution logic with an
 * injected `fetchImpl` (the exact same test-seam claude.service.js's
 * `generateDraft`/`generateOnboardingReply` already use), so the loop's
 * actual control flow, validation, and guardrails are fully covered
 * without a live network call.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const {
  CARE_AGENT_TOOLS,
  executeTool,
  runCareAgentTurn,
  buildSystemPrompt,
  SYSTEM_PROMPT,
} = require('../../backend/src/services/care-agent-llm.service');

const { PROCEDURE_CATEGORIES } = require('../../backend/src/services/care-agent-nlp.service');

function textBlock(text) {
  return { type: 'text', text };
}

function toolUseBlock(id, name, input) {
  return { type: 'tool_use', id, name, input };
}

function jsonResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeSequencedFetch(responses) {
  let call = 0;
  const requests = [];
  return {
    requests,
    fetchImpl: async (url, opts) => {
      requests.push({ url, opts, body: JSON.parse(opts.body) });
      const response = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return response;
    },
  };
}

describe('CARE_AGENT_TOOLS', () => {
  test('never exposes any tool that could move money or finalize approval', () => {
    const toolNames = CARE_AGENT_TOOLS.map((t) => t.name);
    for (const forbidden of ['approve', 'execute', 'submit', 'pay', 'confirm', 'disburse', 'charge']) {
      assert.ok(
        !toolNames.some((name) => name.toLowerCase().includes(forbidden)),
        `no tool name may reference "${forbidden}" -- money-moving actions stay outside this loop entirely`
      );
    }
  });

  test('update_care_summary constrains procedureTypeGuess to the fixed known category ids', () => {
    const tool = CARE_AGENT_TOOLS.find((t) => t.name === 'update_care_summary');
    assert.ok(tool, 'update_care_summary tool must exist');
    const enumValues = tool.input_schema.properties.procedureTypeGuess.enum;
    assert.deepEqual(enumValues.sort(), PROCEDURE_CATEGORIES.map((c) => c.id).sort());
  });
});

describe('buildSystemPrompt', () => {
  test('includes the hard rules and the recognized category list', () => {
    const prompt = buildSystemPrompt({});
    assert.match(prompt, /never state a rand amount/i);
    assert.match(prompt, /never invent a procedure category/i);
    for (const category of PROCEDURE_CATEGORIES) {
      assert.ok(prompt.includes(category.id), `system prompt must list category id ${category.id}`);
    }
  });

  test('surfaces already-known fields and still-missing fields from the current summary', () => {
    const prompt = buildSystemPrompt({ quotedAmountCents: 4800000 });
    assert.match(prompt, /4800000/);
    assert.match(prompt, /treatmentDescription/);
    assert.match(prompt, /schemeContributionCents/);
  });

  test('never contains an em dash (patient-facing text, per CLAUDE.md)', () => {
    const prompt = buildSystemPrompt({ quotedAmountCents: 100 });
    assert.ok(!prompt.includes('—'), 'system prompt must not contain an em dash');
  });
});

describe('executeTool: update_care_summary', () => {
  test('records a valid amount and treatment description', () => {
    const outcome = executeTool(
      'update_care_summary',
      { quotedAmountCents: 4800000, treatmentDescription: 'two dental implants' },
      { summary: {} }
    );
    assert.equal(outcome.ok, true);
    assert.equal(outcome.summaryPatch.quotedAmountCents, 4800000);
    assert.equal(outcome.summaryPatch.treatmentDescription, 'two dental implants');
  });

  test('rejects a negative amount rather than trusting the model blindly', () => {
    const outcome = executeTool('update_care_summary', { quotedAmountCents: -500 }, { summary: {} });
    assert.equal(outcome.ok, false);
    assert.ok(!('quotedAmountCents' in outcome.summaryPatch));
    assert.match(JSON.stringify(outcome.result), /quotedAmountCents/);
  });

  test('rejects a procedureTypeGuess outside the fixed known category list -- never invents a category', () => {
    const outcome = executeTool(
      'update_care_summary',
      { procedureTypeGuess: 'made_up_category' },
      { summary: {} }
    );
    assert.equal(outcome.ok, false);
    assert.ok(!('procedureTypeGuess' in outcome.summaryPatch));
  });

  test('accepts 0 as a valid, known schemeContributionCents ("not covered")', () => {
    const outcome = executeTool('update_care_summary', { schemeContributionCents: 0 }, { summary: {} });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.summaryPatch.schemeContributionCents, 0);
  });

  test('auto-fills treatmentDescription from the category label when only procedureTypeGuess is given', () => {
    const category = PROCEDURE_CATEGORIES[0];
    const outcome = executeTool(
      'update_care_summary',
      { procedureTypeGuess: category.id },
      { summary: {} }
    );
    assert.equal(outcome.summaryPatch.procedureTypeGuess, category.id);
    assert.equal(outcome.summaryPatch.treatmentDescription, category.label);
  });

  test('never overwrites a field already present in the running summary', () => {
    const outcome = executeTool(
      'update_care_summary',
      { quotedAmountCents: 9999900 },
      { summary: { quotedAmountCents: 4800000 } }
    );
    assert.equal(outcome.result.currentSummary.quotedAmountCents, 4800000);
  });

  test('caps an excessively long treatmentDescription', () => {
    const long = 'x'.repeat(500);
    const outcome = executeTool('update_care_summary', { treatmentDescription: long }, { summary: {} });
    assert.ok(outcome.summaryPatch.treatmentDescription.length <= 204);
  });
});

describe('executeTool: get_shortfall', () => {
  test('computes the shortfall from the current summary -- never from the tool call input', () => {
    const outcome = executeTool('get_shortfall', {}, {
      summary: { quotedAmountCents: 4800000, schemeContributionCents: 1000000 },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.shortfallCents, 3800000);
  });

  test('refuses when the amount or scheme contribution is not yet known', () => {
    const outcome = executeTool('get_shortfall', {}, { summary: {} });
    assert.equal(outcome.ok, false);
    assert.match(outcome.result.error, /quotedAmountCents|schemeContributionCents/);
  });
});

describe('executeTool: build_term_options', () => {
  test('builds zero-interest term options from the current shortfall', () => {
    const outcome = executeTool('build_term_options', {}, {
      summary: { quotedAmountCents: 3600000, schemeContributionCents: 0 },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.options.length, 3);
    assert.deepEqual(outcome.result.options.map((o) => o.termMonths), [3, 6, 12]);
  });

  test('refuses when the shortfall is not yet computable', () => {
    const outcome = executeTool('build_term_options', {}, { summary: {} });
    assert.equal(outcome.ok, false);
  });
});

describe('executeTool: unknown tool', () => {
  test('returns a safe error result rather than throwing', () => {
    const outcome = executeTool('delete_everything', {}, { summary: {} });
    assert.equal(outcome.ok, false);
    assert.match(outcome.result.error, /unknown tool/i);
  });
});

describe('runCareAgentTurn: orchestration loop', () => {
  test('throws when ANTHROPIC_API_KEY is not set (route is expected to catch this and fall back)', async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await assert.rejects(
        () => runCareAgentTurn({ summary: {}, history: [], userMessage: 'hi', fetchImpl: async () => jsonResponse({}) }),
        /ANTHROPIC_API_KEY/
      );
    } finally {
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  test('returns the model\'s text reply directly when it calls no tools', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl } = makeSequencedFetch([
      jsonResponse({
        stop_reason: 'end_turn',
        content: [textBlock('Hi there, what brings you in today?')],
      }),
    ]);

    const turn = await runCareAgentTurn({ summary: {}, history: [], userMessage: 'hi', fetchImpl });
    assert.equal(turn.reply, 'Hi there, what brings you in today?');
    assert.deepEqual(turn.summary, {});
    assert.equal(turn.toolCalls.length, 0);
  });

  test('executes a tool call, feeds the result back, and returns the follow-up text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl, requests } = makeSequencedFetch([
      jsonResponse({
        stop_reason: 'tool_use',
        content: [
          textBlock('Got it, let me note that down.'),
          toolUseBlock('call_1', 'update_care_summary', { quotedAmountCents: 4800000 }),
        ],
      }),
      jsonResponse({
        stop_reason: 'end_turn',
        content: [textBlock('Thanks -- and what treatment is this for?')],
      }),
    ]);

    const turn = await runCareAgentTurn({
      summary: {},
      history: [],
      userMessage: 'The quote is R48,000',
      fetchImpl,
    });

    assert.equal(turn.reply, 'Thanks -- and what treatment is this for?');
    assert.equal(turn.summary.quotedAmountCents, 4800000);
    assert.equal(turn.toolCalls.length, 1);
    assert.equal(turn.toolCalls[0].name, 'update_care_summary');

    // Second request must carry the tool_result keyed to the first call's id.
    assert.equal(requests.length, 2);
    const secondRequestMessages = requests[1].body.messages;
    const toolResultMessage = secondRequestMessages[secondRequestMessages.length - 1];
    assert.equal(toolResultMessage.role, 'user');
    assert.equal(toolResultMessage.content[0].type, 'tool_result');
    assert.equal(toolResultMessage.content[0].tool_use_id, 'call_1');
  });

  test('chains multiple tool calls across turns (record, then compute) before replying', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl } = makeSequencedFetch([
      jsonResponse({
        stop_reason: 'tool_use',
        content: [toolUseBlock('call_1', 'update_care_summary', { schemeContributionCents: 1000000 })],
      }),
      jsonResponse({
        stop_reason: 'tool_use',
        content: [toolUseBlock('call_2', 'get_shortfall', {})],
      }),
      jsonResponse({
        stop_reason: 'end_turn',
        content: [textBlock('Your shortfall works out to R28,000.')],
      }),
    ]);

    const turn = await runCareAgentTurn({
      summary: { quotedAmountCents: 4800000 },
      history: [],
      userMessage: 'Discovery will cover R10,000',
      fetchImpl,
    });

    assert.equal(turn.toolCalls.length, 2);
    assert.equal(turn.toolCalls[1].name, 'get_shortfall');
    assert.equal(turn.toolCalls[1].result.shortfallCents, 3800000);
    assert.equal(turn.reply, 'Your shortfall works out to R28,000.');
  });

  test('an invalid tool call is reported back to the model as an error, not silently dropped or thrown', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl, requests } = makeSequencedFetch([
      jsonResponse({
        stop_reason: 'tool_use',
        content: [toolUseBlock('call_1', 'update_care_summary', { procedureTypeGuess: 'not_a_real_category' })],
      }),
      jsonResponse({
        stop_reason: 'end_turn',
        content: [textBlock('Could you describe the procedure in your own words?')],
      }),
    ]);

    const turn = await runCareAgentTurn({ summary: {}, history: [], userMessage: 'some odd procedure', fetchImpl });

    assert.ok(!('procedureTypeGuess' in turn.summary));
    const secondRequestMessages = requests[1].body.messages;
    const toolResultMessage = secondRequestMessages[secondRequestMessages.length - 1];
    assert.equal(toolResultMessage.content[0].is_error, true);
  });

  test('never loops forever -- stops at a hard iteration cap and still returns a usable reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const responses = [];
    for (let i = 0; i < 20; i += 1) {
      responses.push(
        jsonResponse({
          stop_reason: 'tool_use',
          content: [toolUseBlock(`call_${i}`, 'get_shortfall', {})],
        })
      );
    }
    const { fetchImpl, requests } = makeSequencedFetch(responses);

    const turn = await runCareAgentTurn({ summary: {}, history: [], userMessage: 'hi', fetchImpl });

    assert.equal(turn.hitIterationCap, true);
    assert.equal(typeof turn.reply, 'string');
    assert.ok(turn.reply.length > 0, 'must never leave the patient with an empty reply');
    assert.ok(requests.length <= 10, 'must stop well short of an unbounded loop');
  });

  test('propagates a non-ok API response as a thrown error (route falls back on this)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = async () => jsonResponse({ error: 'overloaded' }, false, 529);
    await assert.rejects(
      () => runCareAgentTurn({ summary: {}, history: [], userMessage: 'hi', fetchImpl }),
      /Anthropic API error/
    );
  });

  test('sends prior conversation history as alternating user/assistant turns before the new message', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl, requests } = makeSequencedFetch([
      jsonResponse({ stop_reason: 'end_turn', content: [textBlock('Sure, go on.')] }),
    ]);

    await runCareAgentTurn({
      summary: {},
      history: [
        { role: 'user', content: 'Hi, I need help paying for something' },
        { role: 'assistant', content: 'Of course -- what is it for?' },
      ],
      userMessage: 'A root canal',
      fetchImpl,
    });

    const sentMessages = requests[0].body.messages;
    assert.equal(sentMessages[0].role, 'user');
    assert.equal(sentMessages[0].content, 'Hi, I need help paying for something');
    assert.equal(sentMessages[sentMessages.length - 1].content, 'A root canal');
  });
});
