'use strict';

/**
 * Unit Tests — Promise-to-Pay
 *
 * Self-service promise capture and kept/broken evaluation for a patient
 * in collections. Pure logic, no database — the service layer wraps this
 * with persistence.
 *
 * Written BEFORE implementation (test-first workflow, CLAUDE.md).
 * Run: node --test tests/unit/promise-to-pay.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createPromise,
  evaluatePromise,
  PROMISE_STATUS
} = require('../../backend/src/services/promise-to-pay.service');

describe('createPromise — validation', () => {
  test('creates a pending promise with a valid future date and amount', () => {
    const p = createPromise({
      caseId: 'case-1',
      promisedAmountCents: 5000,
      promisedDate: '2099-01-15',
      outstandingBalanceCents: 8500
    });
    assert.equal(p.caseId, 'case-1');
    assert.equal(p.promisedAmountCents, 5000);
    assert.equal(p.status, PROMISE_STATUS.pending);
  });

  test('rejects a missing caseId', () => {
    assert.throws(() => createPromise({
      promisedAmountCents: 5000,
      promisedDate: '2099-01-15',
      outstandingBalanceCents: 8500
    }));
  });

  test('rejects a zero or negative promisedAmountCents', () => {
    assert.throws(() => createPromise({
      caseId: 'case-1',
      promisedAmountCents: 0,
      promisedDate: '2099-01-15',
      outstandingBalanceCents: 8500
    }));
  });

  test('rejects a non-integer promisedAmountCents (no floating point money)', () => {
    assert.throws(() => createPromise({
      caseId: 'case-1',
      promisedAmountCents: 50.5,
      promisedDate: '2099-01-15',
      outstandingBalanceCents: 8500
    }));
  });

  test('rejects an invalid promisedDate', () => {
    assert.throws(() => createPromise({
      caseId: 'case-1',
      promisedAmountCents: 5000,
      promisedDate: 'not-a-date',
      outstandingBalanceCents: 8500
    }));
  });

  test('rejects a promisedDate in the past', () => {
    assert.throws(() => createPromise({
      caseId: 'case-1',
      promisedAmountCents: 5000,
      promisedDate: '2000-01-01',
      outstandingBalanceCents: 8500
    }));
  });

  test('rejects a promise for more than the outstanding balance', () => {
    assert.throws(() => createPromise({
      caseId: 'case-1',
      promisedAmountCents: 9000,
      promisedDate: '2099-01-15',
      outstandingBalanceCents: 8500
    }));
  });
});

describe('evaluatePromise — kept / broken resolution', () => {
  test('is kept when the promised amount has been paid before or on the due date', () => {
    const promise = { promisedAmountCents: 5000, promisedDate: '2026-06-15' };
    const result = evaluatePromise({
      promise,
      paidAmountCents: 5000,
      today: new Date('2026-06-10')
    });
    assert.equal(result.status, PROMISE_STATUS.kept);
  });

  test('is kept when more than the promised amount has been paid', () => {
    const promise = { promisedAmountCents: 5000, promisedDate: '2026-06-15' };
    const result = evaluatePromise({
      promise,
      paidAmountCents: 8500,
      today: new Date('2026-06-10')
    });
    assert.equal(result.status, PROMISE_STATUS.kept);
  });

  test('stays pending before the due date with no or partial payment', () => {
    const promise = { promisedAmountCents: 5000, promisedDate: '2026-06-15' };
    const result = evaluatePromise({
      promise,
      paidAmountCents: 1000,
      today: new Date('2026-06-10')
    });
    assert.equal(result.status, PROMISE_STATUS.pending);
  });

  test('is broken once the due date has passed with an unmet balance', () => {
    const promise = { promisedAmountCents: 5000, promisedDate: '2026-06-15' };
    const result = evaluatePromise({
      promise,
      paidAmountCents: 1000,
      today: new Date('2026-06-16')
    });
    assert.equal(result.status, PROMISE_STATUS.broken);
  });

  test('is kept, not broken, when fully paid exactly on the due date', () => {
    const promise = { promisedAmountCents: 5000, promisedDate: '2026-06-15' };
    const result = evaluatePromise({
      promise,
      paidAmountCents: 5000,
      today: new Date('2026-06-15')
    });
    assert.equal(result.status, PROMISE_STATUS.kept);
  });
});
