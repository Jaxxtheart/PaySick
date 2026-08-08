'use strict';

/**
 * PROVIDER OUTREACH AGENT — ROUTES
 *
 * Two surfaces:
 *   1. The daily cron route (§4) — guarded by CRON_SECRET. Runs the 5-stage
 *      pipeline and writes one outreach_runs row. Produces drafts only.
 *   2. The admin Approve Queue API (§4 human gate) — reuses the existing
 *      authenticateToken + requireAdmin auth. Approving a draft is the ONLY
 *      path that sets a touch to status='sent' (acceptance criterion §9).
 */

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth.middleware');
const { runDailyPipeline } = require('../services/outreach/pipeline.service');
const { collectBriefData, briefHtml, deliverDailyBrief } = require('../services/outreach/brief.service');
const { complianceScan } = require('../services/outreach/compliance.service');
const { nextStep, stepDueInDays, scheduleFromNow } = require('../services/outreach/sequence.service');
const { stripEmDashes } = require('../services/outreach/style');
const { ensureRegistrationCta } = require('../services/outreach/cta');
const { sendJourneyEmail } = require('../services/email.service');
const { verifyResendSignature, parseInboundEmail } = require('../services/outreach/inbound.service');
const { generateOnboardingReply } = require('../services/outreach/claude.service');
const { OUTREACH_CONFIG } = require('../config/outreach.config');

// ─── Cron auth ───────────────────────────────────────────────────────────────
// Vercel Cron invokes GET with `Authorization: Bearer $CRON_SECRET`. We also
// accept `x-cron-secret` for manual/local POSTs. In production CRON_SECRET is
// mandatory; in dev an unset secret is allowed so a local dry-run works.
function checkCronSecret(req) {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    return process.env.NODE_ENV !== 'production';
  }
  const auth = req.headers['authorization'];
  const bearer = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const provided = bearer || req.headers['x-cron-secret'];
  return provided === configured;
}

async function runDaily(req, res) {
  // Two callers: Vercel Cron (CRON_SECRET) and the admin "Run now" button
  // (a valid admin token via optionalAuth). Either is sufficient.
  const isAdmin = req.user && req.user.role === 'admin';
  if (!checkCronSecret(req) && !isAdmin) {
    return res.status(401).json({ error: 'Unauthorized', code: 'BAD_CRON_SECRET' });
  }
  // Dry-run (?dry=1) sources/enriches/scores/drafts but sends nothing.
  const dry = req.query.dry === '1' || req.query.dry === 'true';
  try {
    const summary = await runDailyPipeline({}, { send: !dry });
    return res.json({ ok: true, dryRun: dry, summary });
  } catch (err) {
    console.error('Outreach daily run failed:', err.message);
    return res.status(500).json({ error: 'Pipeline run failed', code: 'PIPELINE_ERROR' });
  }
}

// Vercel Cron uses GET; POST supported for manual/local invocation.
// optionalAuth populates req.user when an admin token is present (button trigger),
// without blocking the unauthenticated cron caller (which uses CRON_SECRET).
router.get('/daily', optionalAuth, runDaily);
router.post('/daily', optionalAuth, runDaily);

// ─── Inbound email replies (Resend webhook) ─────────────────────────────────
// Public endpoint, authenticated by the Resend/Svix signature (NOT admin auth).
// On a matched reply it flips the lead to `replied`, halts the sequence, records
// the inbound touch, and generates a HUMAN-GATED onboarding-prompting draft into
// the Approve Queue. Nothing is auto-sent (§4 human gate, §5 reply handling).
function checkInboundSignature(req) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const raw = req.rawBody != null ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
  if (!secret) {
    // Dev convenience only; in production a secret is mandatory.
    return process.env.NODE_ENV !== 'production';
  }
  // Primary: Svix signature (Resend's scheme). Fallback: a shared-secret header.
  if (verifyResendSignature(raw, req.headers, secret)) return true;
  return req.headers['x-webhook-secret'] === secret;
}

