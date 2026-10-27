/**
 * Unit Tests — Care Agent patient view (care-agent-patient-view.service.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Owner direction (v1.19.0): the agent's decisions belong in the backend,
 * not on the patient's screen. The patient sees confirmed facts and
 * statuses only: what is owed and when, what they can do, and the outcome
 * of what they confirmed. It must not feel like an agent is working in the
 * background. The less the patient sees, the better.
 *
 * This module is the single filter between the backend and the page:
 *   patientAccountView()  account snapshot + decisions -> facts and options
 *   patientActionView()   executor result -> what the card or reply needs
 * Both are allowlists, so a new internal field can never leak by default.
 *
 * Run: node --test tests/unit/care-agent-patient-view.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  patientAccountView,
  patientActionView,
  describeAccountStatus,
  INTERNAL_KEYS,
} = require('../../backend/src/services/care-agent-patient-view.service');
const { decideNextBestActions, evaluateProposal } = require('../../backend/src/services/care-agent-actions.service');
const { createActionExecutor } = require('../../backend/src/services/care-agent-action-executor.service');

const TODAY = '2026-10-27';
function addDays(days) {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function account(overrides = {}) {
  return {
    today: TODAY,
    applications: [],
    plans: [{ planId: 'plan-1', status: 'active', totalAmountCents: 720000, outstandingBalanceCents: 360000, monthlyAmountCents: 120000, paymentsMade: 3, numberOfPayments: 6 }],
    instalments: [
      { paymentId: 'pay-4', planId: 'plan-1', paymentNumber: 4, amountCents: 120000, dueDate: addDays(-12), status: 'overdue' },
      { paymentId: 'pay-5', planId: 'plan-1', paymentNumber: 5, amountCents: 120000, dueDate: addDays(18), status: 'scheduled' },
    ],
    collections: [{ collectionId: 'col-1', paymentId: 'pay-4', amountOutstandingCents: 120000, daysOverdue: 12, status: 'open' }],
    promises: [],
    openRequests: [{ requestId: 'req-1', requestType: 'REQUEST_PAYMENT_DATE_CHANGE', status: 'OPEN' }],
    funderPlans: [],
    unavailable: [],
    ...overrides,
  };
}

const OFFERS = [
  { offerId: 'off-b', lenderName: 'CareCapital', monthlyPaymentCents: 126000, totalRepayableCents: 756000, termMonths: 6, interestRate: 0.05 },
  { offerId: 'off-a', lenderName: 'MediFinance SA', monthlyPaymentCents: 124800, totalRepayableCents: 748800, termMonths: 6, interestRate: 0.04 },
];

/** Words that describe the backend's process rather than a fact or outcome. */
const PROCESS_WORDS = /\b(agent|review(ed|ing)?|decid\w*|decision|assess\w*|rules?|risk|eligib\w*|threshold|stage|escalat\w*|collections?|flag\w*|score|system|team decides|prepar\w*)\b/i;

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, keys));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function assertNoInternals(view) {
  const keys = collectKeys(view);
  for (const key of INTERNAL_KEYS) assert.ok(!keys.has(key), `patient view must not contain "${key}"`);
}

describe('INTERNAL_KEYS', () => {
  test('covers the decision process, the tiers and the review routing', () => {
    for (const key of ['decisions', 'reasonCode', 'rationale', 'journeyStage', 'authority', 'authorityLabel', 'priority', 'slaHours', 'effect', 'reason', 'stage', 'recommended', 'rank', 'reviewQueueId', 'pressureWarning', 'interestRate', 'proposedBy']) {
      assert.ok(INTERNAL_KEYS.includes(key), key);
    }
  });
});

