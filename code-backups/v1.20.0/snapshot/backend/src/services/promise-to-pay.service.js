'use strict';

/**
 * PROMISE-TO-PAY SERVICE
 *
 * Self-service promise capture for a patient in collections — the
 * mechanism behind the "self-service portal" treatment described in the
 * Early and Mid Collections stages of the Recovery Engine. Pure logic;
 * persistence is a thin wrapper the route layer adds around these
 * functions (mirrors debicheck.adapter.js's separation of concerns).
 *
 * Money is cents-only integer arithmetic (see backend/src/utils/money.js).
 */

const PROMISE_STATUS = {
  pending: 'pending',
  kept:    'kept',
  broken:  'broken'
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Create a new promise-to-pay for a collections case.
 *
 * @param {{caseId:string, promisedAmountCents:number, promisedDate:string, outstandingBalanceCents:number, today?:Date}} params
 */
function createPromise({ caseId, promisedAmountCents, promisedDate, outstandingBalanceCents, today = new Date() }) {
  if (!caseId) {
    throw new Error('createPromise requires caseId');
  }
  if (!Number.isInteger(promisedAmountCents) || promisedAmountCents <= 0) {
    throw new Error('createPromise requires a positive integer promisedAmountCents');
  }

  const promiseDate = new Date(promisedDate);
  if (Number.isNaN(promiseDate.getTime())) {
    throw new Error('createPromise requires a valid promisedDate');
  }
  if (promiseDate < startOfDay(today)) {
    throw new Error('promisedDate cannot be in the past');
  }
  if (!Number.isInteger(outstandingBalanceCents) || promisedAmountCents > outstandingBalanceCents) {
    throw new Error('promisedAmountCents cannot exceed outstandingBalanceCents');
  }

  return {
    caseId,
    promisedAmountCents,
    promisedDate: promiseDate.toISOString().slice(0, 10),
    status: PROMISE_STATUS.pending
  };
}

/**
 * Evaluate a promise-to-pay against what has actually been paid.
 *
 * @param {{promise:{promisedAmountCents:number, promisedDate:string}, paidAmountCents?:number, today?:Date}} params
 */
function evaluatePromise({ promise, paidAmountCents = 0, today = new Date() }) {
  if (paidAmountCents >= promise.promisedAmountCents) {
    return { ...promise, status: PROMISE_STATUS.kept };
  }

  const isPastDue = startOfDay(today) > startOfDay(promise.promisedDate);
  if (isPastDue) {
    return { ...promise, status: PROMISE_STATUS.broken };
  }

  return { ...promise, status: PROMISE_STATUS.pending };
}

module.exports = {
  createPromise,
  evaluatePromise,
  PROMISE_STATUS
};