router.post('/inbound', async (req, res) => {
  if (!checkInboundSignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook signature', code: 'BAD_SIGNATURE' });
  }

  try {
    const { fromEmail, subject, text } = parseInboundEmail(req.body);
    if (!fromEmail) {
      return res.json({ ok: true, matched: false, reason: 'no sender address' });
    }

    // Match to an outreach lead by public email (case-insensitive). Prefer a
    // lead that is still in an outbound stage (not already replied/disqualified).
    const leadRes = await query(
      `SELECT * FROM outreach_providers
        WHERE lower(email) = lower($1)
        ORDER BY (stage = 'replied') ASC, updated_at DESC
        LIMIT 1`,
      [fromEmail]
    );
    const lead = leadRes.rows[0];
    if (!lead) {
      return res.json({ ok: true, matched: false, reason: 'no lead for sender' });
    }

    // Record the inbound touch (audit trail) and halt the sequence.
    await query(
      `INSERT INTO outreach_touches (provider_id, channel, direction, subject, body, status)
       VALUES ($1, 'email', 'inbound', $2, $3, 'replied')`,
      [lead.id, subject || null, text || null]
    );
    await query(
      `UPDATE outreach_providers SET stage = 'replied', next_action_at = NULL, updated_at = now()
        WHERE id = $1`,
      [lead.id]
    );

    // Generate a human-gated onboarding-prompting draft (never auto-sent).
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const onboardingUrl = `${appUrl}${OUTREACH_CONFIG.onboardingLink}`;
    let drafted = false;
    try {
      const draft = await generateOnboardingReply(lead, text, { onboardingUrl });
      const flags = complianceScan([draft.subject, draft.email_body].filter(Boolean).join('\n'));
      await query(
        `INSERT INTO outreach_touches
           (provider_id, channel, direction, sequence_step, subject, body, status, compliance_flags)
         VALUES ($1, 'email', 'outbound', NULL, $2, $3, $4, $5)`,
        [
          lead.id,
          draft.subject,
          draft.email_body,
          flags.length ? 'compliance_hold' : 'draft',
          flags.length ? flags : null,
        ]
      );
      drafted = true;
    } catch (genErr) {
      // Reply is still recorded and the lead flipped; the founder can respond
      // manually from the queue even if drafting failed.
      console.error('Onboarding draft generation failed:', genErr.message);
    }

    return res.json({ ok: true, matched: true, lead_id: lead.id, onboarding_draft: drafted });
  } catch (err) {
    console.error('Inbound handling error:', err.message);
    return res.status(500).json({ error: 'Failed to handle inbound reply' });
  }
});

// ─── Admin Approve Queue API (auth required) ────────────────────────────────
router.use(authenticateToken, requireAdmin);

// Queue: all draft / compliance_hold touches with lead context + fit score.
router.get('/queue', async (req, res) => {
  try {
    const result = await query(
      `SELECT t.id, t.channel, t.direction, t.sequence_step, t.subject, t.body,
              t.status, t.compliance_flags, t.created_at,
              op.id AS provider_id, op.practice_name, op.vertical, op.metro,
              op.email, op.website, op.fit_score, op.stage
         FROM outreach_touches t
         JOIN outreach_providers op ON op.id = t.provider_id
        WHERE t.status IN ('draft', 'compliance_hold')
        ORDER BY (t.status = 'compliance_hold') DESC, op.fit_score DESC, t.created_at ASC`
    );
    res.json({ touches: result.rows });
  } catch (err) {
    console.error('Queue fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load queue' });
  }
});

// The daily brief data + rendered HTML (for the dashboard panel). Sends nothing.
router.get('/brief', async (req, res) => {
  try {
    const data = await collectBriefData();
    res.json({ data, html: briefHtml(data) });
  } catch (err) {
    console.error('Brief fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load brief' });
  }
});

// Recent run summaries (observability).
router.get('/runs', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM outreach_runs ORDER BY run_date DESC, created_at DESC LIMIT 30`
    );
    res.json({ runs: result.rows });
  } catch (err) {
    console.error('Runs fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load runs' });
  }
});

// Edit a draft's subject/body. The house style is re-applied to the edit (no em
// dashes, registration ask present) and the linter re-runs: denied terms keep it
// on hold, clean copy clears it back to draft.
router.post('/touches/:id/edit', async (req, res) => {
  const { subject, body } = req.body || {};
  try {
    const existing = await query(
      `SELECT channel FROM outreach_touches WHERE id = $1`,
      [req.params.id]
    );
    const isShort = existing.rows[0] && existing.rows[0].channel === 'linkedin';
    const styledSubject = subject ? stripEmDashes(subject) : null;
    const styledBody = body
      ? ensureRegistrationCta(stripEmDashes(body), { short: isShort })
      : null;

    const flags = complianceScan([styledSubject, styledBody].filter(Boolean).join('\n'));
    const status = flags.length ? 'compliance_hold' : 'draft';
    const result = await query(
      `UPDATE outreach_touches
          SET subject = $2, body = $3, status = $4, compliance_flags = $5
        WHERE id = $1 AND status IN ('draft', 'compliance_hold')
        RETURNING *`,
      [req.params.id, styledSubject, styledBody, status, flags.length ? flags : null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Touch not found or not editable' });
    res.json({ touch: result.rows[0] });
  } catch (err) {
    console.error('Edit error:', err.message);
    res.status(500).json({ error: 'Failed to edit draft' });
  }
});

// Reject a draft.
router.post('/touches/:id/reject', async (req, res) => {
  try {
    const result = await query(
      `UPDATE outreach_touches SET status = 'rejected'
        WHERE id = $1 AND status IN ('draft', 'compliance_hold')
        RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Touch not found or not rejectable' });
    res.json({ touch: result.rows[0] });
  } catch (err) {
    console.error('Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject draft' });
  }
});

/**
 * Approve a draft → send → sent. THE ONLY PATH that sets status='sent'.
 * A compliance_hold cannot be approved: the founder must edit it clean first.
 */
