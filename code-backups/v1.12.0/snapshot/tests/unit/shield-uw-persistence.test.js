/**
 * Shield Underwriting — decision persistence.
 *
 * recordDecision() writes the immutable decision record to shield_decisions
 * with the summary columns the review queue and MRS development need.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { recordDecision } = require('../../backend/src/shield/persistence');
const { underwrite } = require('../../backend/src/shield/engine');
const { buildDecisionRecord } = require('../../backend/src/shield/decision-record');
const { NOW, baselineInput } = require('./fixtures/shield-input');

describe('recordDecision', () => {
  const input = baselineInput();
  const outcome = underwrite(input, { now: NOW });
  const record = buildDecisionRecord(input, { now: NOW }, outcome);

  test('inserts the record with summary columns and returns the decision id', async () => {
    const calls = [];
    const query = async (sql, params) => { calls.push([sql, params]); return { rows: [{ decision_id: 'd-1' }] }; };
    const id = await recordDecision(query, { record, outcome, channel: 'V1_API' });
    assert.equal(id, 'd-1');
    const [sql, params] = calls[0];
    assert.match(sql, /INSERT\s+INTO\s+shield_decisions/i);
    assert.ok(params.includes('V1_API'));
    assert.ok(params.includes(outcome.decision));
    assert.ok(params.includes(record.inputHash));
    assert.ok(params.includes(record.outcomeHash));
    assert.ok(params.includes(outcome.policyVersion));
    assert.ok(params.includes(outcome.medicalRiskScore.pd12m));
  });

  test('rejects an unknown channel', async () => {
    await assert.rejects(recordDecision(async () => ({ rows: [] }), { record, outcome, channel: 'NOPE' }), /channel/);
  });

  test('propagates database failure so the caller can fail closed', async () => {
    await assert.rejects(recordDecision(async () => { throw new Error('db down'); }, { record, outcome, channel: 'MARKETPLACE' }), /db down/);
  });
});
