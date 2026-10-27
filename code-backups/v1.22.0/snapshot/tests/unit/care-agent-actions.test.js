/**
 * Unit Tests — Care Agent governed action layer (care-agent-actions.service.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The service is the Care Agent's rulebook for everything after an
 * application is submitted: which actions exist, who is allowed to perform
 * each one (the authority tier), what the agent recommends next for a given
 * account (the decision rules), and whether a proposed action is valid
 * against live account data. Pure: no database, no network.
 *
 * Run: node --test tests/unit/care-agent-actions.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTHORITY,
  ACTION_REGISTRY,
  JOURNEY_STAGES,
  describeAuthority,
  daysOverdueFor,
  deriveJourneyStage,
  rankOffers,
  decideNextBestActions,
  evaluateProposal,
  detectAccountIntent,
  suggestParamsFor,
  containsBankingDetails,
  MAX_PROMISE_HORIZON_DAYS,
} = require('../../backend/src/services/care-agent-actions.service');
const { HUMAN_REVIEW_THRESHOLD_DAYS, RESOLUTION_THRESHOLD_DAYS } = require('../../backend/src/services/recovery-engine.service');

const TODAY = '2026-10-27';

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function emptyAccount(overrides = {}) {
  return {
    today: TODAY,
    applications: [],
    plans: [],
    instalments: [],
    collections: [],
    promises: [],
    openRequests: [],
    ...overrides,
  };
}

function activePlan(overrides = {}) {
  return {
    planId: 'plan-1',
    status: 'active',
    totalAmountCents: 720000,
    outstandingBalanceCents: 360000,
    monthlyAmountCents: 120000,
    paymentsMade: 3,
    numberOfPayments: 6,
    ...overrides,
  };
}

function instalment(overrides = {}) {
  return {
    paymentId: 'pay-4',
    planId: 'plan-1',
    paymentNumber: 4,
    amountCents: 120000,
    dueDate: addDays(TODAY, 20),
    status: 'scheduled',
    ...overrides,
  };
}

function overdueAccount(days, extra = {}) {
  return emptyAccount({
    plans: [activePlan()],
    instalments: [instalment({ dueDate: addDays(TODAY, -days), status: 'overdue' })],
    collections: [{ collectionId: 'col-1', paymentId: 'pay-4', amountOutstandingCents: 120000, daysOverdue: days, status: 'open' }],
    ...extra,
  });
}

const OFFERS = [
  { offerId: 'off-b', lenderName: 'CareCapital', monthlyPaymentCents: 126000, totalRepayableCents: 756000, termMonths: 6 },
  { offerId: 'off-a', lenderName: 'MediFinance SA', monthlyPaymentCents: 124800, totalRepayableCents: 748800, termMonths: 6 },
  { offerId: 'off-c', lenderName: 'HealthCredit', monthlyPaymentCents: 66000, totalRepayableCents: 792000, termMonths: 12 },
];

function actionTypes(result) {
  return result.actions.map((a) => a.actionType);
}

function reasonCodes(result) {
  return result.decisions.map((d) => d.reasonCode);
}

// ─────────────────────────────────────────────
// Registry and authority tiers
// ─────────────────────────────────────────────
describe('ACTION_REGISTRY — every action has exactly one authority tier', () => {
  test('defines the four tiers', () => {
    assert.deepEqual(
      Object.values(AUTHORITY).sort(),
      ['autonomous', 'human_review', 'patient_consent', 'prohibited']
    );
  });

  test('every registered action has a known tier, a journey stage and a patient-facing label', () => {
    for (const [type, def] of Object.entries(ACTION_REGISTRY)) {
      assert.ok(Object.values(AUTHORITY).includes(def.authority), `${type} has a valid tier`);
      assert.ok(JOURNEY_STAGES.includes(def.stage), `${type} has a valid stage`);
      assert.equal(typeof def.label, 'string');
      assert.ok(def.label.length > 0);
    }
  });

  test('read-only actions are the only autonomous ones', () => {
    const autonomous = Object.entries(ACTION_REGISTRY)
      .filter(([, def]) => def.authority === AUTHORITY.AUTONOMOUS)
      .map(([type]) => type)
      .sort();
    assert.deepEqual(autonomous, ['COMPARE_OFFERS', 'EXPLAIN_FEE', 'START_CARE_REQUEST', 'VIEW_ACCOUNT']);
  });

  test('money-moving and commitment actions need patient consent', () => {
    for (const type of ['ACCEPT_OFFER', 'MAKE_PAYMENT', 'PROMISE_TO_PAY']) {
      assert.equal(ACTION_REGISTRY[type].authority, AUTHORITY.PATIENT_CONSENT, type);
    }
  });

  test('anything that changes plan terms goes to a person', () => {
    for (const type of ['REQUEST_PAYMENT_DATE_CHANGE', 'REQUEST_RESTRUCTURE', 'REPORT_HARDSHIP', 'DISPUTE_CHARGE', 'REQUEST_PLAN_ADJUSTMENT', 'REQUEST_CANCELLATION']) {
      assert.equal(ACTION_REGISTRY[type].authority, AUTHORITY.HUMAN_REVIEW, type);
      assert.ok(Number.isInteger(ACTION_REGISTRY[type].slaHours), `${type} has an SLA`);
    }
  });

  test('hardship is reviewed faster than a date change', () => {
    assert.ok(ACTION_REGISTRY.REPORT_HARDSHIP.slaHours < ACTION_REGISTRY.REQUEST_PAYMENT_DATE_CHANGE.slaHours);
    assert.equal(ACTION_REGISTRY.REPORT_HARDSHIP.priority, 'HIGH');
  });

  test('banking changes and amount changes are never done in chat, and banking points to the secure form', () => {
    assert.equal(ACTION_REGISTRY.UPDATE_BANKING_DETAILS.authority, AUTHORITY.PROHIBITED);
    assert.equal(ACTION_REGISTRY.CHANGE_AMOUNT_OWED.authority, AUTHORITY.PROHIBITED);
    assert.equal(ACTION_REGISTRY.WRITE_OFF.authority, AUTHORITY.PROHIBITED);
    assert.match(ACTION_REGISTRY.UPDATE_BANKING_DETAILS.redirect, /dashboard\.html/);
  });

  test('the registry cannot be changed at runtime', () => {
    assert.ok(Object.isFrozen(ACTION_REGISTRY));
    assert.ok(Object.isFrozen(ACTION_REGISTRY.MAKE_PAYMENT));
  });

  test('describeAuthority gives the plain label shown on every badge', () => {
    assert.equal(describeAuthority(AUTHORITY.AUTONOMOUS), 'Agent does it');
    assert.equal(describeAuthority(AUTHORITY.PATIENT_CONSENT), 'You approve');
    assert.equal(describeAuthority(AUTHORITY.HUMAN_REVIEW), 'Team decides');
    assert.equal(describeAuthority(AUTHORITY.PROHIBITED), 'Not in chat');
  });
});

// ─────────────────────────────────────────────
// Journey stage
// ─────────────────────────────────────────────
describe('deriveJourneyStage', () => {
  test('lists the ten value-chain steps in order', () => {
    assert.deepEqual(JOURNEY_STAGES, ['ask', 'understand', 'plan', 'apply', 'choose_offer', 'treatment', 'repay', 'change', 'recover', 'close']);
  });

  test('no activity is "ask"', () => {
    assert.equal(deriveJourneyStage(emptyAccount()), 'ask');
  });

  test('a submitted application without offers is "apply"', () => {
    assert.equal(deriveJourneyStage(emptyAccount({ applications: [{ applicationId: 'app-1', status: 'PENDING', pendingOffers: [] }] })), 'apply');
  });

  test('pending offers is "choose_offer"', () => {
    assert.equal(deriveJourneyStage(emptyAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] })), 'choose_offer');
  });

  test('an active plan with nothing overdue is "repay"', () => {
    assert.equal(deriveJourneyStage(emptyAccount({ plans: [activePlan()], instalments: [instalment()] })), 'repay');
  });

  test('any overdue instalment is "recover", even with offers pending', () => {
    const account = overdueAccount(5, { applications: [{ applicationId: 'app-2', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] });
    assert.equal(deriveJourneyStage(account), 'recover');
  });

  test('only completed plans is "close"', () => {
    assert.equal(deriveJourneyStage(emptyAccount({ plans: [activePlan({ status: 'completed', outstandingBalanceCents: 0 })] })), 'close');
  });
});

describe('daysOverdueFor', () => {
  test('counts whole days past the due date', () => {
    assert.equal(daysOverdueFor({ dueDate: addDays(TODAY, -12) }, TODAY), 12);
  });

  test('is 0 for an instalment not yet due or due today', () => {
    assert.equal(daysOverdueFor({ dueDate: addDays(TODAY, 3) }, TODAY), 0);
    assert.equal(daysOverdueFor({ dueDate: TODAY }, TODAY), 0);
  });
});

// ─────────────────────────────────────────────
// Offer ranking
// ─────────────────────────────────────────────
describe('rankOffers', () => {
  test('orders by total to repay, lowest first, and marks only the first as recommended', () => {
    const ranked = rankOffers(OFFERS);
    assert.deepEqual(ranked.map((o) => o.offerId), ['off-a', 'off-b', 'off-c']);
    assert.deepEqual(ranked.map((o) => o.rank), [1, 2, 3]);
    assert.deepEqual(ranked.map((o) => o.recommended), [true, false, false]);
  });

  test('breaks a tie on total with the shorter term', () => {
    const ranked = rankOffers([
      { offerId: 'long', totalRepayableCents: 500000, termMonths: 12 },
      { offerId: 'short', totalRepayableCents: 500000, termMonths: 6 },
    ]);
    assert.equal(ranked[0].offerId, 'short');
  });

  test('does not mutate its input', () => {
    const input = OFFERS.map((o) => ({ ...o }));
    rankOffers(input);
    assert.equal(input[0].offerId, 'off-b');
    assert.equal(input[0].rank, undefined);
  });
});

// ─────────────────────────────────────────────
// Decision rules
// ─────────────────────────────────────────────
describe('decideNextBestActions — the agent\'s decisions', () => {
  test('NO_ACCOUNT: offers to start a care request', () => {
    const result = decideNextBestActions(emptyAccount());
    assert.equal(result.journeyStage, 'ask');
    assert.deepEqual(reasonCodes(result), ['NO_ACCOUNT']);
    assert.deepEqual(actionTypes(result), ['START_CARE_REQUEST']);
  });

  test('every decision carries a plain-language rationale', () => {
    const result = decideNextBestActions(overdueAccount(12));
    for (const decision of result.decisions) {
      assert.equal(typeof decision.rationale, 'string');
      assert.ok(decision.rationale.length > 10);
    }
  });

  test('every recommended action carries its authority tier and the reason code that produced it', () => {
    const result = decideNextBestActions(overdueAccount(12));
    for (const action of result.actions) {
      assert.equal(action.authority, ACTION_REGISTRY[action.actionType].authority);
      assert.ok(reasonCodes(result).includes(action.reasonCode));
    }
  });

  test('OFFERS_AWAITING: compare (agent) and accept the lowest-cost offer (patient)', () => {
    const result = decideNextBestActions(emptyAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] }));
    assert.ok(reasonCodes(result).includes('OFFERS_AWAITING'));
    assert.deepEqual(actionTypes(result), ['COMPARE_OFFERS', 'ACCEPT_OFFER']);
    assert.equal(result.actions[1].params.offerId, 'off-a');
    assert.equal(result.rankedOffers[0].offerId, 'off-a');
  });

  test('SELF_CURE under 30 days: pay, promise, or report hardship; no restructure yet', () => {
    const result = decideNextBestActions(overdueAccount(12));
    assert.equal(result.journeyStage, 'recover');
    assert.ok(reasonCodes(result).includes('SELF_CURE'));
    assert.deepEqual(actionTypes(result), ['MAKE_PAYMENT', 'PROMISE_TO_PAY', 'REPORT_HARDSHIP']);
    assert.equal(result.actions[0].params.paymentId, 'pay-4');
    assert.equal(result.actions[0].primary, true);
  });

  test(`HUMAN_GATE from day ${HUMAN_REVIEW_THRESHOLD_DAYS}: restructure is offered, via the team`, () => {
    const result = decideNextBestActions(overdueAccount(HUMAN_REVIEW_THRESHOLD_DAYS));
    assert.ok(reasonCodes(result).includes('HUMAN_GATE'));
    assert.deepEqual(actionTypes(result), ['MAKE_PAYMENT', 'PROMISE_TO_PAY', 'REQUEST_RESTRUCTURE', 'REPORT_HARDSHIP']);
  });

  test(`RESOLUTION from day ${RESOLUTION_THRESHOLD_DAYS}: no new promise to pay`, () => {
    const result = decideNextBestActions(overdueAccount(RESOLUTION_THRESHOLD_DAYS));
    assert.ok(reasonCodes(result).includes('RESOLUTION'));
    assert.ok(!actionTypes(result).includes('PROMISE_TO_PAY'));
    assert.deepEqual(actionTypes(result), ['MAKE_PAYMENT', 'REQUEST_RESTRUCTURE', 'REPORT_HARDSHIP']);
  });

  test('PROMISE_ACTIVE: a kept-alive promise stops the agent asking for another', () => {
    const account = overdueAccount(12, {
      promises: [{ promiseId: 'pr-1', collectionId: 'col-1', promisedAmountCents: 120000, promisedDate: addDays(TODAY, 4), status: 'pending' }],
    });
    const result = decideNextBestActions(account);
    assert.ok(reasonCodes(result).includes('PROMISE_ACTIVE'));
    assert.ok(!actionTypes(result).includes('PROMISE_TO_PAY'));
    assert.ok(actionTypes(result).includes('MAKE_PAYMENT'));
  });

  test('a promise whose date has passed no longer counts as active', () => {
    const account = overdueAccount(12, {
      promises: [{ promiseId: 'pr-1', collectionId: 'col-1', promisedAmountCents: 120000, promisedDate: addDays(TODAY, -1), status: 'pending' }],
    });
    assert.ok(!reasonCodes(decideNextBestActions(account)).includes('PROMISE_ACTIVE'));
  });

  test('HARDSHIP_REVIEW: an open hardship request suppresses every payment prompt', () => {
    const account = overdueAccount(40, {
      openRequests: [{ requestId: 'req-1', requestType: 'REPORT_HARDSHIP', status: 'OPEN' }],
    });
    const result = decideNextBestActions(account);
    assert.ok(reasonCodes(result).includes('HARDSHIP_REVIEW'));
    for (const type of ['MAKE_PAYMENT', 'PROMISE_TO_PAY', 'REQUEST_RESTRUCTURE']) {
      assert.ok(!actionTypes(result).includes(type), `${type} must not be suggested during hardship review`);
    }
  });

  test('DUE_SOON: an instalment due within 5 days suggests paying early or moving the date', () => {
    const account = emptyAccount({ plans: [activePlan()], instalments: [instalment({ dueDate: addDays(TODAY, 5) })] });
    const result = decideNextBestActions(account);
    assert.ok(reasonCodes(result).includes('DUE_SOON'));
    assert.deepEqual(actionTypes(result), ['MAKE_PAYMENT', 'REQUEST_PAYMENT_DATE_CHANGE']);
  });

  test('ON_TRACK: nothing due soon offers the schedule and a date change only', () => {
    const account = emptyAccount({ plans: [activePlan()], instalments: [instalment({ dueDate: addDays(TODAY, 20) })] });
    const result = decideNextBestActions(account);
    assert.ok(reasonCodes(result).includes('ON_TRACK'));
    assert.deepEqual(actionTypes(result), ['VIEW_ACCOUNT', 'REQUEST_PAYMENT_DATE_CHANGE']);
  });

  test('PLAN_COMPLETE: offers a new care request', () => {
    const result = decideNextBestActions(emptyAccount({ plans: [activePlan({ status: 'completed', outstandingBalanceCents: 0 })] }));
    assert.ok(reasonCodes(result).includes('PLAN_COMPLETE'));
    assert.deepEqual(actionTypes(result), ['START_CARE_REQUEST']);
  });

  test('REQUEST_PENDING: an open request with the team is reported, never as approved', () => {
    const account = emptyAccount({
      plans: [activePlan()],
      instalments: [instalment()],
      openRequests: [{ requestId: 'req-1', requestType: 'REQUEST_PAYMENT_DATE_CHANGE', status: 'OPEN' }],
    });
    const result = decideNextBestActions(account);
    const pending = result.decisions.find((d) => d.reasonCode === 'REQUEST_PENDING');
    assert.ok(pending);
    assert.doesNotMatch(pending.rationale, /approved/i);
  });

  test('does not suggest a date change that is already with the team', () => {
    const account = emptyAccount({
      plans: [activePlan()],
      instalments: [instalment()],
      openRequests: [{ requestId: 'req-1', requestType: 'REQUEST_PAYMENT_DATE_CHANGE', status: 'OPEN' }],
    });
    assert.ok(!actionTypes(decideNextBestActions(account)).includes('REQUEST_PAYMENT_DATE_CHANGE'));
  });
});

// ─────────────────────────────────────────────
// Proposal validation
// ─────────────────────────────────────────────
describe('evaluateProposal — validates every proposed action against live data', () => {
  test('refuses an unknown action', () => {
    const result = evaluateProposal('TRANSFER_FUNDS', {}, emptyAccount());
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'UNKNOWN_ACTION');
  });

  test('refuses a prohibited action and points to where it can be done', () => {
    const result = evaluateProposal('UPDATE_BANKING_DETAILS', {}, emptyAccount({ plans: [activePlan()] }));
    assert.equal(result.ok, false);
    assert.equal(result.authority, AUTHORITY.PROHIBITED);
    assert.equal(result.reason, 'NOT_IN_CHAT');
    assert.match(result.redirect, /dashboard\.html/);
  });

  test('ACCEPT_OFFER: only an offer that is still pending on this account', () => {
    const account = emptyAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] });
    const ok = evaluateProposal('ACCEPT_OFFER', { offerId: 'off-a' }, account);
    assert.equal(ok.ok, true);
    assert.equal(ok.authority, AUTHORITY.PATIENT_CONSENT);
    assert.match(ok.consentText, /MediFinance SA/);
    assert.match(ok.effect, /declined/i);

    const gone = evaluateProposal('ACCEPT_OFFER', { offerId: 'off-zzz' }, account);
    assert.equal(gone.ok, false);
    assert.equal(gone.reason, 'OFFER_NOT_AVAILABLE');
  });

  test('MAKE_PAYMENT: amount comes from PaySick, never from params', () => {
    const account = emptyAccount({ plans: [activePlan()], instalments: [instalment()] });
    const result = evaluateProposal('MAKE_PAYMENT', { paymentId: 'pay-4', amountCents: 1 }, account);
    assert.equal(result.ok, true);
    assert.equal(result.params.amountCents, 120000);
    assert.equal(result.params.lateFeeCents, 0);
    assert.equal(result.params.totalDueCents, 120000);
    assert.match(result.consentText, /R1,200\.00/);
  });

  test('MAKE_PAYMENT: applies the 5%-per-full-month late fee from fee.service.js', () => {
    const account = overdueAccount(35);
    const result = evaluateProposal('MAKE_PAYMENT', { paymentId: 'pay-4' }, account);
    assert.equal(result.ok, true);
    assert.equal(result.params.lateFeeCents, 6000);
    assert.equal(result.params.totalDueCents, 126000);
  });

  test('MAKE_PAYMENT: refuses an instalment that is not owed on this account', () => {
    const result = evaluateProposal('MAKE_PAYMENT', { paymentId: 'someone-elses' }, emptyAccount({ plans: [activePlan()], instalments: [instalment()] }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'PAYMENT_NOT_DUE');
  });

  test('PROMISE_TO_PAY: accepts a date within the horizon for an open case', () => {
    const result = evaluateProposal('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, 7) }, overdueAccount(12));
    assert.equal(result.ok, true);
    assert.equal(result.params.collectionId, 'col-1');
    assert.equal(result.params.promisedAmountCents, 120000);
    assert.equal(result.params.promisedDate, addDays(TODAY, 7));
  });

  test('PROMISE_TO_PAY: refuses a past date, an amount over what is owed, or a date beyond the horizon', () => {
    const account = overdueAccount(12);
    assert.equal(evaluateProposal('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, -2) }, account).reason, 'INVALID_PROMISE');
    assert.equal(evaluateProposal('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, 3), promisedAmountCents: 999999 }, account).reason, 'INVALID_PROMISE');
    assert.equal(evaluateProposal('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, MAX_PROMISE_HORIZON_DAYS + 1) }, account).reason, 'INVALID_PROMISE');
  });

  test('PROMISE_TO_PAY: refuses when there is no open collection case', () => {
    const account = emptyAccount({ plans: [activePlan()], instalments: [instalment()] });
    assert.equal(evaluateProposal('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, 3) }, account).reason, 'NO_OPEN_CASE');
  });

  test(`PROMISE_TO_PAY: refuses from day ${RESOLUTION_THRESHOLD_DAYS}, when only a person can resolve the case`, () => {
    const result = evaluateProposal('PROMISE_TO_PAY', { paymentId: 'pay-4', promisedDate: addDays(TODAY, 3) }, overdueAccount(RESOLUTION_THRESHOLD_DAYS));
    assert.equal(result.reason, 'PROMISE_NOT_ELIGIBLE');
  });

  test('REQUEST_PAYMENT_DATE_CHANGE: needs a day between 1 and 28 and an active plan', () => {
    const account = emptyAccount({ plans: [activePlan()], instalments: [instalment()] });
    const ok = evaluateProposal('REQUEST_PAYMENT_DATE_CHANGE', { preferredDay: 25, reason: 'Salary moved to the 25th' }, account);
    assert.equal(ok.ok, true);
    assert.equal(ok.authority, AUTHORITY.HUMAN_REVIEW);
    assert.equal(ok.slaHours, 24);
    assert.match(ok.effect, /until someone approves/i);
    assert.equal(evaluateProposal('REQUEST_PAYMENT_DATE_CHANGE', { preferredDay: 31 }, account).reason, 'INVALID_PARAMS');
    assert.equal(evaluateProposal('REQUEST_PAYMENT_DATE_CHANGE', { preferredDay: 25 }, emptyAccount()).reason, 'NO_ACTIVE_PLAN');
  });

  test('REQUEST_RESTRUCTURE: previews the new instalment with buildRestructureOffer', () => {
    const result = evaluateProposal('REQUEST_RESTRUCTURE', { newTermMonths: 6 }, overdueAccount(35));
    assert.equal(result.ok, true);
    assert.equal(result.params.preview.newTermMonths, 6);
    assert.equal(result.params.preview.newMonthlyAmountCents, Math.ceil((360000 + 6000) / 6));
    assert.equal(result.params.preview.withinCap, true);
  });

  test('REQUEST_RESTRUCTURE: refuses a term outside 1 to 24 months', () => {
    assert.equal(evaluateProposal('REQUEST_RESTRUCTURE', { newTermMonths: 0 }, overdueAccount(35)).reason, 'INVALID_PARAMS');
    assert.equal(evaluateProposal('REQUEST_RESTRUCTURE', { newTermMonths: 48 }, overdueAccount(35)).reason, 'INVALID_PARAMS');
  });

  test('free-text reasons are trimmed and capped', () => {
    const account = emptyAccount({ plans: [activePlan()] });
    const result = evaluateProposal('DISPUTE_CHARGE', { reason: `  ${'x'.repeat(900)}  ` }, account);
    assert.equal(result.ok, true);
    assert.ok(result.params.reason.length <= 500);
  });

  test('refuses a request whose text contains banking details, and says where to change them', () => {
    const account = emptyAccount({ plans: [activePlan()] });
    const result = evaluateProposal('REPORT_HARDSHIP', { reason: 'new account number 62123456789 branch code 250655' }, account);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'BANKING_DETAILS_IN_CHAT');
    assert.match(result.redirect, /dashboard\.html/);
  });

  test('read-only actions are always valid and autonomous', () => {
    const result = evaluateProposal('VIEW_ACCOUNT', {}, emptyAccount());
    assert.equal(result.ok, true);
    assert.equal(result.authority, AUTHORITY.AUTONOMOUS);
  });
});

describe('containsBankingDetails', () => {
  test('detects account numbers and banking phrases', () => {
    assert.equal(containsBankingDetails('my account number is 1234567890'), true);
    assert.equal(containsBankingDetails('branch code 250655'), true);
    assert.equal(containsBankingDetails('62123456789'), true);
  });

  test('does not flag ordinary amounts or dates', () => {
    assert.equal(containsBankingDetails('I can pay R1,200 on 2026-11-07'), false);
    assert.equal(containsBankingDetails('salary moved to the 25th'), false);
  });
});

// ─────────────────────────────────────────────
// Intent detection (deterministic fallback when no LLM is configured)
// ─────────────────────────────────────────────
describe('detectAccountIntent', () => {
  const cases = [
    ['I want to change my bank details', 'UPDATE_BANKING_DETAILS'],
    ['I lost my job and cannot afford this', 'REPORT_HARDSHIP'],
    ['can the debit order date move to the 25th?', 'REQUEST_PAYMENT_DATE_CHANGE'],
    ['can I spread it over a longer time', 'REQUEST_RESTRUCTURE'],
    ['I promise to pay on Friday when I get paid', 'PROMISE_TO_PAY'],
    ['I was charged the wrong amount, I want to dispute it', 'DISPUTE_CHARGE'],
    ['please cancel my plan', 'REQUEST_CANCELLATION'],
    ['show me the offers from the funders', 'COMPARE_OFFERS'],
    ['can I pay this month now?', 'MAKE_PAYMENT'],
    ["when's my next payment", 'VIEW_ACCOUNT'],
  ];
  for (const [message, expected] of cases) {
    test(`"${message}" -> ${expected}`, () => {
      assert.equal(detectAccountIntent(message), expected);
    });
  }

  test('returns null for a message about a new treatment', () => {
    assert.equal(detectAccountIntent('I need a knee replacement'), null);
  });
});

describe('suggestParamsFor', () => {
  test('MAKE_PAYMENT picks the earliest unpaid instalment', () => {
    const account = emptyAccount({
      plans: [activePlan()],
      instalments: [instalment({ paymentId: 'later', dueDate: addDays(TODAY, 30) }), instalment({ paymentId: 'sooner', dueDate: addDays(TODAY, 2) })],
    });
    assert.deepEqual(suggestParamsFor('MAKE_PAYMENT', account), { paymentId: 'sooner' });
  });

  test('ACCEPT_OFFER picks the recommended offer', () => {
    const account = emptyAccount({ applications: [{ applicationId: 'app-1', status: 'OFFERS_RECEIVED', pendingOffers: OFFERS }] });
    assert.deepEqual(suggestParamsFor('ACCEPT_OFFER', account), { offerId: 'off-a' });
  });

  test('PROMISE_TO_PAY picks the overdue instalment with an open case', () => {
    assert.deepEqual(suggestParamsFor('PROMISE_TO_PAY', overdueAccount(12)), { paymentId: 'pay-4' });
  });
});
