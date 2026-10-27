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

const { query, transaction } = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');
const { patientGateService } = require('../services/patient-gate.service');
const { extractCareRequest, PROCEDURE_CATEGORIES } = require('../services/care-agent-nlp.service');
const {
  mergeCareSummary,
  missingFieldsFor,
  nextQuestion,
  computeShortfallCents,
  buildTermOptions,
  TERM_OPTIONS_MONTHS,
} = require('../services/care-agent.service');
const { runCareAgentTurn, executeTool } = require('../services/care-agent-llm.service');
const {
  extractFromDocument,
  describeExtraction,
  ALLOWED_MEDIA_TYPES,
  MAX_DOCUMENT_BYTES,
} = require('../services/care-agent-document.service');
const { toRands, toCents } = require('../utils/money');
const { detectAccountIntent, suggestParamsFor, evaluateProposal, ACTION_REGISTRY } = require('../services/care-agent-actions.service');
const { loadAccountSnapshot } = require('../services/care-agent-account.service');
const { createActionExecutor, describeAuditEvent } = require('../services/care-agent-action-executor.service');
const { createPlanPaymentService } = require('../services/plan-payment.service');
const { marketplaceAuctionService } = require('../services/marketplace-auction.service');

// The one path by which a Care Agent action changes anything (v1.18.0).
// acceptOffer and the plan-payment service are the same ones
// marketplace.js and payments.js use, so the agent never has its own
// money logic.
const loadAccount = (userId) => loadAccountSnapshot({ query, userId });
const planPaymentService = createPlanPaymentService({ query, transaction });
const actionExecutor = createActionExecutor({
  query,
  transaction,
  loadAccount,
  acceptOffer: (offerId, userId) => marketplaceAuctionService.acceptOffer(offerId, userId),
  processPayment: (args) => planPaymentService.processPayment(args),
});

// Bot crawling prevention (CLAUDE.md requirement) — belt-and-braces on top
// of the header server.js already sets globally.
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

// The recognized procedure list is finite — send id/label pairs so the
// frontend can present them as tappable choices instead of leaving the
// patient to guess phrasing against an invisible dictionary (see
// PROCEDURE_CATEGORIES in care-agent-nlp.service.js for why this exists).
// Never leaks the internal `keywords` matching phrases.
const PROCEDURE_OPTIONS = PROCEDURE_CATEGORIES.map(({ id, label }) => ({ id, label }));

// The very first thing a patient sees. Deliberately NOT derived from
// nextQuestion() -- missingFieldsFor({}) always includes quotedAmountCents,
// so nextQuestion({}) is never null, and a `nextQuestion(summary) || fallback`
// construction here would mean this warmer text could never actually fire.
// A brand-new conversation gets an explicit greeting; the narrower per-turn
// follow-ups from nextQuestion() take over from the patient's first reply
// onward, once the conversation is already under way.
const OPENING_GREETING =
  "Hi, I'm the PaySick Care Agent. Tell me what's going on, the treatment, a quote you've received, or a bill you're dealing with, and I'll help you work out how to afford it.";

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

function hasAccountActivity(account) {
  if (!account) return false;
  if ((account.plans || []).some((p) => p.status === 'active')) return true;
  return ['instalments', 'applications', 'funderPlans', 'openRequests'].some((key) => (account[key] || []).length > 0);
}

// Refusals the patient should hear about even when the message might have
// been about something else.
const ALWAYS_EXPLAIN = ['NOT_IN_CHAT', 'BANKING_DETAILS_IN_CHAT'];

/**
 * The deterministic fallback's account intent, only when it actually fits
 * this account: "how do I pay for a knee op" from a patient with nothing
 * owing is a new care request, not a payment.
 */
function accountIntentFor(intent, account) {
  if (!intent) return null;
  const def = ACTION_REGISTRY[intent];
  if ((def.inputs || []).some((input) => !input.optional)) {
    // Needs the patient's details first; just check it applies at all.
    const probe = evaluateProposal(intent, { preferredDay: 1, newTermMonths: 1, promisedDate: account.today, ...suggestParamsFor(intent, account) }, account);
    return probe.ok || ALWAYS_EXPLAIN.includes(probe.reason) ? intent : null;
  }
  const check = evaluateProposal(intent, suggestParamsFor(intent, account), account);
  return check.ok || ALWAYS_EXPLAIN.includes(check.reason) ? intent : null;
}

