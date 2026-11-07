/**
 * Unit Tests — Care Agent action executor (care-agent-action-executor.service.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The executor is the only place a Care Agent action changes anything. It:
 *   - proposes: validates with evaluateProposal(); autonomous actions run
 *     at once (read-only), consent/team actions are stored as a proposal
 *     awaiting the patient's tap, prohibited/invalid ones are refused;
 *   - confirms: requires explicit consent, claims the proposal atomically
 *     (a double-tap cannot execute twice), enforces expiry, re-checks it
 *     against LIVE account data (and refuses if the amount changed since
 *     the patient agreed), then performs the backend update;
 *   - declines; and
 *   - writes every step to care_agent_audit_log.
 *
 * Database access and the two money-moving services are injected, so the
 * full state machine runs here with fakes.
 *
 * Run: node --test tests/unit/care-agent-action-executor.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createActionExecutor,
  describeAuditEvent,
  PROPOSAL_TTL_MINUTES,
} = require('../../backend/src/services/care-agent-action-executor.service');

const TODAY = '2026-10-27';
const NOW = new Date('2026-10-27T09:00:00Z');
const SESSION = 'sess-1';
const USER = 'user-1';

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function baseAccount(overrides = {}) {
  return {
    today: TODAY,
    applications: [],
    plans: [{ planId: 'plan-1', status: 'active', totalAmountCents: 720000, outstandingBalanceCents: 360000, monthlyAmountCents: 120000, paymentsMade: 3, numberOfPayments: 6 }],
    instalments: [{ paymentId: 'pay-4', planId: 'plan-1', paymentNumber: 4, amountCents: 120000, dueDate: addDays(TODAY, -12), status: 'overdue' }],
    collections: [{ collectionId: 'col-1', paymentId: 'pay-4', amountOutstandingCents: 120000, daysOverdue: 12, status: 'open' }],
    promises: [],
    openRequests: [],
    funderPlans: [],
    unavailable: [],
    ...overrides,
  };
}

const OFFERS = [
  { offerId: 'off-a', lenderName: 'MediFinance SA', monthlyPaymentCents: 124800, totalRepayableCents: 748800, termMonths: 6 },
];

/**
 * Scripted fake database. Each handler is [regex, fn(params, sql) -> rows].
 * The first matching handler answers. Every call is recorded.
 */