describe('patientAccountView', () => {
  const acct = account({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] });
  const view = patientAccountView(acct, decideNextBestActions(acct));

  test('contains no decision, tier, stage or routing fields', () => {
    assertNoInternals(view);
  });

  test('states the facts: what is outstanding, what is next, the balance', () => {
    assert.deepEqual(view.outstanding, [{ paymentId: 'pay-4', amountCents: 120000, dueDate: addDays(-12) }]);
    assert.deepEqual(view.nextPayment, { amountCents: 120000, dueDate: addDays(18) });
    assert.equal(view.balanceCents, 360000);
    assert.deepEqual(view.progress, { paymentsMade: 3, numberOfPayments: 6 });
  });

  test('lists offers in a stable order with no recommendation marked', () => {
    assert.deepEqual(view.offers.map((o) => o.offerId), ['off-a', 'off-b']);
    assert.deepEqual(Object.keys(view.offers[0]).sort(), ['lenderName', 'monthlyPaymentCents', 'offerId', 'termMonths', 'totalRepayableCents']);
  });

  test('shows a request only as received, never how it is being handled', () => {
    assert.deepEqual(view.requests, [{ label: 'Move my payment date', status: 'Received' }]);
  });

  test('gives options as plain buttons: label, action and the details it needs', () => {
    assert.ok(view.options.length > 0);
    for (const option of view.options) {
      assert.deepEqual(Object.keys(option).sort(), ['actionType', 'inputs', 'label', 'params']);
    }
    assert.equal(view.options[0].actionType, 'MAKE_PAYMENT');
  });

  test('every option label and status reads as plain, with no process words', () => {
    for (const text of collectStrings({ options: view.options.map((o) => o.label), requests: view.requests, status: view.status })) {
      assert.doesNotMatch(text, PROCESS_WORDS, text);
    }
  });

  test('shows nothing when there is nothing on the account', () => {
    const empty = account({ plans: [], instalments: [], collections: [], openRequests: [] });
    const emptyView = patientAccountView(empty, decideNextBestActions(empty));
    assert.equal(emptyView.hasAccount, false);
    assert.deepEqual(emptyView.options, []);
  });
});

describe('describeAccountStatus', () => {
  test('an outstanding payment is stated as a fact', () => {
    assert.equal(describeAccountStatus(account()), `Your payment of R1,200.00 due ${addDays(-12)} is outstanding.`);
  });

  test('otherwise the next payment', () => {
    const acct = account({ instalments: [{ paymentId: 'pay-5', planId: 'plan-1', paymentNumber: 5, amountCents: 120000, dueDate: addDays(18), status: 'scheduled' }], collections: [] });
    assert.equal(describeAccountStatus(acct), `Your next payment of R1,200.00 is due on ${addDays(18)}.`);
  });

  test('a paid-off plan', () => {
    const acct = account({ plans: [{ planId: 'plan-1', status: 'completed', outstandingBalanceCents: 0 }], instalments: [], collections: [] });
    assert.equal(describeAccountStatus(acct), 'Your payment plan is fully paid.');
  });
});

describe('patientActionView', () => {
  const acct = account();

  test('a card shows only its title, lines, consent text and button label', () => {
    const evaluation = evaluateProposal('MAKE_PAYMENT', { paymentId: 'pay-4' }, acct);
    const view = patientActionView({ status: 'awaiting_consent', httpStatus: 201, proposalId: 'prop-1', expiresAt: 'x', ...evaluation });
    assertNoInternals(view);
    assert.deepEqual(Object.keys(view).sort(), ['confirmLabel', 'consentText', 'lines', 'proposalId', 'status', 'title']);
    assert.equal(view.confirmLabel, 'Pay R1,200.00');
  });

  test('a request card is sent, not confirmed, and names no team or review', () => {
    const evaluation = evaluateProposal('REQUEST_PAYMENT_DATE_CHANGE', { preferredDay: 25 }, acct);
    const view = patientActionView({ status: 'awaiting_consent', proposalId: 'prop-2', ...evaluation });
    assert.equal(view.confirmLabel, 'Send request');
    for (const text of collectStrings(view)) assert.doesNotMatch(text, PROCESS_WORDS, text);
  });

  test('a refusal carries only its message and a safe link', () => {
    const evaluation = evaluateProposal('UPDATE_BANKING_DETAILS', {}, acct);
    const view = patientActionView({ status: 'refused', httpStatus: 403, ...evaluation });
    assert.deepEqual(Object.keys(view).sort(), ['message', 'redirect', 'status']);
  });

  test('a completed read gives facts, not the decisions behind them', () => {
    const view = patientActionView({ status: 'executed', authority: 'autonomous', result: { ...decideNextBestActions(acct), today: acct.today, plans: acct.plans, instalments: acct.instalments } });
    assertNoInternals(view);
    assert.equal(view.message, describeAccountStatus(acct));
  });
});