router.post('/touches/:id/approve', async (req, res) => {
  try {
    const touchRes = await query(
      `SELECT t.*, op.practice_name, op.email AS lead_email, op.stage AS lead_stage
         FROM outreach_touches t
         JOIN outreach_providers op ON op.id = t.provider_id
        WHERE t.id = $1`,
      [req.params.id]
    );
    const touch = touchRes.rows[0];
    if (!touch) return res.status(404).json({ error: 'Touch not found' });
    if (touch.status !== 'draft') {
      return res.status(409).json({
        error: touch.status === 'compliance_hold'
          ? 'Cannot approve a draft on compliance hold, edit it clean first.'
          : `Touch is not in draft status (currently ${touch.status}).`,
        code: 'NOT_APPROVABLE',
      });
    }
    // Last gate on the house style: no em dashes leave the building, and every
    // message carries the ask to register as a provider. Applied before the
    // linter runs, so the linter sees exactly the copy that will be sent.
    const finalSubject = stripEmDashes(touch.subject || '');
    const finalBody = ensureRegistrationCta(stripEmDashes(touch.body || ''), {
      short: touch.channel === 'linkedin',
    });
    if (finalSubject !== touch.subject || finalBody !== touch.body) {
      await query(
        `UPDATE outreach_touches SET subject = $2, body = $3 WHERE id = $1`,
        [touch.id, finalSubject || null, finalBody || null]
      );
      touch.subject = finalSubject;
      touch.body = finalBody;
    }

    // Defence in depth: never send copy that would fail the linter.
    const flags = complianceScan([touch.subject, touch.body].filter(Boolean).join('\n'));
    if (flags.length) {
      await query(
        `UPDATE outreach_touches SET status = 'compliance_hold', compliance_flags = $2 WHERE id = $1`,
        [touch.id, flags]
      );
      return res.status(409).json({ error: 'Draft contains prohibited terminology', code: 'COMPLIANCE_HOLD', flags });
    }

    // Send (email channel only; linkedin/call are dispatched manually by the founder).
    let sent = true;
    if (touch.channel === 'email') {
      if (!touch.lead_email) {
        return res.status(422).json({ error: 'No public email on this lead; use the LinkedIn/call channel.' });
      }
      try {
        await sendJourneyEmail({ to: touch.lead_email, subject: touch.subject, html: renderEmailHtml(touch.body) });
      } catch (err) {
        console.error('Send failed:', err.message);
        return res.status(502).json({ error: 'Send failed', code: 'SEND_FAILED' });
      }
    }

    await query(
      `UPDATE outreach_touches SET status = 'approved' WHERE id = $1`,
      [touch.id]
    );
    if (sent) {
      await query(
        `UPDATE outreach_touches SET status = 'sent', sent_at = now() WHERE id = $1`,
        [touch.id]
      );
    }

    // Sequence touches (step 0–3) advance the lead to `contacted` and schedule
    // the next step. Onboarding replies (sequence_step NULL) are a response to an
    // inbound reply — send them but DO NOT reset the lead's stage or re-arm the
    // sequence; the lead stays `replied` for the founder to carry on personally.
    let nextActionAt = null;
    if (touch.sequence_step !== null && touch.sequence_step !== undefined) {
      const step = nextStep(touch.sequence_step);
      if (step !== null) {
        const days = stepDueInDays(step) - (stepDueInDays(touch.sequence_step) || 0);
        nextActionAt = scheduleFromNow(days > 0 ? days : 0);
      }
      await query(
        `UPDATE outreach_providers SET stage = 'contacted', next_action_at = $2, updated_at = now()
          WHERE id = $1`,
        [touch.provider_id, nextActionAt]
      );
    }

    res.json({ ok: true, touch_id: touch.id, next_action_at: nextActionAt });
  } catch (err) {
    console.error('Approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve draft' });
  }
});

// Manual "mark replied" (§5 phase-2 stub): halts the sequence, founder replies personally.
router.post('/providers/:id/mark-replied', async (req, res) => {
  try {
    const result = await query(
      `UPDATE outreach_providers SET stage = 'replied', next_action_at = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Lead not found' });
    // Record an inbound touch so the audit trail + follow-up guard reflect the reply.
    await query(
      `INSERT INTO outreach_touches (provider_id, channel, direction, status, body)
       VALUES ($1, 'email', 'inbound', 'replied', 'Manually marked as replied')`,
      [req.params.id]
    );
    res.json({ provider: result.rows[0] });
  } catch (err) {
    console.error('Mark-replied error:', err.message);
    res.status(500).json({ error: 'Failed to mark replied' });
  }
});

// Minimal branded HTML wrapper for outbound emails (plain-text body -> paragraphs).
function renderEmailHtml(body) {
  const safe = String(body || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = safe.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.6;color:#1A1A1A;">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1A1A1A;">${paras}</div>`;
}

module.exports = router;
