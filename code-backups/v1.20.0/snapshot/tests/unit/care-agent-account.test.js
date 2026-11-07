/**
 * Unit Tests — Care Agent account snapshot (care-agent-account.service.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * loadAccountSnapshot() reads everything the Care Agent's decision rules
 * need, for one patient, in one shape: plans, unpaid instalments, open
 * collection cases, pending promises, applications with live offers, funder
 * schedules and open requests with the team. Money is converted to integer
 * cents and dates to YYYY-MM-DD at this boundary, so the rules never see a
 * DECIMAL string or a Date object.
 *
 * `query` is injected, so these run under plain node --test with a fake.
 *
 * Run: node --test tests/unit/care-agent-account.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { loadAccountSnapshot, toIsoDate } = require('../../backend/src/services/care-agent-account.service');

const USER = 'user-1';
const TODAY = '2026-10-27';

/** Fake query: answers by the first table named in a FROM clause. */
function fakeQuery(tables, calls = []) {
  return async (sql, params) => {
    calls.push({ sql, params });
    const match = /FROM\s+(\w+)/i.exec(sql);
    const table = match ? match[1] : '';
    const answer = tables[table];
    if (answer instanceof Error) throw answer;
    return { rows: answer || [], rowCount: (answer || []).length };
  };
}

const FULL = {
  payment_plans: [
    { plan_id: 'plan-1', status: 'active', total_amount: '7200.00', monthly_amount: '1200.00', number_of_payments: 6, payments_made: 3, outstanding_balance: '3600.00' },
  ],
  payments: [
    { payment_id: 'pay-4', plan_id: 'plan-1', payment_number: 4, amount: '1200.00', due_date: new Date(2026, 9, 15), status: 'overdue' },
  ],
  collections: [
    { collection_id: 'col-1', payment_id: 'pay-4', amount_outstanding: '1200.00', days_overdue: 12, status: 'open' },
  ],
  promise_to_pay: [
    { promise_id: 'pr-1', collection_id: 'col-1', promised_amount_cents: 120000, promised_date: '2026-11-03', status: 'pending' },
  ],
  loan_applications: [
    { application_id: 'app-1', status: 'OFFERS_RECEIVED', offer_id: 'off-a', lender_name: 'MediFinance SA', monthly_payment: '1248.00', total_repayable: '7488.00', term: 6, interest_rate: '0.0400' },
    { application_id: 'app-1', status: 'OFFERS_RECEIVED', offer_id: 'off-b', lender_name: 'CareCapital', monthly_payment: '1260.00', total_repayable: '7560.00', term: 6, interest_rate: '0.0500' },
    { application_id: 'app-2', status: 'SUBMITTED', offer_id: null, lender_name: null, monthly_payment: null, total_repayable: null, term: null, interest_rate: null },
  ],
  marketplace_loans: [
    { loan_id: 'loan-1', lender_name: 'MediFinance SA', status: 'ACTIVE', next_amount: '1248.00', next_date: '2026-11-25' },
  ],
  care_agent_manage_requests: [
    { request_id: 'req-1', request_type: 'PAYMENT_DATE_CHANGE', status: 'OPEN', created_at: '2026-10-20T10:00:00Z' },
    { request_id: 'req-2', request_type: 'REPORT_HARDSHIP', status: 'OPEN', created_at: '2026-10-21T10:00:00Z' },
  ],
};

describe('loadAccountSnapshot', () => {
  test('converts plans to integer cents', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.deepEqual(snap.plans[0], {
      planId: 'plan-1',
      status: 'active',
      totalAmountCents: 720000,
      monthlyAmountCents: 120000,
      numberOfPayments: 6,
      paymentsMade: 3,
      outstandingBalanceCents: 360000,
    });
  });

  test('converts instalments to cents and a calendar date, never shifting the day', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.deepEqual(snap.instalments[0], {
      paymentId: 'pay-4', planId: 'plan-1', paymentNumber: 4, amountCents: 120000, dueDate: '2026-10-15', status: 'overdue',
    });
  });

  test('maps collections and promises', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.deepEqual(snap.collections[0], { collectionId: 'col-1', paymentId: 'pay-4', amountOutstandingCents: 120000, daysOverdue: 12, status: 'open' });
    assert.deepEqual(snap.promises[0], { promiseId: 'pr-1', collectionId: 'col-1', promisedAmountCents: 120000, promisedDate: '2026-11-03', status: 'pending' });
  });

  test('groups offer rows under their application and skips empty offer rows', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.equal(snap.applications.length, 2);
    const app1 = snap.applications.find((a) => a.applicationId === 'app-1');
    assert.equal(app1.pendingOffers.length, 2);
    assert.deepEqual(app1.pendingOffers[0], {
      offerId: 'off-a', lenderName: 'MediFinance SA', monthlyPaymentCents: 124800, totalRepayableCents: 748800, termMonths: 6, interestRate: 0.04,
    });
    assert.deepEqual(snap.applications.find((a) => a.applicationId === 'app-2').pendingOffers, []);
  });

  test('includes funder schedules for display', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.deepEqual(snap.funderPlans[0], { loanId: 'loan-1', lenderName: 'MediFinance SA', status: 'ACTIVE', nextAmountCents: 124800, nextDate: '2026-11-25' });
  });

  test('normalises the legacy PAYMENT_DATE_CHANGE request type to the registry action', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.deepEqual(snap.openRequests.map((r) => r.requestType), ['REQUEST_PAYMENT_DATE_CHANGE', 'REPORT_HARDSHIP']);
  });

  test('carries today through for the decision rules', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery(FULL), userId: USER, today: TODAY });
    assert.equal(snap.today, TODAY);
  });

  test("every query is scoped to the patient's own user id", async () => {
    const calls = [];
    await loadAccountSnapshot({ query: fakeQuery(FULL, calls), userId: USER, today: TODAY });
    assert.ok(calls.length >= 7);
    for (const call of calls) {
      assert.deepEqual(call.params, [USER], call.sql);
      assert.match(call.sql, /user_id = \$1/);
    }
  });

  test('a missing table (e.g. marketplace not set up) leaves that section empty and is reported', async () => {
    const tables = { ...FULL, loan_applications: new Error('relation "loan_applications" does not exist'), marketplace_loans: new Error('relation does not exist') };
    const snap = await loadAccountSnapshot({ query: fakeQuery(tables), userId: USER, today: TODAY });
    assert.deepEqual(snap.applications, []);
    assert.deepEqual(snap.funderPlans, []);
    assert.deepEqual(snap.unavailable.sort(), ['applications', 'funderPlans']);
    assert.equal(snap.plans.length, 1);
  });

  test('defaults today to the current date', async () => {
    const snap = await loadAccountSnapshot({ query: fakeQuery({}), userId: USER });
    assert.match(snap.today, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('toIsoDate', () => {
  test('keeps a YYYY-MM-DD string as is', () => {
    assert.equal(toIsoDate('2026-11-03'), '2026-11-03');
    assert.equal(toIsoDate('2026-11-03T22:00:00Z'), '2026-11-03');
  });

  test('reads a Date by its local calendar day', () => {
    assert.equal(toIsoDate(new Date(2026, 0, 5)), '2026-01-05');
  });

  test('returns null for nothing', () => {
    assert.equal(toIsoDate(null), null);
  });
});
