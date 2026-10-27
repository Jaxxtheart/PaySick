/**
 * Unit Tests — Care Agent LLM account tools (care-agent-llm.service.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * v1.18.0 lets the tool-calling agent help with the patient's whole account,
 * not only a new care request. It gets exactly two new tools:
 *
 *   get_account_overview    read-only: journey stage, the decision rules'
 *                           output, and what is owed, from the snapshot the
 *                           route loaded (never a DB call from here)
 *   propose_account_action  drafts a proposal for the patient to confirm.
 *                           It validates with evaluateProposal() and returns
 *                           a draft; it cannot execute, confirm, or lodge
 *                           anything. The route stores the draft as an
 *                           awaiting_consent proposal.
 *
 * Run: node --test tests/unit/care-agent-llm-account-tools.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const {
  CARE_AGENT_TOOLS,
  executeTool,
  runCareAgentTurn,
  buildSystemPrompt,
  SYSTEM_PROMPT,
} = require('../../backend/src/services/care-agent-llm.service');
const { ACTION_REGISTRY } = require('../../backend/src/services/care-agent-actions.service');

const llmSource = fs.readFileSync(path.join(__dirname, '../../backend/src/services/care-agent-llm.service.js'), 'utf8');

const TODAY = '2026-10-27';
const ACCOUNT = {
  today: TODAY,
  applications: [],
  plans: [{ planId: 'plan-1', status: 'active', totalAmountCents: 720000, outstandingBalanceCents: 360000, monthlyAmountCents: 120000, paymentsMade: 3, numberOfPayments: 6 }],
  instalments: [{ paymentId: 'pay-4', planId: 'plan-1', paymentNumber: 4, amountCents: 120000, dueDate: '2026-10-15', status: 'overdue' }],
  collections: [{ collectionId: 'col-1', paymentId: 'pay-4', amountOutstandingCents: 120000, daysOverdue: 12, status: 'open' }],
  promises: [],
  openRequests: [],
  funderPlans: [],
  unavailable: [],
};

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function sequencedFetch(responses) {
  let call = 0;
  const requests = [];
  return {
    requests,
    fetchImpl: async (url, opts) => {
      requests.push(JSON.parse(opts.body));
      return responses[Math.min(call++, responses.length - 1)];
    },
  };
}

describe('account tools are defined', () => {
  test('get_account_overview and propose_account_action exist', () => {
    const names = CARE_AGENT_TOOLS.map((t) => t.name);
    assert.ok(names.includes('get_account_overview'));
    assert.ok(names.includes('propose_account_action'));
  });

  test("propose_account_action's actionType is limited to the registry", () => {
    const tool = CARE_AGENT_TOOLS.find((t) => t.name === 'propose_account_action');
    assert.deepEqual([...tool.input_schema.properties.actionType.enum].sort(), Object.keys(ACTION_REGISTRY).sort());
    assert.deepEqual(tool.input_schema.required, ['actionType']);
  });

  test('the LLM service never imports the executor, the payment service, or the marketplace', () => {
    assert.doesNotMatch(llmSource, /care-agent-action-executor|plan-payment|marketplace-auction|acceptOffer|processPayment/);
  });
});

describe('executeTool: get_account_overview', () => {
  test('returns the facts and the options open to the patient', () => {
    const outcome = executeTool('get_account_overview', {}, { summary: {}, account: ACCOUNT });
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.result.options.map((o) => o.actionType), ['MAKE_PAYMENT', 'PROMISE_TO_PAY', 'REPORT_HARDSHIP']);
    assert.equal(outcome.result.outstanding[0].paymentId, 'pay-4');
    assert.equal(outcome.proposalDraft, undefined);
  });

  test('says plainly when no account data was loaded', () => {
    const outcome = executeTool('get_account_overview', {}, { summary: {} });
    assert.equal(outcome.ok, false);
    assert.match(outcome.result.error, /account/i);
  });
});

describe('executeTool: propose_account_action', () => {
  test('a valid consent action returns a draft, with PaySick\'s own figures, and says nothing has happened', () => {
    const outcome = executeTool('propose_account_action', { actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4', amountCents: 5 } }, { summary: {}, account: ACCOUNT });
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.proposalDraft, { actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4', amountCents: 5 } });
    assert.equal(outcome.result.authority, 'patient_consent');
    assert.equal(outcome.result.consentText, 'I authorise PaySick to collect R1,200.00 now.');
    assert.match(outcome.result.note, /nothing has happened/i);
  });

  test('a team action returns a draft that says a person decides', () => {
    const outcome = executeTool('propose_account_action', { actionType: 'REPORT_HARDSHIP', params: { reason: 'Lost my job' } }, { summary: {}, account: ACCOUNT });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.authority, 'human_review');
    assert.match(outcome.result.note, /PaySick team/);
  });

  test('a prohibited action is refused with no draft, and the model is told where to send the patient', () => {
    const outcome = executeTool('propose_account_action', { actionType: 'UPDATE_BANKING_DETAILS' }, { summary: {}, account: ACCOUNT });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.proposalDraft, undefined);
    assert.equal(outcome.result.reason, 'NOT_IN_CHAT');
    assert.match(outcome.result.redirect, /dashboard\.html/);
  });

  test('an invalid action is refused with no draft', () => {
    const outcome = executeTool('propose_account_action', { actionType: 'MAKE_PAYMENT', params: { paymentId: 'not-mine' } }, { summary: {}, account: ACCOUNT });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.proposalDraft, undefined);
    assert.equal(outcome.result.reason, 'PAYMENT_NOT_DUE');
  });

  test('a read-only action needs no draft', () => {
    const outcome = executeTool('propose_account_action', { actionType: 'VIEW_ACCOUNT' }, { summary: {}, account: ACCOUNT });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.proposalDraft, undefined);
  });
});

describe('system prompt covers account actions', () => {
  test('says actions are only ever prepared, and the patient or team decides', () => {
    assert.match(SYSTEM_PROMPT, /propose_account_action/);
    assert.match(SYSTEM_PROMPT, /never say .*(done|paid|accepted)/i);
    assert.match(SYSTEM_PROMPT, /banking details/i);
  });

  // v1.19.0: the patient sees facts and outcomes, never the process.
  test('tells the model to keep the backend process out of what it says', () => {
    assert.match(SYSTEM_PROMPT, /never mention .*(rules|reviews|checks|decisions)/i);
    assert.match(SYSTEM_PROMPT, /never narrate/i);
    assert.match(SYSTEM_PROMPT, /please check the details below/i);
  });

  test('the overview gives the model options without the reasoning behind them', () => {
    const outcome = executeTool('get_account_overview', {}, { summary: {}, account: ACCOUNT });
    const json = JSON.stringify(outcome.result);
    assert.doesNotMatch(json, /rationale|reasonCode|"decisions"|journeyStage|authority/);
    assert.ok(outcome.result.options.length > 0);
  });

  test("includes the patient's journey stage when account data is loaded", () => {
    assert.match(buildSystemPrompt({}, ACCOUNT), /Account journey stage: recover/);
  });

  test('never contains an em dash', () => {
    assert.doesNotMatch(buildSystemPrompt({}, ACCOUNT), /—/);
  });
});

describe('runCareAgentTurn collects drafts, never executes them', () => {
  test('returns the drafts the model made, alongside the reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl, requests } = sequencedFetch([
      jsonResponse({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'get_account_overview', input: {} },
          { type: 'tool_use', id: 't2', name: 'propose_account_action', input: { actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' } } },
        ],
      }),
      jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: "I've set up the payment for you to check below." }] }),
    ]);

    const turn = await runCareAgentTurn({ summary: {}, history: [], userMessage: 'can I pay the late one now', account: ACCOUNT, fetchImpl });
    assert.equal(turn.reply, "I've set up the payment for you to check below.");
    assert.deepEqual(turn.proposalDrafts, [{ actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' } }]);
    assert.match(requests[0].system, /Account journey stage: recover/);
  });

  test('a turn with no account tools returns an empty draft list', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { fetchImpl } = sequencedFetch([jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello.' }] })]);
    const turn = await runCareAgentTurn({ summary: {}, history: [], userMessage: 'hi', fetchImpl });
    assert.deepEqual(turn.proposalDrafts, []);
  });
});