function fakeDb(handlers = []) {
  const calls = [];
  const proposals = new Map();
  let nextId = 1;

  const builtIn = [
    [/INSERT INTO care_agent_action_proposals/, (p) => {
      const id = `prop-${nextId++}`;
      proposals.set(id, {
        proposal_id: id, session_id: p[0], user_id: p[1], action_type: p[2], authority: p[3],
        params: JSON.parse(p[4]), summary: JSON.parse(p[5]), consent_text: p[6], effect: p[7],
        proposed_by: p[8], expires_at: p[9], status: 'awaiting_consent',
      });
      return [{ proposal_id: id, expires_at: p[9] }];
    }],
    [/UPDATE care_agent_action_proposals\s+SET status = 'confirming'/, (p) => {
      const row = proposals.get(p[0]);
      if (!row || row.session_id !== p[1] || row.user_id !== p[2] || row.status !== 'awaiting_consent') return [];
      row.status = 'confirming';
      return [{ ...row }];
    }],
    [/UPDATE care_agent_action_proposals\s+SET status = 'declined'/, (p) => {
      const row = proposals.get(p[0]);
      if (!row || row.session_id !== p[1] || row.user_id !== p[2] || row.status !== 'awaiting_consent') return [];
      row.status = 'declined';
      return [{ ...row }];
    }],
    [/UPDATE care_agent_action_proposals\s+SET status = \$2/, (p) => {
      const row = proposals.get(p[0]);
      if (row) row.status = p[1];
      return [];
    }],
    [/SELECT status, expires_at FROM care_agent_action_proposals/, (p) => {
      const row = proposals.get(p[0]);
      return row && row.session_id === p[1] && row.user_id === p[2] ? [{ status: row.status, expires_at: row.expires_at }] : [];
    }],
    [/INSERT INTO manual_review_queue/, () => [{ id: 77 }]],
    [/INSERT INTO care_agent_manage_requests/, () => [{ request_id: 'req-9' }]],
    [/INSERT INTO promise_to_pay/, () => [{ promise_id: 'pr-9' }]],
    [/UPDATE collections/, () => [{ collection_id: 'col-1' }]],
  ];

  const all = [...handlers, ...builtIn];
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    for (const [pattern, fn] of all) {
      if (pattern.test(sql)) {
        const rows = fn(params, sql) || [];
        return { rows, rowCount: rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  };
  const transaction = async (fn) => fn({ query });
  return { query, transaction, calls, proposals };
}

function makeExecutor({ account = baseAccount(), db = fakeDb(), acceptOffer, processPayment, now = () => NOW } = {}) {
  const spies = { acceptOffer: [], processPayment: [] };
  let currentAccount = account;
  const executor = createActionExecutor({
    query: db.query,
    transaction: db.transaction,
    loadAccount: async () => currentAccount,
    acceptOffer: acceptOffer || (async (offerId, userId) => { spies.acceptOffer.push({ offerId, userId }); return { loanId: 'loan-1' }; }),
    processPayment: processPayment || (async (args) => { spies.processPayment.push(args); return { transaction: { transaction_id: 'txn-1' }, lateFee: null, planId: 'plan-1', totalCollected: 1200 }; }),
    now,
  });
  return { executor, db, spies, setAccount: (next) => { currentAccount = next; } };
}

function auditEvents(db) {
  return db.calls
    .filter((c) => /INSERT INTO care_agent_audit_log/.test(c.sql))
    .map((c) => ({ eventType: c.params[1], actor: c.params[2], payload: JSON.parse(c.params[3]) }));
}

function writes(db, table) {
  return db.calls.filter((c) => new RegExp(`(INSERT INTO|UPDATE) ${table}\\b`).test(c.sql));
}

// ─────────────────────────────────────────────
// propose
// ─────────────────────────────────────────────
describe('propose', () => {
  test('a read-only action runs at once and is recorded as done by the agent', async () => {
    const { executor, db } = makeExecutor();
    const result = await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'VIEW_ACCOUNT', params: {}, proposedBy: 'agent' });
    assert.equal(result.status, 'executed');
    assert.equal(result.authority, 'autonomous');
    assert.ok(result.result.decisions.length > 0, 'VIEW_ACCOUNT returns the agent decisions');
    assert.equal(writes(db, 'care_agent_action_proposals').length, 0, 'nothing to consent to, so no proposal row');
    const events = auditEvents(db);
    assert.equal(events.length, 1);
    assert.equal(events[0].eventType, 'ACTION_EXECUTED');
    assert.equal(events[0].actor, 'agent');
  });

  test('COMPARE_OFFERS returns the ranked offers', async () => {
    const { executor } = makeExecutor({ account: baseAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] }) });
    const result = await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'COMPARE_OFFERS', params: {}, proposedBy: 'patient' });
    assert.equal(result.result.rankedOffers[0].offerId, 'off-a');
    assert.equal(result.result.rankedOffers[0].recommended, true);
  });

  test('a consent action is stored awaiting the patient, with a 30-minute expiry', async () => {
    const { executor, db } = makeExecutor();
    const result = await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' }, proposedBy: 'agent' });
    assert.equal(result.status, 'awaiting_consent');
    assert.equal(result.proposalId, 'prop-1');
    assert.equal(PROPOSAL_TTL_MINUTES, 30);
    assert.equal(new Date(result.expiresAt).getTime(), NOW.getTime() + 30 * 60 * 1000);
    assert.match(result.consentText, /R1,200\.00/);
    const stored = db.proposals.get('prop-1');
    assert.equal(stored.action_type, 'MAKE_PAYMENT');
    assert.equal(stored.user_id, USER);
    assert.equal(stored.params.totalDueCents, 120000);
    assert.equal(stored.proposed_by, 'agent');
    assert.equal(auditEvents(db)[0].eventType, 'ACTION_PROPOSED');
    assert.equal(auditEvents(db)[0].actor, 'agent');
  });

  test('a team action is also stored for the patient to send, never lodged without a tap', async () => {
    const { executor, db } = makeExecutor();
    const result = await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'REQUEST_PAYMENT_DATE_CHANGE', params: { preferredDay: 25 }, proposedBy: 'agent' });
    assert.equal(result.status, 'awaiting_consent');
    assert.equal(result.authority, 'human_review');
    assert.equal(writes(db, 'manual_review_queue').length, 0);
  });

  test('a prohibited action is refused with where to go instead, and the refusal is logged', async () => {
    const { executor, db } = makeExecutor();
    const result = await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'UPDATE_BANKING_DETAILS', params: {}, proposedBy: 'agent' });
    assert.equal(result.status, 'refused');
    assert.equal(result.httpStatus, 403);
    assert.match(result.redirect, /dashboard\.html/);
    assert.equal(auditEvents(db)[0].eventType, 'ACTION_REFUSED');
  });

  test('an invalid action is refused with 400 and nothing stored', async () => {
    const { executor, db } = makeExecutor();
    const result = await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'MAKE_PAYMENT', params: { paymentId: 'nope' }, proposedBy: 'patient' });
    assert.equal(result.status, 'refused');
    assert.equal(result.httpStatus, 400);
    assert.equal(result.reason, 'PAYMENT_NOT_DUE');
    assert.equal(writes(db, 'care_agent_action_proposals').length, 0);
  });

  test('proposedBy is limited to agent or patient', async () => {
    const { executor, db } = makeExecutor();
    await executor.propose({ sessionId: SESSION, userId: USER, actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' }, proposedBy: 'admin' });
    assert.equal(db.proposals.get('prop-1').proposed_by, 'patient');
  });
});

