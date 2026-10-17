/**
 * Shield Underwriting — immutable decision record and replay.
 *
 * Every decision is stored with its exact input, evaluation time, policy and
 * model versions, full feature vector and SHA-256 hashes of input and
 * outcome. replayDecision() re-runs the engine on the stored input and proves
 * the stored outcome is reproduced unchanged — the audit and dispute trail,
 * and the training data for future Medical Risk Score models.
 */

'use strict';

const crypto = require('crypto');
const { POLICY } = require('./policy');
const { underwrite } = require('./engine');
const { stripProhibited } = require('./medical-risk-score/feature-registry');

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, k) => {
      if (value[k] !== undefined) acc[k] = canonicalize(value[k]);
      return acc;
    }, {});
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function buildDecisionRecord(input, options, outcome) {
  const cleanInput = stripProhibited(input).clean;
  return {
    recordVersion: 1,
    applicationId: cleanInput.application?.applicationId || null,
    decision: outcome.decision,
    policyVersion: outcome.policyVersion,
    modelId: outcome.modelId,
    evaluatedAt: outcome.evaluatedAt,
    options: { now: options.now.toISOString(), allowMockSources: !!options.allowMockSources },
    input: canonicalize(cleanInput),
    inputHash: canonicalHash(cleanInput),
    outcome: canonicalize(outcome),
    outcomeHash: canonicalHash(outcome),
    featureVector: outcome.featureVector
  };
}

/**
 * Re-run the engine on a stored record. `policies` maps historical policy
 * versions to their definitions; the live POLICY is always available.
 */
function replayDecision(record, { policies = {}, models = {} } = {}) {
  const reasons = [];
  const policy = record.policyVersion === POLICY.version ? POLICY : policies[record.policyVersion];
  if (!policy) return { matches: false, reasons: ['POLICY_VERSION_UNAVAILABLE'] };

  if (canonicalHash(record.outcome) !== record.outcomeHash) reasons.push('STORED_OUTCOME_HASH_MISMATCH');
  if (canonicalHash(record.input) !== record.inputHash) reasons.push('STORED_INPUT_HASH_MISMATCH');

  const replayed = underwrite(record.input, {
    now: new Date(record.options.now),
    allowMockSources: record.options.allowMockSources,
    policy,
    model: models[record.modelId]
  });
  if (canonicalHash(replayed) !== record.outcomeHash) reasons.push('REPLAYED_OUTCOME_DIFFERS');

  return { matches: reasons.length === 0, reasons, replayedOutcome: replayed };
}

module.exports = { canonicalize, canonicalHash, buildDecisionRecord, replayDecision };
