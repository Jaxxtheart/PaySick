/**
 * Shield Underwriting — decision persistence.
 *
 * Writes the immutable decision record (see decision-record.js) to
 * shield_decisions. Errors propagate: a decision that cannot be recorded
 * must not be acted on, so callers fail closed.
 */

'use strict';

const CHANNELS = ['V1_API', 'MARKETPLACE'];

async function recordDecision(query, { record, outcome, channel, patientId = null, providerId = null }) {
  if (!CHANNELS.includes(channel)) throw new Error(`recordDecision: unknown channel ${channel}`);
  const app = record.input?.application || {};
  const res = await query(
    `INSERT INTO shield_decisions
       (application_id, patient_id, provider_id, channel, decision, decisive_stage, hard_decline,
        reason_codes, pd_12m, mrs_score, mrs_grade, provider_grade,
        policy_version, model_id, registry_version, evaluated_at,
        input_hash, outcome_hash, record)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING decision_id`,
    [
      record.applicationId,
      patientId || app.patientId || null,
      providerId || app.providerId || null,
      channel,
      outcome.decision,
      outcome.decisiveStage,
      outcome.hardDecline,
      JSON.stringify(outcome.reasonCodes),
      outcome.medicalRiskScore.pd12m,
      outcome.medicalRiskScore.score,
      outcome.medicalRiskScore.grade,
      outcome.providerRisk.grade,
      outcome.policyVersion,
      outcome.modelId,
      outcome.governance.registryVersion,
      outcome.evaluatedAt,
      record.inputHash,
      record.outcomeHash,
      JSON.stringify(record)
    ]
  );
  return res.rows?.[0]?.decision_id || null;
}

module.exports = { recordDecision, CHANNELS };
