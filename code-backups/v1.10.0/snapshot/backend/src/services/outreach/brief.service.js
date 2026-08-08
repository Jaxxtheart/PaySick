'use strict';

/**
 * DAILY BRIEF (§6.5)
 *
 * Composes the founder's morning action list from a run: new leads sourced
 * (count + top 5 by fit_score), drafts awaiting approval (deep links into the
 * Approve Queue), follow-ups due today, replies needing a personal response, and
 * a funnel snapshot (counts by stage). Rendered as HTML for email (reusing the
 * existing email service) and returned structured for the admin dashboard.
 */

const { query } = require('../../config/database');
const { sendJourneyEmail } = require('../email.service');
const { OUTREACH_CONFIG } = require('../../config/outreach.config');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const NAVY = '#1B2A4A';
const PINK = '#EF476F';

const LIFECYCLE_STAGES = [
  'sourced', 'enriched', 'drafted', 'approved', 'contacted',
  'replied', 'demo', 'signed', 'live', 'disqualified',
];

/**
 * Gather the numbers behind the brief. Read-only.
 * @returns {Promise<object>} brief data
 */
async function collectBriefData() {
  const [topLeads, awaitingApproval, followupsDue, replies, funnel] = await Promise.all([
    query(
      `SELECT id, practice_name, vertical, metro, fit_score
         FROM outreach_providers
        WHERE stage IN ('sourced','enriched','drafted')
        ORDER BY fit_score DESC
        LIMIT 5`
    ),
    query(
      `SELECT t.id, t.subject, t.status, t.sequence_step, op.practice_name, op.fit_score
         FROM outreach_touches t
         JOIN outreach_providers op ON op.id = t.provider_id
        WHERE t.status IN ('draft','compliance_hold')
        ORDER BY op.fit_score DESC`
    ),
    query(
      `SELECT id, practice_name, vertical, metro, next_action_at
         FROM outreach_providers
        WHERE stage = 'contacted'
          AND next_action_at IS NOT NULL
          AND next_action_at <= now()
        ORDER BY next_action_at ASC`
    ),
    query(
      `SELECT id, practice_name, vertical, metro
         FROM outreach_providers
        WHERE stage = 'replied'
        ORDER BY updated_at DESC`
    ),
    query(
      `SELECT stage, COUNT(*)::int AS count
         FROM outreach_providers
        GROUP BY stage`
    ),
  ]);

  const funnelMap = {};
  for (const s of LIFECYCLE_STAGES) funnelMap[s] = 0;
  for (const row of funnel.rows) funnelMap[row.stage] = row.count;

  return {
    topLeads: topLeads.rows,
    awaitingApproval: awaitingApproval.rows,
    followupsDue: followupsDue.rows,
    replies: replies.rows,
    funnel: funnelMap,
  };
}

function briefHtml(data) {
  const queueUrl = `${APP_URL}/admin-approve-queue.html`;
  const row = (cells) => `<tr>${cells.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:14px;">${c}</td>`).join('')}</tr>`;

  const topLeadsRows = data.topLeads.length
    ? data.topLeads.map((l) => row([l.practice_name, l.vertical, l.metro || '', `<b>${l.fit_score}</b>`])).join('')
    : row(['<i>No new leads today</i>', '', '', '']);

  const approvalRows = data.awaitingApproval.length
    ? data.awaitingApproval.map((t) =>
        row([
          t.practice_name,
          t.subject || `Step ${t.sequence_step ?? 0}`,
          t.status === 'compliance_hold'
            ? `<span style="color:${PINK};font-weight:600;">compliance hold</span>`
            : 'draft',
          `<a href="${queueUrl}" style="color:${PINK};">Review →</a>`,
        ])
      ).join('')
    : row(['<i>Nothing awaiting approval</i>', '', '', '']);

  const funnelCells = LIFECYCLE_STAGES
    .map((s) => `<span style="display:inline-block;margin:0 12px 8px 0;font-size:13px;color:${NAVY};">${s}: <b>${data.funnel[s]}</b></span>`)
    .join('');

  return `
    <h2 style="margin:0 0 6px;color:${NAVY};font-size:20px;">PaySick Daily Outreach Brief</h2>
    <p style="margin:0 0 20px;color:#666;font-size:13px;">Vertical: ${OUTREACH_CONFIG.activeVerticals.join(', ')} · Metros: ${OUTREACH_CONFIG.targetMetros.join(', ')}</p>

    <h3 style="color:${NAVY};font-size:15px;margin:20px 0 6px;">Top new leads (by fit score)</h3>
    <table style="width:100%;border-collapse:collapse;"><tbody>${topLeadsRows}</tbody></table>

    <h3 style="color:${NAVY};font-size:15px;margin:24px 0 6px;">Drafts awaiting approval (${data.awaitingApproval.length})</h3>
    <table style="width:100%;border-collapse:collapse;"><tbody>${approvalRows}</tbody></table>
    <p style="margin:12px 0 0;"><a href="${queueUrl}" style="display:inline-block;background:${PINK};color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">Open the Approve Queue</a></p>

    <h3 style="color:${NAVY};font-size:15px;margin:24px 0 6px;">Follow-ups due today (${data.followupsDue.length})</h3>
    <p style="margin:0 0 8px;font-size:14px;color:#444;">${data.followupsDue.map((f) => f.practice_name).join(', ') || '<i>None</i>'}</p>

    <h3 style="color:${NAVY};font-size:15px;margin:24px 0 6px;">Replies needing a personal response (${data.replies.length})</h3>
    <p style="margin:0 0 8px;font-size:14px;color:${data.replies.length ? PINK : '#444'};font-weight:${data.replies.length ? 600 : 400};">${data.replies.map((r) => r.practice_name).join(', ') || '<i>None</i>'}</p>

    <h3 style="color:${NAVY};font-size:15px;margin:24px 0 6px;">Funnel snapshot</h3>
    <p style="margin:0;">${funnelCells}</p>
  `;
}

/**
 * Compose and deliver the daily brief to the founder.
 * @param {object} [opts]
 * @param {boolean} [opts.send=true]  set false for a dry-run (returns data+html, sends nothing)
 * @returns {Promise<{data, html}>}
 */
async function deliverDailyBrief(opts = {}) {
  const send = opts.send !== false;
  const data = await collectBriefData();
  const html = briefHtml(data);

  if (send) {
    for (const to of OUTREACH_CONFIG.briefRecipients) {
      try {
        await sendJourneyEmail({
          to,
          subject: `PaySick outreach brief for ${new Date().toISOString().slice(0, 10)}`,
          html,
        });
      } catch (err) {
        // Non-fatal: the dashboard still renders the same brief.
        console.error('Daily brief email failed:', err.message);
      }
    }
  }

  return { data, html };
}

module.exports = { collectBriefData, briefHtml, deliverDailyBrief, LIFECYCLE_STAGES };