/** The deterministic fallback's reply, from what proposing actually did. */
function fallbackReplyFor(proposal) {
  if (proposal.status === 'awaiting_consent') {
    return proposal.authority === 'human_review'
      ? "I've prepared this for the PaySick team. Check it below and send it when you're ready."
      : "I've prepared this for you to check below. Nothing happens until you confirm.";
  }
  if (proposal.status === 'executed' && proposal.result) {
    if (proposal.result.rankedOffers) {
      return proposal.result.rankedOffers.length
        ? "Here are your offers, in order of what you'd repay in total."
        : "There aren't any offers waiting right now.";
    }
    if (proposal.result.decisions && proposal.result.decisions[0]) return proposal.result.decisions[0].rationale;
    if (proposal.result.explanation) return proposal.result.explanation;
  }
  return proposal.message || "I couldn't do that here.";
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

    res.status(201).json({
      sessionId: session.session_id,
      stage: session.stage,
      summary,
      missingFields: missing,
      reply: OPENING_GREETING,
      procedureOptions: PROCEDURE_OPTIONS,
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
 * Reconstructs this session's conversation so far as plain alternating
 * user/assistant turns, from the audit trail's CONVERSATION_TURN rows.
 * Intermediate tool_use/tool_result blocks from earlier turns are not
 * replayed -- their effect is already captured in structured_summary,
 * which buildSystemPrompt() surfaces to the model on every call, so the
 * model never needs to "remember" its own past tool calls verbatim.
 */
async function loadConversationHistory(sessionId) {
  const result = await query(
    `SELECT payload FROM care_agent_audit_log
     WHERE session_id = $1 AND event_type = 'CONVERSATION_TURN'
     ORDER BY created_at ASC`,
    [sessionId]
  );
  const history = [];
  for (const row of result.rows) {
    const payload = row.payload || {};
    if (payload.message) history.push({ role: 'user', content: payload.message });
    if (payload.reply) history.push({ role: 'assistant', content: payload.reply });
  }
  return history;
}

/**
 * POST /api/care-agent/sessions/:id/messages
 *
 * Primary path: the LLM tool-calling agent (care-agent-llm.service.js) --
 * the model reasons about the conversation and decides which of PaySick's
 * deterministic functions to call. Falls back to the deterministic
 * regex/trigram engine (care-agent-nlp.service.js) only when the LLM path
 * is unavailable (no ANTHROPIC_API_KEY configured, e.g. in this dev
 * sandbox) or errors -- the patient is never left with no response
 * either way, and which path ran is always recorded in the audit trail.
 */
router.post('/sessions/:id/messages', authenticateToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const currentSummary = session.structured_summary || {};
    let merged;
    let reply;
    let usedLlm = false;
    let toolCalls = [];
    let fallbackReason = null;
    let proposalDrafts = [];
    let suggestedAction = null;

    // The patient's account, read once per turn, so the agent can help with
    // an existing plan as well as a new request. Read-only.
    let account = null;
    try {
      account = await loadAccountSnapshot({ query, userId: req.user.userId });
    } catch (accountError) {
      console.error('Care Agent account snapshot error:', accountError.message);
    }

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const history = await loadConversationHistory(session.session_id);
        const turn = await runCareAgentTurn({ summary: currentSummary, history, userMessage: message, account });
        merged = turn.summary;
        reply = turn.reply || "Here's what I've got so far. Please confirm it's right, or edit anything that's off.";
        toolCalls = turn.toolCalls;
        proposalDrafts = turn.proposalDrafts || [];
        usedLlm = true;
      } catch (llmError) {
        console.error('Care Agent LLM error, falling back to deterministic extraction:', llmError.message);
        fallbackReason = llmError.message;
      }
    } else {
      fallbackReason = 'ANTHROPIC_API_KEY not configured';
    }

    // Deterministic fallback for account requests: only once the patient has
    // something on their account, so "I need a knee op" still goes to the
    // care-request extraction below. An action that needs details from the
    // patient (a date, a day, a term) comes back as a form to fill in, never
    // a guess.
    const accountIntent = !usedLlm && hasAccountActivity(account) ? accountIntentFor(detectAccountIntent(message), account) : null;
    if (accountIntent) {
      merged = currentSummary;
      const def = ACTION_REGISTRY[accountIntent];
      const params = suggestParamsFor(accountIntent, account);
      const needsInput = (def.inputs || []).some((input) => !input.optional);
      if (needsInput) {
        suggestedAction = { actionType: accountIntent, label: def.label, authority: def.authority, inputs: def.inputs, params };
        reply = def.authority === 'human_review'
          ? `I can prepare that for the PaySick team, who decide on changes like this. Add the details below and I'll set it up for you to send.`
          : `I can set that up. Add the details below and I'll prepare it for you to check.`;
      } else {
        proposalDrafts = [{ actionType: accountIntent, params }];
      }
    } else if (!usedLlm) {
      const extracted = extractCareRequest(message);
      merged = mergeCareSummary(currentSummary, extracted, message);
      const question = nextQuestion(merged);
      reply = question || "Here's what I've got so far. Please confirm it's right, or edit anything that's off.";
    }

    // Drafts from either engine become proposals made by the agent. None of
    // them does anything until the patient confirms it.
    const proposals = [];
    for (const draft of proposalDrafts) {
      proposals.push(await actionExecutor.propose({
        sessionId: session.session_id,
        userId: req.user.userId,
        actionType: draft.actionType,
        params: draft.params,
        proposedBy: 'agent',
      }));
    }
    if (accountIntent && proposals.length > 0) reply = fallbackReplyFor(proposals[0]);

    const missing = missingFieldsFor(merged);
    const readyToConfirm = missing.length === 0;

    await query(
      `UPDATE care_agent_sessions SET structured_summary = $1, updated_at = NOW() WHERE session_id = $2`,
      [JSON.stringify(merged), session.session_id]
    );
    await recordAudit(session.session_id, 'CONVERSATION_TURN', 'patient', {
      message,
      reply,
      usedLlm,
      toolCalls,
      fallbackReason,
      accountIntent,
      proposalIds: proposals.map((p) => p.proposalId).filter(Boolean),
    });

    res.json({
      sessionId: session.session_id,
      summary: merged,
      missingFields: missing,
      reply,
      readyToConfirm: accountIntent ? false : readyToConfirm,
      procedureOptions: PROCEDURE_OPTIONS,
      proposals,
      suggestedAction,
    });
  } catch (error) {
    console.error('Care Agent message error:', error.message);
    res.status(500).json({ error: 'Failed to process that message' });
  }
});

