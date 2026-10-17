/**
 * Shield Underwriting Module — public surface.
 *
 *   const shield = require('./shield');
 *   const input = await shield.buildUnderwritingInput(application, { query, now });
 *   const outcome = shield.underwrite(input, { now });
 *   const record = shield.buildDecisionRecord(input, { now }, outcome);
 *
 * See backend/src/shield/README.md for the stage design and outcome map.
 */

'use strict';

const { POLICY, derivePolicy, expenseNorm } = require('./policy');
const { underwrite, STAGE_ORDER } = require('./engine');
const { buildDecisionRecord, replayDecision, canonicalHash } = require('./decision-record');
const { buildUnderwritingInput } = require('./context-builder');
const featureRegistry = require('./medical-risk-score/feature-registry');
const models = require('./medical-risk-score/models');
const { procedureCategoryFor, normaliseUrgency } = require('./procedure-catalogue');
const { recordDecision } = require('./persistence');

/** Mock data sources are accepted only outside production, and only on opt-in. */
function mockSourcesAllowed(env = process.env) {
  return env.NODE_ENV !== 'production' && env.SHIELD_ALLOW_MOCK_SOURCES === 'true';
}

module.exports = {
  POLICY,
  derivePolicy,
  expenseNorm,
  underwrite,
  STAGE_ORDER,
  buildDecisionRecord,
  replayDecision,
  canonicalHash,
  buildUnderwritingInput,
  featureRegistry,
  models,
  procedureCategoryFor,
  normaliseUrgency,
  recordDecision,
  mockSourcesAllowed
};