// ─────────────────────────────────────────────
// confirm
// ─────────────────────────────────────────────
describe('confirm', () => {
  async function proposed(actionType, params, options = {}) {
    const ctx = makeExecutor(options);
    const p = await ctx.executor.propose({ sessionId: SESSION, userId: USER, actionType, params, proposedBy: 'agent' });
    return { ...ctx, proposalId: p.proposalId };
  }

  test('requires explicit consent', async () => {
    const { executor, proposalId, spies } = await proposed('MAKE_PAYMENT', { paymentId: 'pay-4' });
    const result = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: 'yes' });
    assert.equal(result.status, 'consent_required');
    assert.equal(result.httpStatus, 400);
    assert.equal(spies.processPayment.length, 0);
  });

  test('MAKE_PAYMENT: pays through the shared plan-payment service, closes the case, keeps the promise, notifies', async () => {
    const { executor, proposalId, spies, db } = await proposed('MAKE_PAYMENT', { paymentId: 'pay-4' });
    const result = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });

    assert.equal(result.status, 'executed');
    assert.equal(result.httpStatus, 200);
    assert.deepEqual(spies.processPayment, [{ paymentId: 'pay-4', userId: USER, paymentMethod: 'care_agent' }]);

    const collectionUpdate = writes(db, 'collections')[0];
    assert.match(collectionUpdate.sql, /status = 'resolved'/);
    assert.match(collectionUpdate.sql, /resolution_type = 'paid'/);
    assert.deepEqual(collectionUpdate.params, ['pay-4', USER]);
    assert.match(writes(db, 'promise_to_pay')[0].sql, /status = 'kept'/);
    assert.equal(writes(db, 'notifications').length, 1);
    assert.equal(db.proposals.get(proposalId).status, 'executed');
    const confirmed = auditEvents(db).find((e) => e.eventType === 'ACTION_EXECUTED');
    assert.equal(confirmed.actor, 'patient');
  });

  test('a second confirm of the same proposal does nothing (no double charge)', async () => {
    const { executor, proposalId, spies } = await proposed('MAKE_PAYMENT', { paymentId: 'pay-4' });
    await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });
    const again = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });
    assert.equal(again.status, 'already_decided');
    assert.equal(again.httpStatus, 409);
    assert.equal(spies.processPayment.length, 1);
  });

  test("another user's proposal is not found", async () => {
    const { executor, proposalId } = await proposed('MAKE_PAYMENT', { paymentId: 'pay-4' });
    const result = await executor.confirm({ sessionId: SESSION, userId: 'user-2', proposalId, consent: true });
    assert.equal(result.status, 'not_found');
    assert.equal(result.httpStatus, 404);
  });

  test('an expired proposal is not executed', async () => {
    let clock = NOW;
    const ctx = makeExecutor({ now: () => clock });
    const p = await ctx.executor.propose({ sessionId: SESSION, userId: USER, actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' }, proposedBy: 'agent' });
    clock = new Date(NOW.getTime() + 31 * 60 * 1000);
    const result = await ctx.executor.confirm({ sessionId: SESSION, userId: USER, proposalId: p.proposalId, consent: true });
    assert.equal(result.status, 'expired');
    assert.equal(result.httpStatus, 410);
    assert.equal(ctx.spies.processPayment.length, 0);
    assert.equal(ctx.db.proposals.get(p.proposalId).status, 'expired');
  });

  test('re-checks live data: an instalment paid elsewhere since the proposal is refused', async () => {
    const ctx = await proposed('MAKE_PAYMENT', { paymentId: 'pay-4' });
    ctx.setAccount(baseAccount({ instalments: [], collections: [] }));
    const result = await ctx.executor.confirm({ sessionId: SESSION, userId: USER, proposalId: ctx.proposalId, consent: true });
    assert.equal(result.status, 'refused');
    assert.equal(result.reason, 'PAYMENT_NOT_DUE');
    assert.equal(ctx.spies.processPayment.length, 0);
    assert.ok(auditEvents(ctx.db).some((e) => e.eventType === 'ACTION_REFUSED_ON_RECHECK'));
  });

  test('re-checks live data: an amount that changed since the patient agreed needs fresh consent', async () => {
    const ctx = await proposed('MAKE_PAYMENT', { paymentId: 'pay-4' });
    // A late fee now applies (35 days overdue), so the total is no longer what was agreed.
    ctx.setAccount(baseAccount({ instalments: [{ paymentId: 'pay-4', planId: 'plan-1', paymentNumber: 4, amountCents: 120000, dueDate: addDays(TODAY, -35), status: 'overdue' }] }));
    const result = await ctx.executor.confirm({ sessionId: SESSION, userId: USER, proposalId: ctx.proposalId, consent: true });
    assert.equal(result.status, 'refused');
    assert.equal(result.reason, 'AMOUNT_CHANGED');
    assert.equal(ctx.spies.processPayment.length, 0);
  });

  test('ACCEPT_OFFER: calls the marketplace acceptOffer for this user and notifies', async () => {
    const { executor, proposalId, spies, db } = await proposed('ACCEPT_OFFER', { offerId: 'off-a' }, {
      account: baseAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] }),
    });
    const result = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });
    assert.equal(result.status, 'executed');
    assert.deepEqual(spies.acceptOffer, [{ offerId: 'off-a', userId: USER }]);
    assert.deepEqual(result.result, { loanId: 'loan-1' });
    assert.equal(writes(db, 'notifications').length, 1);
  });

  test('a backend failure marks the proposal failed and passes the status code through', async () => {
    const err = new Error('Application already has a selected offer');
    err.statusCode = 409;
    const { executor, proposalId, db } = await proposed('ACCEPT_OFFER', { offerId: 'off-a' }, {
      account: baseAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] }),
      acceptOffer: async () => { throw err; },
    });
    const result = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });
    assert.equal(result.status, 'failed');
    assert.equal(result.httpStatus, 409);
    assert.equal(result.message, 'Application already has a selected offer');
    assert.equal(db.proposals.get(proposalId).status, 'failed');
    assert.ok(auditEvents(db).some((e) => e.eventType === 'ACTION_FAILED'));
  });

  test('PROMISE_TO_PAY: records the promise, logs a collection action, moves the case to in_progress', async () => {
    const { executor, proposalId, db } = await proposed('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, 7) });
    const result = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });
    assert.equal(result.status, 'executed');

    const promise = writes(db, 'promise_to_pay')[0];
    assert.deepEqual(promise.params, ['col-1', 120000, addDays(TODAY, 7)]);
    const action = writes(db, 'collection_actions')[0];
    assert.equal(action.params[0], 'col-1');
    const caseUpdate = writes(db, 'collections')[0];
    assert.match(caseUpdate.sql, /status = 'in_progress'/);
    assert.deepEqual(caseUpdate.params, ['col-1', USER, addDays(TODAY, 7)]);
  });

  test('a team request opens a review-queue case and a patient-visible request, then reports "lodged"', async () => {
    const { executor, proposalId, db } = await proposed('REPORT_HARDSHIP', { reason: 'Lost my job last week' });
    const result = await executor.confirm({ sessionId: SESSION, userId: USER, proposalId, consent: true });
    assert.equal(result.status, 'lodged');
    assert.equal(result.result.requestId, 'req-9');
    assert.equal(result.result.reviewQueueId, 77);

    const queue = writes(db, 'manual_review_queue')[0];
    assert.deepEqual(queue.params.slice(0, 3), ['CARE_AGENT_REPORT_HARDSHIP', 'HIGH', 8]);
    const request = writes(db, 'care_agent_manage_requests')[0];
    assert.equal(request.params[0], SESSION);
    assert.equal(request.params[1], 'REPORT_HARDSHIP');
    assert.equal(request.params[2], 'Lost my job last week');
    assert.equal(request.params[4], 77);
    assert.equal(db.proposals.get(proposalId).status, 'lodged');
    assert.ok(auditEvents(db).some((e) => e.eventType === 'REQUEST_LODGED'));
    assert.doesNotMatch(result.message, /approved/i);
  });
});

