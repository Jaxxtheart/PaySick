'use strict';

/**
 * OUTREACH DATA ACCESS
 *
 * Thin repository over the existing raw-`pg` client. Isolating DB access here
 * keeps the pipeline orchestrator (pipeline.service.js) pure enough to unit-test
 * with an in-memory fake, and keeps SQL in one place.
 */

const { query } = require('../../config/database');

async function getExistingPlaceIds() {
  const res = await query(
    `SELECT place_id FROM outreach_providers WHERE place_id IS NOT NULL`
  );
  return new Set(res.rows.map((r) => r.place_id));
}

async function insertSourcedLead(lead) {
  const res = await query(
    `INSERT INTO outreach_providers
       (practice_name, vertical, source, place_id, metro, address, rating, ratings_count, stage, owner, consent_basis)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sourced',$9,$10)
     ON CONFLICT (place_id) DO NOTHING
     RETURNING *`,
    [
      lead.practice_name,
      lead.vertical,
      lead.source || 'google_places',
      lead.place_id,
      lead.metro || null,
      lead.address || null,
      lead.rating ?? null,
      lead.ratings_count ?? null,
      lead.owner || null,
      lead.consent_basis || 'public_business_listing',
    ]
  );
  return res.rows[0] || null;
}

async function getLeadsByStage(stage, limit) {
  const res = await query(
    `SELECT * FROM outreach_providers
      WHERE stage = $1 AND do_not_contact = false
      ORDER BY fit_score DESC, created_at ASC
      ${limit ? 'LIMIT ' + parseInt(limit, 10) : ''}`,
    [stage]
  );
  return res.rows;
}

async function updateLead(id, fields) {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`);
  sets.push(`updated_at = now()`);
  await query(
    `UPDATE outreach_providers SET ${sets.join(', ')} WHERE id = $1`,
    [id, ...cols.map((c) => fields[c])]
  );
}

async function insertTouch(touch) {
  const res = await query(
    `INSERT INTO outreach_touches
       (provider_id, channel, direction, sequence_step, subject, body, status, compliance_flags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      touch.provider_id,
      touch.channel,
      touch.direction || 'outbound',
      touch.sequence_step ?? null,
      touch.subject || null,
      touch.body || null,
      touch.status || 'draft',
      touch.compliance_flags && touch.compliance_flags.length ? touch.compliance_flags : null,
    ]
  );
  return res.rows[0];
}

async function getContactedDueForFollowup(now = new Date()) {
  const res = await query(
    `SELECT op.*
       FROM outreach_providers op
      WHERE op.stage = 'contacted'
        AND op.do_not_contact = false
        AND op.next_action_at IS NOT NULL
        AND op.next_action_at <= $1
        AND NOT EXISTS (
          SELECT 1 FROM outreach_touches t
           WHERE t.provider_id = op.id AND t.direction = 'inbound'
        )`,
    [now]
  );
  return res.rows;
}

async function getLastOutboundStep(providerId) {
  const res = await query(
    `SELECT COALESCE(MAX(sequence_step), 0) AS last_step
       FROM outreach_touches
      WHERE provider_id = $1 AND direction = 'outbound'`,
    [providerId]
  );
  return res.rows[0] ? Number(res.rows[0].last_step) : 0;
}

async function insertRun(summary) {
  const res = await query(
    `INSERT INTO outreach_runs
       (run_date, leads_sourced, drafts_created, followups_due, compliance_holds, errors)
     VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)
     RETURNING *`,
    [
      summary.leads_sourced || 0,
      summary.drafts_created || 0,
      summary.followups_due || 0,
      summary.compliance_holds || 0,
      summary.errors && summary.errors.length ? JSON.stringify(summary.errors) : null,
    ]
  );
  return res.rows[0];
}

module.exports = {
  getExistingPlaceIds,
  insertSourcedLead,
  getLeadsByStage,
  updateLead,
  insertTouch,
  getContactedDueForFollowup,
  getLastOutboundStep,
  insertRun,
};
