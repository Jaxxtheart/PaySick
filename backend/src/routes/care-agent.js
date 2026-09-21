/**
 * CARE AGENT ROUTES
 *
 * "PaySick Care Agent" — the AI-native, intent-led alternative to the
 * traditional apply-first PaySick journey. Every route requires
 * authentication (CLAUDE.md: "No endpoint may return business logic ... to
 * an unauthenticated caller").
 *
 * Architecture principle: AI reasons, PaySick controls.
 *   - care-agent-nlp.service.js and care-agent.service.js do the reasoning:
 *     extraction, progressive questioning, zero-interest term construction.
 *     Both are pure and deterministic — no external LLM is called.
 *   - This file never invents its own affordability decision. The /confirm
 *     handler defers to patientGateService (Shield Gate 2) — the same
 *     engine marketplace.js's application endpoint uses — for the
 *     authoritative recommendation.
 *   - The /approve handler does not submit anything itself. It hands back
 *     the exact payload for the EXISTING, unmodified
 *     POST /api/marketplace/applications endpoint, so execution stays on
 *     the one deterministic, already-audited code path. The frontend calls
 *     that endpoint directly, then POSTs the resulting applicationId to
 *     /execute purely to link it back to this session's audit trail.
 *   - Every state transition is written to care_agent_audit_log.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');
const { patientGateService } = require('../services/patient-gate.service');
const { extractCareRequest, detectIntent } = require('../services/care-agent-nlp.service');
const {
  mergeCareSummary,
  missingFieldsFor,
  nextQuestion,
  computeShortfallCents,
  buildTermOptions,
  TERM_OPTIONS_MONTHS,
} = require('../services/care-agent.service');
const { toRands, toCents } = require('../utils/money');

// Bot crawling prevention (CLAUDE.md requirement) — belt-and-braces on top
// of the header server.js already sets globally.
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

/**
 * Fetches a session and verifies it belongs to the requesting user.
 * Returns null for both "not found" and "not yours" — a Care Agent
 * conversation is never confirmed to exist to anyone but its owner.
 */
async function getOwnedSession(sessionId, userId) {
  const result = await query(
    `SELECT session_id, user_id, stage, structured_summary, confirmed, approved,
            selected_term_months, application_id, created_at, updated_at
     FROM care_agent_sessions
     WHERE session_id = $1`,
    [sessionId]
  );
  if (result.rows.length === 0) return null;
  const session = result.rows[0];
  if (session.user_id !== userId) return null;
  return session;
}