/**
 * POST /api/care-agent/sessions/:id/documents
 *
 * Lets a patient upload a quote, invoice, or medical-scheme statement
 * (base64-encoded in the JSON body -- no multipart dependency needed,
 * and it's exactly the shape the Anthropic API itself expects) and have
 * its fields extracted automatically, replacing the old "I can't read
 * inside documents yet" stub.
 *
 * Same discipline as /messages: extraction never updates the summary
 * directly. The model's result is fed through the exact same
 * executeTool('update_care_summary', ...) guardrail the conversational
 * agent uses (independently re-validates every field; a field already
 * recorded never gets overwritten) before anything is merged. Falls back
 * to asking the patient to type the figures when the API is unavailable
 * or errors -- there is no local OCR fallback for document reading
 * itself, unlike the conversational agent's deterministic text fallback.
 */
router.post('/sessions/:id/documents', authenticateToken, async (req, res) => {
  try {
    const { fileBase64, mediaType, filename } = req.body;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'fileBase64 is required' });
    }
    if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: `mediaType must be one of: ${ALLOWED_MEDIA_TYPES.join(', ')}` });
    }

    let decodedBytes;
    try {
      decodedBytes = Buffer.byteLength(fileBase64, 'base64');
    } catch {
      return res.status(400).json({ error: 'fileBase64 is not valid base64' });
    }
    if (decodedBytes > MAX_DOCUMENT_BYTES) {
      return res.status(400).json({ error: `File is too large (max ${Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024))}MB)` });
    }

    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const currentSummary = session.structured_summary || {};
    const safeFilename = String(filename || 'document').slice(0, 120);

    let merged = currentSummary;
    let reply;
    let documentType = null;
    let recorded = [];
    let rejected = [];
    let fallbackReason = null;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const extraction = await extractFromDocument({ base64Data: fileBase64, mediaType });
        documentType = extraction.documentType;
        const outcome = executeTool('update_care_summary', extraction.fields, { summary: currentSummary });
        recorded = outcome.result.recorded;
        rejected = outcome.result.rejected;
        if (outcome.summaryPatch) merged = mergeCareSummary(currentSummary, outcome.summaryPatch);
        reply = describeExtraction({ documentType, recorded });
      } catch (docError) {
        console.error('Care Agent document extraction error:', docError.message);
        fallbackReason = docError.message;
      }
    } else {
      fallbackReason = 'ANTHROPIC_API_KEY not configured';
    }

    if (fallbackReason) {
      reply = "I can't read documents right now. Please tell me the quoted amount and treatment from it in your own words instead.";
    }

    const missing = missingFieldsFor(merged);
    const readyToConfirm = missing.length === 0;

    await query(
      `UPDATE care_agent_sessions SET structured_summary = $1, updated_at = NOW() WHERE session_id = $2`,
      [JSON.stringify(merged), session.session_id]
    );
    await recordAudit(session.session_id, 'DOCUMENT_PROCESSED', 'patient', {
      filename: safeFilename,
      mediaType,
      documentType,
      recorded,
      rejected,
      fallbackReason,
    });

    res.json({
      sessionId: session.session_id,
      summary: merged,
      missingFields: missing,
      reply,
      readyToConfirm,
      procedureOptions: PROCEDURE_OPTIONS,
      documentType,
    });
  } catch (error) {
    console.error('Care Agent document error:', error.message);
    res.status(500).json({ error: 'Failed to process that document' });
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

    // Stored on the summary so /approve can pass them to the marketplace
    // endpoint, which only runs Shield Gate 2 when monthlyIncome is present.
    const { monthlyIncome, monthlyObligations } = req.body;
    const isAmount = (v) => v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
    if (isAmount(monthlyIncome)) {
      finalSummary.monthlyIncomeCents = toCents(monthlyIncome);
      finalSummary.monthlyObligationsCents = isAmount(monthlyObligations) ? toCents(monthlyObligations) : 0;
    }

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
      // Income from /confirm, so the marketplace runs Shield Gate 2 at
      // submission. Left undefined when not shared (Gate 2 is then skipped).
      monthlyIncome: summary.monthlyIncomeCents != null ? toRands(summary.monthlyIncomeCents) : undefined,
      monthlyObligations: summary.monthlyObligationsCents != null ? toRands(summary.monthlyObligationsCents) : undefined,
      medicalAidCovered: toRands(summary.schemeContributionCents),
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
      // New instalments default to 'SCHEDULED' (001_marketplace_tables.sql);
      // 'PENDING' is also treated as upcoming.
      `SELECT lr.scheduled_amount, lr.scheduled_date
       FROM loan_repayments lr
       JOIN marketplace_loans ml ON lr.loan_id = ml.loan_id
       WHERE ml.user_id = $1 AND lr.status IN ('SCHEDULED', 'PENDING')
       ORDER BY lr.scheduled_date ASC
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
    const dueDateDisplay = new Date(row.scheduled_date).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
    });

    res.json({
      hasActiveLoan: true,
      nextPayment: { amount: Number(row.scheduled_amount), dueDate: row.scheduled_date },
      reply: `Your next payment of R${row.scheduled_amount} is scheduled for ${dueDateDisplay}.`,
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

// ============================================
// VALUE CHAIN (v1.18.0) — governed account actions
//
// Every action after the first conversation goes through
// care-agent-action-executor.service.js. Its authority tier comes from
// the registry in care-agent-actions.service.js, never from the request:
//   autonomous       read-only, done at once
//   patient_consent  a proposal the patient confirms here
//   human_review     a request the patient sends; the team decides
//   prohibited       refused, with where to go instead
// ============================================

function sendResult(res, result) {
  res.status(result.httpStatus || 200).json({
    ...result,
    error: result.httpStatus >= 400 ? result.message : undefined,
  });
}

/**
 * GET /api/care-agent/sessions/:id/account
 *
 * The patient's account as the agent sees it, with the agent's decisions.
 * Read-only; the decisions are written to the audit trail as AGENT_DECISION.
 */
router.get('/sessions/:id/account', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { account, journeyStage, decisions, actions, rankedOffers } = await actionExecutor.recordAgentDecisions({
      sessionId: session.session_id,
      userId: req.user.userId,
    });

    res.json({
      sessionId: session.session_id,
      journeyStage,
      decisions,
      actions: actions.map((a) => ({ ...a, inputs: ACTION_REGISTRY[a.actionType].inputs || [] })),
      rankedOffers,
      plans: account.plans,
      instalments: account.instalments,
      funderPlans: account.funderPlans,
      openRequests: account.openRequests,
      promises: account.promises,
    });
  } catch (error) {
    console.error('Care Agent account error:', error.message);
    res.status(500).json({ error: 'Failed to load your account' });
  }
});

/**
 * POST /api/care-agent/sessions/:id/actions
 * Body: { actionType, params }
 *
 * The patient asks for an action from a card or chip. Same path as a draft
 * from the agent, but recorded as the patient's own request.
 */
router.post('/sessions/:id/actions', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const { actionType, params } = req.body;
    if (!actionType || typeof actionType !== 'string') {
      return res.status(400).json({ error: 'actionType is required' });
    }

    const result = await actionExecutor.propose({
      sessionId: session.session_id,
      userId: req.user.userId,
      actionType,
      params: params && typeof params === 'object' ? params : {},
      proposedBy: 'patient',
    });
    sendResult(res, result);
  } catch (error) {
    console.error('Care Agent propose error:', error.message);
    res.status(500).json({ error: 'Failed to prepare that' });
  }
});

/**
 * POST /api/care-agent/sessions/:id/actions/:proposalId/confirm
 * Body: { consent: true }
 *
 * The patient's go-ahead. The executor claims the proposal once, checks it
 * has not expired, re-checks it against live data, then performs it. Has
 * its own rate limit (server.js careAgentActionLimiter).
 */
router.post('/sessions/:id/actions/:proposalId/confirm', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await actionExecutor.confirm({
      sessionId: session.session_id,
      userId: req.user.userId,
      proposalId: req.params.proposalId,
      consent: req.body.consent === true,
    });
    sendResult(res, result);
  } catch (error) {
    console.error('Care Agent confirm action error:', error.message);
    res.status(500).json({ error: "I couldn't complete that just now. Nothing was changed." });
  }
});

/**
 * POST /api/care-agent/sessions/:id/actions/:proposalId/decline
 */
router.post('/sessions/:id/actions/:proposalId/decline', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const result = await actionExecutor.decline({
      sessionId: session.session_id,
      userId: req.user.userId,
      proposalId: req.params.proposalId,
    });
    sendResult(res, result);
  } catch (error) {
    console.error('Care Agent decline action error:', error.message);
    res.status(500).json({ error: 'Failed to record that' });
  }
});

/**
 * GET /api/care-agent/sessions/:id/decisions
 *
 * What the agent read, decided, prepared and did in this conversation,
 * tagged by who acted, plus each proposal and how it ended. Conversation
 * turns themselves are left out: the chat already shows them.
 */
router.get('/sessions/:id/decisions', authenticateToken, async (req, res) => {
  try {
    const session = await getOwnedSession(req.params.id, req.user.userId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const auditResult = await query(
      `SELECT event_type, actor, payload, created_at
       FROM care_agent_audit_log
       WHERE session_id = $1 AND event_type <> 'CONVERSATION_TURN'
       ORDER BY created_at ASC`,
      [session.session_id]
    );
    const proposalResult = await query(
      `SELECT proposal_id, action_type, authority, status, proposed_by, summary, created_at, decided_at, executed_at
       FROM care_agent_action_proposals
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [session.session_id]
    );

    res.json({
      sessionId: session.session_id,
      timeline: auditResult.rows.map(describeAuditEvent),
      proposals: proposalResult.rows.map((p) => ({
        proposalId: p.proposal_id,
        actionType: p.action_type,
        authority: p.authority,
        status: p.status,
        proposedBy: p.proposed_by,
        title: (p.summary && p.summary.title) || p.action_type,
        createdAt: p.created_at,
        decidedAt: p.decided_at,
        executedAt: p.executed_at,
      })),
    });
  } catch (error) {
    console.error('Care Agent decisions error:', error.message);
    res.status(500).json({ error: 'Failed to load what the agent did' });
  }
});

module.exports = router;