// ─────────────────────────────────────────────
// decline
// ─────────────────────────────────────────────
describe('decline', () => {
  test('marks the proposal declined and logs it; nothing executes', async () => {
    const ctx = makeExecutor();
    const p = await ctx.executor.propose({ sessionId: SESSION, userId: USER, actionType: 'MAKE_PAYMENT', params: { paymentId: 'pay-4' }, proposedBy: 'agent' });
    const result = await ctx.executor.decline({ sessionId: SESSION, userId: USER, proposalId: p.proposalId });
    assert.equal(result.status, 'declined');
    assert.equal(ctx.db.proposals.get(p.proposalId).status, 'declined');
    assert.ok(auditEvents(ctx.db).some((e) => e.eventType === 'ACTION_DECLINED' && e.actor === 'patient'));
    const after = await ctx.executor.confirm({ sessionId: SESSION, userId: USER, proposalId: p.proposalId, consent: true });
    assert.equal(after.status, 'already_decided');
    assert.equal(ctx.spies.processPayment.length, 0);
  });
});

// ─────────────────────────────────────────────
// agent decisions and the timeline
// ─────────────────────────────────────────────
describe('recordAgentDecisions', () => {
  test('writes the decisions with their reason codes as one AGENT_DECISION row by the agent', async () => {
    const { executor, db } = makeExecutor();
    const result = await executor.recordAgentDecisions({ sessionId: SESSION, userId: USER });
    assert.equal(result.journeyStage, 'recover');
    const event = auditEvents(db)[0];
    assert.equal(event.eventType, 'AGENT_DECISION');
    assert.equal(event.actor, 'agent');
    assert.deepEqual(event.payload.reasonCodes, ['SELF_CURE']);
    assert.equal(event.payload.journeyStage, 'recover');
  });
});

