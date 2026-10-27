/**
 * Unit Tests — three Care Agent bugs found while planning v1.18.0
 *
 * Written BEFORE any fix (bug-fixing workflow, per CLAUDE.md).
 *
 * Static-source checks, the same approach care-agent-route-llm-wiring.test.js
 * takes (express/jest are not installable in this sandbox, so the route file
 * cannot be loaded here).
 *
 * Bug 1: GET /sessions/:id/manage selects lr.amount and lr.due_date and
 *   filters on status 'PENDING'. loan_repayments has no such columns
 *   (database/migrations/001_marketplace_tables.sql: scheduled_amount,
 *   scheduled_date; new rows default to status 'SCHEDULED'), so the query
 *   throws and "When's my next payment?" always answers with a 500.
 *
 * Bug 2: POST /sessions/:id/confirm accepts monthlyIncome/monthlyObligations
 *   but never stores them, and /approve's applicationPayload omits them. The
 *   marketplace endpoint only runs Shield Gate 2 when monthlyIncome is in the
 *   body, so an application submitted through the Care Agent is never
 *   affordability-checked at submission.
 *
 * Bug 3: care-agent.html's approveAndExecute() reads applicationId from the
 *   marketplace response and records it without checking shield_declined.
 *   A Shield decline returns { success: false, shield_declined: true } with
 *   no applicationId, so /execute rejects it and the patient is told
 *   "I couldn't submit that just now", which is wrong: it was assessed and
 *   declined.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const routeSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/routes/care-agent.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(REPO_ROOT, 'kehr.html'), 'utf8');

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `expected to find ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end !== -1, `expected to find ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

describe('Bug 1: /manage reads real loan_repayments columns', () => {
  const manageRoute = slice(routeSource, "router.get('/sessions/:id/manage',", 'router.post(');

  test('does not select columns loan_repayments does not have', () => {
    assert.doesNotMatch(manageRoute, /lr\.amount\b/);
    assert.doesNotMatch(manageRoute, /lr\.due_date\b/);
  });

  test('selects scheduled_amount and scheduled_date', () => {
    assert.match(manageRoute, /scheduled_amount/);
    assert.match(manageRoute, /scheduled_date/);
  });

  test('treats SCHEDULED instalments as upcoming, not only PENDING', () => {
    assert.match(manageRoute, /'SCHEDULED'/);
  });
});

describe('Bug 2: income reaches Shield Gate 2 at submission', () => {
  const confirmRoute = slice(routeSource, "router.post('/sessions/:id/confirm',", "router.post('/sessions/:id/approve',");
  const approveRoute = slice(routeSource, "router.post('/sessions/:id/approve',", "router.post('/sessions/:id/execute',");

  test('/confirm stores the stated income and obligations on the summary', () => {
    assert.match(confirmRoute, /monthlyIncomeCents/);
    assert.match(confirmRoute, /monthlyObligationsCents/);
  });

  test('/approve passes monthlyIncome, monthlyObligations and medicalAidCovered to the marketplace payload', () => {
    const payloadStart = approveRoute.indexOf('const applicationPayload');
    assert.ok(payloadStart !== -1, 'expected an applicationPayload in /approve');
    const payload = approveRoute.slice(payloadStart, approveRoute.indexOf('};', payloadStart));
    assert.match(payload, /monthlyIncome/);
    assert.match(payload, /monthlyObligations/);
    assert.match(payload, /medicalAidCovered/);
  });
});

describe('Bug 3: a Shield decline is shown as a decision, not a failure', () => {
  const approveFn = slice(pageSource, 'async function approveAndExecute()', 'async function showNextPayment()');

  test('checks shield_declined before recording execution', () => {
    const declinedAt = approveFn.indexOf('shield_declined');
    const recordAt = approveFn.indexOf('recordExecution');
    assert.ok(declinedAt !== -1, 'approveAndExecute must check shield_declined');
    assert.ok(recordAt !== -1, 'approveAndExecute still records execution on success');
    assert.ok(declinedAt < recordAt, 'the decline check must come before recordExecution');
  });

  test('never records an execution without an applicationId', () => {
    assert.match(approveFn, /if\s*\(\s*!applicationId\s*\)/);
  });
});