async function recordAudit(sessionId, eventType, actor, payload) {
  await query(
    `INSERT INTO care_agent_audit_log (session_id, event_type, actor, payload)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, eventType, actor, JSON.stringify(payload || {})]
  );
}

// ============================================
// STAGE 1 (Need) — start a conversation
// ============================================

/**
 * POST /api/care-agent/sessions
 */
router.post('/sessions', authenticateToken, async (req, res) => {
  try {
    const insertResult = await query(
      `INSERT INTO care_agent_sessions (user_id)
       VALUES ($1)
       RETURNING session_id, stage, structured_summary, confirmed, approved,
                 selected_term_months, application_id, created_at`,
      [req.user.userId]
    );
    const session = insertResult.rows[0];
    await recordAudit(session.session_id, 'SESSION_STARTED', 'patient', {});

    const summary = session.structured_summary || {};
    const missing = missingFieldsFor(summary);
    const reply =
      nextQuestion(summary) ||
      "Tell us what's happening. You can describe the treatment, upload a quote, or explain the bill you're dealing with.";

    res.status(201).json({
      sessionId: session.session_id,
      stage: session.stage,
      summary,
      missingFields: missing,
      reply,
    });
  } catch (error) {
    console.error('Care Agent session create error:', error.message);
    res.status(500).json({ error: 'Failed to start a Care Agent conversation' });
  }
});

/**
 * GET /api/care-agent/sessions/:id — resume an existing conversation.
 */
router.get('/sessions/:id', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const summary = session.structured_summary || {};
    res.json({
      sessionId: session.session_id,
      stage: session.stage,
      summary,
      confirmed: session.confirmed,
      approved: session.approved,
      selectedTermMonths: session.selected_term_months,
      applicationId: session.application_id,
      missingFields: missingFieldsFor(summary),
      reply: nextQuestion(summary),
    });
  } catch (error) {
    console.error('Care Agent session fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load this conversation' });
  }
});

// ============================================
// STAGE 2 (Understand) — progressive extraction
// ============================================

/**
 * POST /api/care-agent/sessions/:id/messages
 */
router.post('/sessions/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const intent = detectIntent(message);
    const extracted = extractCareRequest(message);
    const merged = mergeCareSummary(session.structured_summary || {}, extracted);
    const missing = missingFieldsFor(merged);
    const question = nextQuestion(merged);
    const readyToConfirm = question === null;
    const reply =
      question ||
      "Here's what I've got so far. Please confirm it's right, or edit anything that's off.";

    await query(
      `UPDATE care_agent_sessions SET structured_summary = $1, updated_at = NOW() WHERE session_id = $2`,
      [JSON.stringify(merged), session.session_id]
    );
    await recordAudit(session.session_id, 'CONVERSATION_TURN', 'patient', {
      message,
      intent,
      extracted,
      reply,
    });

    res.json({
      sessionId: session.session_id,
      intent,
      summary: merged,
      missingFields: missing,
      reply,
      readyToConfirm,
    });
  } catch (error) {
    console.error('Care Agent message error:', error.message);
    res.status(500).json({ error: 'Failed to process that message' });
  }
});

/**
 * POST /api/care-agent/sessions/:id/confirm
 *
 * Applies any explicit edits, requires every required field to be present
 * (never proceeds on a guess), then builds Stage 3 (Construct) options. If
 * income/obligations are supplied, also runs the same Shield Gate 2
 * affordability engine marketplace.js's application endpoint uses — this
 * route never computes its own approve/decline recommendation.
 */
router.post('/sessions/:id/confirm', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const edits = req.body.summary || {};
    const finalSummary = { ...(session.structured_summary || {}), ...edits };
    const missing = missingFieldsFor(finalSummary);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'A few required details are still missing before this can be confirmed',
        missingFields: missing,
      });
    }

    const shortfallCents = computeShortfallCents(finalSummary);

    await query(
      `UPDATE care_agent_sessions
       SET structured_summary = $1, confirmed = true, stage = 'construct', updated_at = NOW()
       WHERE session_id = $2`,
      [JSON.stringify(finalSummary), session.session_id]
    );
    await recordAudit(session.session_id, 'SUMMARY_CONFIRMED', 'patient', {
      summary: finalSummary,
      shortfallCents,
    });

    const { monthlyIncome, monthlyObligations } = req.body;
    const monthlyIncomeCents = monthlyIncome != null ? toCents(monthlyIncome) : undefined;
    const options = buildTermOptions({ shortfallCents, monthlyIncomeCents });

    let shieldAssessment = null;
    if (monthlyIncome != null) {
      try {
        shieldAssessment = await patientGateService.assessApplication({
          patient_id: req.user.userId,
          procedure_type: finalSummary.procedureTypeGuess || 'other',
          procedure_description: finalSummary.treatmentDescription,
          quoted_amount: toRands(finalSummary.quotedAmountCents),
          medical_aid_covered: toRands(finalSummary.schemeContributionCents),
          loan_amount_requested: toRands(shortfallCents),
          loan_term_months: TERM_OPTIONS_MONTHS[0],
          urgency_classification: 'planned',
          monthly_income_verified: parseFloat(monthlyIncome),
          monthly_obligations: parseFloat(monthlyObligations) || 0,
          income_verification: 'manual_verified',
          segment: finalSummary.schemeContributionCents > 0 ? 'gap_financing' : 'full_procedure',
        });
      } catch (shieldErr) {
        // Non-fatal — mirrors marketplace.js's own handling. The patient
        // still sees term options; they just won't have a Shield rationale
        // attached until affordability can be assessed.
        console.error('Care Agent Shield assessment error:', shieldErr.message);
      }
    }

    res.json({
      sessionId: session.session_id,
      summary: finalSummary,
      shortfallCents,
      options,
      shieldAssessment,
    });
  } catch (error) {
    console.error('Care Agent confirm error:', error.message);
    res.status(500).json({ error: 'Failed to confirm your care summary' });
  }
});

// ============================================
// STAGE 4 (Approve) — explicit, informed consent
// ============================================

/**
 * POST /api/care-agent/sessions/:id/approve
 */
router.post('/sessions/:id/approve', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!session.confirmed) {
      return res.status(400).json({ error: 'Confirm your care summary before approving an option' });
    }

    const { selectedTermMonths, dataSharingAcknowledged } = req.body;
    if (!dataSharingAcknowledged) {
      return res.status(400).json({
        error: 'Explicit confirmation that you consent to sharing this information is required before PaySick can act on it',
      });
    }
    if (!TERM_OPTIONS_MONTHS.includes(selectedTermMonths)) {
      return res.status(400).json({
        error: `selectedTermMonths must be one of: ${TERM_OPTIONS_MONTHS.join(', ')}`,
      });
    }

    const summary = session.structured_summary || {};
    const shortfallCents = computeShortfallCents(summary);

    await query(
      `UPDATE care_agent_sessions
       SET approved = true, stage = 'approve', selected_term_months = $1, updated_at = NOW()
       WHERE session_id = $2`,
      [selectedTermMonths, session.session_id]
    );
    await recordAudit(session.session_id, 'APPROVED', 'patient', {
      selectedTermMonths,
      dataSharingAcknowledged: true,
    });

    // Hand back exactly what the EXISTING marketplace endpoint expects —
    // the Care Agent prepares and routes; it does not execute.
    const applicationPayload = {
      procedureType: summary.procedureTypeGuess || 'other',
      procedureDescription: summary.treatmentDescription,
      loanAmount: toRands(shortfallCents),
      requestedTerm: selectedTermMonths,
    };

    res.json({
      sessionId: session.session_id,
      readyToExecute: true,
      executeEndpoint: '/api/marketplace/applications',
      applicationPayload,
    });
  } catch (error) {
    console.error('Care Agent approve error:', error.message);
    res.status(500).json({ error: 'Failed to record your approval' });
  }
});

// ============================================
// STAGE 5 (Execute) — link back the deterministic result
// ============================================

/**
 * POST /api/care-agent/sessions/:id/execute
 *
 * Called by the frontend AFTER it has itself submitted applicationPayload
 * (from /approve) to the existing POST /api/marketplace/applications. This
 * route performs no execution of its own — it only records, for the audit
 * trail, which application this conversation resulted in.
 */
router.post('/sessions/:id/execute', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!session.approved) {
      return res.status(400).json({ error: 'Approve this request before it can be executed' });
    }

    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'applicationId is required' });
    }

    await query(
      `UPDATE care_agent_sessions SET application_id = $1, stage = 'execute', updated_at = NOW() WHERE session_id = $2`,
      [applicationId, session.session_id]
    );
    await recordAudit(session.session_id, 'EXECUTED', 'system', { applicationId });

    res.json({ sessionId: session.session_id, stage: 'execute', applicationId });
  } catch (error) {
    console.error('Care Agent execute error:', error.message);
    res.status(500).json({ error: 'Failed to record execution' });
  }
});

// ============================================
// STAGE 6 (Manage) — persistent, post-arrangement conversation
// ============================================

/**
 * GET /api/care-agent/sessions/:id/manage
 *
 * Answers "when is my next payment?" from the same tables
 * GET /api/marketplace/loans/:id/repayments reads — no separate source of
 * truth for payment data.
 */
router.get('/sessions/:id/manage', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await query(
      `SELECT lr.amount, lr.due_date
       FROM loan_repayments lr
       JOIN marketplace_loans ml ON lr.loan_id = ml.loan_id
       WHERE ml.user_id = $1 AND lr.status = 'PENDING'
       ORDER BY lr.due_date ASC
       LIMIT 1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        hasActiveLoan: false,
        nextPayment: null,
        reply: "You don't have an active payment plan yet, so there's nothing scheduled.",
      });
    }

    const row = result.rows[0];
    const dueDateDisplay = new Date(row.due_date).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
    });

    res.json({
      hasActiveLoan: true,
      nextPayment: { amount: Number(row.amount), dueDate: row.due_date },
      reply: `Your next payment of R${row.amount} is scheduled for ${dueDateDisplay}.`,
    });
  } catch (error) {
    console.error('Care Agent manage error:', error.message);
    res.status(500).json({ error: 'Failed to check your payment schedule' });
  }
});

/**
 * POST /api/care-agent/sessions/:id/manage/payment-date-change
 *
 * The Care Agent cannot move a payment date itself — that stays with
 * PaySick's deterministic payment controls. It logs the request for human
 * follow-up and says so plainly, rather than pretending to action it.
 */
router.post('/sessions/:id/manage/payment-date-change', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { reason } = req.body;
    const insertResult = await query(
      `INSERT INTO care_agent_manage_requests (session_id, request_type, reason)
       VALUES ($1, 'PAYMENT_DATE_CHANGE', $2)
       RETURNING request_id`,
      [session.session_id, reason || null]
    );
    const requestId = insertResult.rows[0].request_id;
    await recordAudit(session.session_id, 'PAYMENT_DATE_CHANGE_REQUESTED', 'patient', { reason });

    res.json({
      requestId,
      reply:
        "I've logged this for our team to review — a human will confirm whether your payment date can move, and we'll let you know here.",
    });
  } catch (error) {
    console.error('Care Agent manage request error:', error.message);
    res.status(500).json({ error: 'Failed to log that request' });
  }
});

module.exports = router;
