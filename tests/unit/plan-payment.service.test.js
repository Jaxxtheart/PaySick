/**
 * Unit Tests — shared plan-payment service (plan-payment.service.js)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The instalment-payment logic used to live inline in
 * routes/payments.js's POST /:payment_id/pay. The Care Agent now pays
 * instalments too (MAKE_PAYMENT), so the logic moves into one service both
 * callers use: one code path for money. These tests pin the exact query
 * sequence the route used, so tests/integration/payments.test.js's mocked
 * query order still holds after the route switches to the service.
 *
 * Run: node --test tests/unit/plan-payment.service.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createPlanPaymentService } = require('../../backend/src/services/plan-payment.service');

const DAY_MS = 24 * 60 * 60 * 1000;

function harness(paymentRow) {
  const calls = [];
  const clientCalls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: paymentRow ? [paymentRow] : [] };
  };
  const transaction = async (fn) => fn({
    query: async (sql, params) => {
      clientCalls.push({ sql, params });
      if (/INSERT INTO transactions/.test(sql) && /RETURNING/.test(sql)) {
        return { rows: [{ transaction_id: 'txn-1', amount: params[3] }] };
      }
      return { rows: [] };
    },
  });
  return { service: createPlanPaymentService({ query, transaction }), calls, clientCalls };
}

const NOW = Date.parse('2026-10-27T09:00:00Z');

function row(overrides = {}) {
  return {
    payment_id: 'pay-4',
    plan_id: 'plan-1',
    payment_number: 4,
    amount: '1200.00',
    due_date: new Date(NOW + 5 * DAY_MS),
    status: 'scheduled',
    total_paid: '3600.00',
    payments_made: 3,
    ...overrides,
  };
}

describe('createPlanPaymentService().processPayment', () => {
  test('looks the payment up scoped to the user', async () => {
    const { service, calls } = harness(row());
    await service.processPayment({ paymentId: 'pay-4', userId: 'user-1', now: NOW });
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /WHERE p\.payment_id = \$1 AND p\.user_id = \$2/);
    assert.deepEqual(calls[0].params, ['pay-4', 'user-1']);
  });

  test('throws 404 for a payment that is not the user\'s', async () => {
    const { service } = harness(null);
    await assert.rejects(service.processPayment({ paymentId: 'x', userId: 'user-1', now: NOW }), (err) => err.statusCode === 404 && err.message === 'Payment not found');
  });

  test('throws 400 for a payment already paid', async () => {
    const { service, clientCalls } = harness(row({ status: 'paid' }));
    await assert.rejects(service.processPayment({ paymentId: 'pay-4', userId: 'user-1', now: NOW }), (err) => err.statusCode === 400 && err.message === 'Payment already completed');
    assert.equal(clientCalls.length, 0, 'nothing is written');
  });

  test('on time: marks paid, credits the plan, writes one transaction, no late fee', async () => {
    const { service, clientCalls } = harness(row());
    const result = await service.processPayment({ paymentId: 'pay-4', userId: 'user-1', paymentMethod: 'care_agent', now: NOW });

    assert.equal(clientCalls.length, 3);
    assert.match(clientCalls[0].sql, /UPDATE payments/);
    assert.deepEqual(clientCalls[0].params, ['pay-4', 0]);
    assert.match(clientCalls[1].sql, /UPDATE payment_plans/);
    assert.deepEqual(clientCalls[1].params, [1200, 1200, 'plan-1']);
    assert.match(clientCalls[2].sql, /INSERT INTO transactions/);
    assert.deepEqual(clientCalls[2].params, ['pay-4', 'user-1', 'care_agent', 1200, 'Payment 4 of plan-1']);

    assert.deepEqual(result.transaction, { transaction_id: 'txn-1', amount: 1200 });
    assert.equal(result.lateFee, null);
    assert.equal(result.planId, 'plan-1');
  });

  test('defaults the payment method to manual_payment', async () => {
    const { service, clientCalls } = harness(row());
    await service.processPayment({ paymentId: 'pay-4', userId: 'user-1', now: NOW });
    assert.equal(clientCalls[2].params[2], 'manual_payment');
  });

  test('35 days late: adds the 5% late fee and a separate fee transaction', async () => {
    const { service, clientCalls } = harness(row({ due_date: new Date(NOW - 35 * DAY_MS), status: 'overdue' }));
    const result = await service.processPayment({ paymentId: 'pay-4', userId: 'user-1', now: NOW });

    assert.equal(clientCalls.length, 4);
    assert.deepEqual(clientCalls[0].params, ['pay-4', 60]);
    assert.deepEqual(clientCalls[1].params, [1260, 1200, 'plan-1']);
    assert.match(clientCalls[3].sql, /'fee'/);
    assert.deepEqual(result.lateFee, {
      months_late: 1,
      late_fee_amount: 60,
      total_collected: 1260,
      policy: '5% per overdue month — no interest on payments made on time',
    });
  });
});