describe('every patient-facing message is a plain fact or outcome', () => {
  const refusals = [
    ['MAKE_PAYMENT', { paymentId: 'nope' }, account()],
    ['PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(-1) }, account()],
    ['PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(45) }, account()],
    ['PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(3) }, account({ instalments: [{ paymentId: 'pay-4', planId: 'plan-1', paymentNumber: 4, amountCents: 120000, dueDate: addDays(-95), status: 'overdue' }] })],
    ['PROMISE_TO_PAY', { paymentId: 'pay-5', promisedDate: addDays(3) }, account()],
    ['REQUEST_PAYMENT_DATE_CHANGE', { preferredDay: 31 }, account()],
    ['REQUEST_RESTRUCTURE', { newTermMonths: 99 }, account()],
    ['UPDATE_BANKING_DETAILS', {}, account()],
    ['REPORT_HARDSHIP', { reason: 'account number 62123456789' }, account()],
    ['ACCEPT_OFFER', { offerId: 'gone' }, account()],
  ];
  for (const [type, params, acct] of refusals) {
    test(`refusal for ${type} ${JSON.stringify(params)}`, () => {
      const result = evaluateProposal(type, params, acct);
      assert.equal(result.ok, false);
      assert.doesNotMatch(result.message, PROCESS_WORDS, result.message);
      assert.doesNotMatch(result.message, /\bI\b/, `no first-person agent voice: ${result.message}`);
    });
  }

  test('consent texts are plain', () => {
    for (const [type, params] of [['MAKE_PAYMENT', { paymentId: 'pay-4' }], ['PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(5) }], ['REPORT_HARDSHIP', {}], ['REQUEST_RESTRUCTURE', { newTermMonths: 6 }]]) {
      const result = evaluateProposal(type, params, account());
      assert.doesNotMatch(result.consentText, PROCESS_WORDS, result.consentText);
    }
  });

  test('outcome messages after confirming are plain, with no agent voice', async () => {
    const proposals = new Map();
    let id = 0;
    const query = async (sql, p = []) => {
      if (/INSERT INTO care_agent_action_proposals/.test(sql)) { const pid = `p${++id}`; proposals.set(pid, { proposal_id: pid, session_id: p[0], user_id: p[1], action_type: p[2], authority: p[3], params: JSON.parse(p[4]), expires_at: p[9], status: 'awaiting_consent' }); return { rows: [{ proposal_id: pid, expires_at: p[9] }] }; }
      if (/SET status = 'confirming'|SET status = 'declined'/.test(sql)) { const r = proposals.get(p[0]); if (!r || r.status !== 'awaiting_consent') return { rows: [] }; r.status = 'x'; return { rows: [{ ...r }] }; }
      if (/SELECT status, expires_at/.test(sql)) return { rows: [{ status: 'executed' }] };
      if (/manual_review_queue/.test(sql)) return { rows: [{ id: 1 }] };
      if (/care_agent_manage_requests/.test(sql)) return { rows: [{ request_id: 'r1' }] };
      if (/promise_to_pay/.test(sql)) return { rows: [{ promise_id: 'pr1' }] };
      return { rows: [] };
    };
    const executor = createActionExecutor({
      query, transaction: async (fn) => fn({ query }), loadAccount: async () => account(),
      acceptOffer: async () => ({}), processPayment: async () => ({}), now: () => new Date(`${TODAY}T09:00:00Z`),
    });
    const messages = [];
    for (const [type, params] of [['MAKE_PAYMENT', { paymentId: 'pay-4' }], ['PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(5) }], ['REPORT_HARDSHIP', {}]]) {
      const p = await executor.propose({ sessionId: 's', userId: 'u', actionType: type, params, proposedBy: 'patient' });
      messages.push((await executor.confirm({ sessionId: 's', userId: 'u', proposalId: p.proposalId, consent: true })).message);
    }
    const d = await executor.propose({ sessionId: 's', userId: 'u', actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' }, proposedBy: 'patient' });
    messages.push((await executor.decline({ sessionId: 's', userId: 'u', proposalId: d.proposalId })).message);
    messages.push((await executor.confirm({ sessionId: 's', userId: 'u', proposalId: d.proposalId, consent: true })).message);
    for (const message of messages) {
      assert.doesNotMatch(message, PROCESS_WORDS, message);
      assert.doesNotMatch(message, /\bI\b|\bI'/, `no first-person agent voice: ${message}`);
    }
  });
});