describe('describeAuditEvent', () => {
  test('turns an audit row into a plain timeline line tagged by who acted', () => {
    const line = describeAuditEvent({
      event_type: 'AGENT_DECISION', actor: 'agent', created_at: '2026-10-27T09:02:00Z',
      payload: { decisions: [{ reasonCode: 'SELF_CURE', rationale: 'Under 30 days you can sort it out yourself.' }] },
    });
    assert.equal(line.actor, 'agent');
    assert.equal(line.tier, 'Agent');
    assert.match(line.text, /SELF_CURE/);
  });

  test('labels a refused action as blocked', () => {
    const line = describeAuditEvent({ event_type: 'ACTION_REFUSED', actor: 'agent', created_at: NOW, payload: { actionType: 'UPDATE_BANKING_DETAILS', message: 'Not in chat' } });
    assert.equal(line.tier, 'Blocked');
  });

  test('labels a lodged request as the team', () => {
    const line = describeAuditEvent({ event_type: 'REQUEST_LODGED', actor: 'patient', created_at: NOW, payload: { actionType: 'REQUEST_PAYMENT_DATE_CHANGE' } });
    assert.equal(line.tier, 'Team');
    assert.match(line.text, /Move my payment date/);
  });

  test('labels a patient confirmation as You', () => {
    const line = describeAuditEvent({ event_type: 'ACTION_EXECUTED', actor: 'patient', created_at: NOW, payload: { actionType: 'MAKE_PAYMENT' } });
    assert.equal(line.tier, 'You');
  });
});
