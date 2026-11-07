'use strict';

/**
 * CARE AGENT — ACTION EXECUTOR
 *
 * The only place a Care Agent action changes anything. Every write in the
 * patient value chain after the first conversation goes through one
 * proposal record (care_agent_action_proposals, migration 013):
 *
 *   propose  ->  evaluateProposal() against the live account.
 *                autonomous      runs now (read-only), logged as the agent's
 *                patient_consent stored as awaiting_consent
 *                human_review    stored as awaiting_consent (the patient
 *                                sends the request; the agent never lodges
 *                                one on its own)
 *                prohibited / invalid  refused, with where to go instead
 *
 *   confirm  ->  explicit consent === true, then an atomic claim
 *                (awaiting_consent -> confirming) so a double-tap cannot
 *                execute twice, then expiry, then a re-check against LIVE
 *                data (refused if the instalment is no longer owed, the
 *                offer is gone, or the amount changed since the patient
 *                agreed), then the backend update:
 *                  ACCEPT_OFFER   marketplaceAuctionService.acceptOffer()
 *                  MAKE_PAYMENT   plan-payment.service.js, then the open
 *                                 collection case closes as paid and any
 *                                 pending promise is marked kept
 *                  PROMISE_TO_PAY promise_to_pay + collection_actions,
 *                                 case -> in_progress
 *                  team requests  manual_review_queue case + a
 *                                 patient-visible care_agent_manage_requests
 *                                 row
 *                and an in-app notification.
 *
 *   decline  ->  awaiting_consent -> declined.
 *
 * Every step is written to care_agent_audit_log, tagged by who acted, so
 * GET /sessions/:id/decisions can show the patient what the agent did.
 *
 * The language model never reaches confirm(): care-agent-llm.service.js
 * has no tool for it, and routes/care-agent.js only calls it from the
 * patient's own POST /actions/:id/confirm.
 *
 * All dependencies are injected so the state machine runs under node --test.
 */

const {
  AUTHORITY,
  ACTION_REGISTRY,
  evaluateProposal,
  decideNextBestActions,
  rankOffers,
  formatAmount,
  daysOverdueFor,
} = require('./care-agent-actions.service');
const { calculateLateFee } = require('./fee.service');
const { toCents, toRands } = require('../utils/money');

const PROPOSAL_TTL_MINUTES = 30;

// A re-check that produces a different figure for any of these means the
// patient has not agreed to what would now happen.
const CONSENTED_AMOUNT_FIELDS = ['totalDueCents', 'promisedAmountCents'];

const NOTIFICATION_TYPES = {
  ACCEPT_OFFER: 'care_agent_offer_accepted',
  MAKE_PAYMENT: 'care_agent_payment',
  PROMISE_TO_PAY: 'care_agent_promise',
  REQUEST: 'care_agent_request',
};

function labelFor(actionType) {
  return ACTION_REGISTRY[actionType] ? ACTION_REGISTRY[actionType].label : actionType;
}

function createActionExecutor({ query, transaction, loadAccount, acceptOffer, processPayment, now = () => new Date() }) {
  async function audit(sessionId, eventType, actor, payload) {
    await query(
      `INSERT INTO care_agent_audit_log (session_id, event_type, actor, payload)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, eventType, actor, JSON.stringify(payload || {})]
    );
  }

  async function notify(userId, type, subject, message, entityType, entityId) {
    // A failed notification never undoes a completed action.
    try {
      await query(
        `INSERT INTO notifications (user_id, type, channel, subject, message, status, sent_at, related_entity_type, related_entity_id)
         VALUES ($1, $2, 'in_app', $3, $4, 'sent', NOW(), $5, $6)`,
        [userId, type, subject, message, entityType, entityId || null]
      );
    } catch (err) {
      console.error('Care Agent notification error:', err.message);
    }
  }

  async function finalize(proposalId, status, result) {
    await query(
      `UPDATE care_agent_action_proposals
       SET status = $2, result = $3, executed_at = CASE WHEN $2 IN ('executed', 'lodged') THEN NOW() ELSE executed_at END
       WHERE proposal_id = $1`,
      [proposalId, status, JSON.stringify(result || {})]
    );
  }

  function autonomousResult(actionType, params, account) {
    switch (actionType) {
      case 'VIEW_ACCOUNT': {
        const decided = decideNextBestActions(account);
        return { ...decided, plans: account.plans, instalments: account.instalments, funderPlans: account.funderPlans || [] };
      }
      case 'COMPARE_OFFERS':
        return { rankedOffers: rankOffers((account.applications || []).flatMap((a) => a.pendingOffers || [])) };
      case 'EXPLAIN_FEE': {
        const target = (account.instalments || []).find((i) => i.paymentId === params.paymentId) || (account.instalments || [])[0];
        if (!target) return { explanation: 'Payments made on time have no fees and no interest.' };
        const days = daysOverdueFor(target, account.today);
        const fee = calculateLateFee(toRands(target.amountCents), days);
        return {
          paymentId: target.paymentId,
          daysOverdue: days,
          lateFeeCents: toCents(fee.late_fee_amount),
          explanation: 'Payments made on time have no fees and no interest. A late instalment adds 5% for each full month it is overdue.',
        };
      }
      default:
        return {};
    }
  }

  /**
   * @param {{ sessionId, userId, actionType, params, proposedBy: 'agent'|'patient' }} args
   */
  async function propose({ sessionId, userId, actionType, params, proposedBy }) {
    const by = proposedBy === 'agent' ? 'agent' : 'patient';
    const account = await loadAccount(userId);
    const evaluation = evaluateProposal(actionType, params, account);

    if (!evaluation.ok) {
      await audit(sessionId, 'ACTION_REFUSED', 'agent', {
        actionType, proposedBy: by, reason: evaluation.reason, message: evaluation.message, redirect: evaluation.redirect || null,
      });
      return { status: 'refused', httpStatus: evaluation.authority === AUTHORITY.PROHIBITED ? 403 : 400, ...evaluation };
    }

    if (evaluation.authority === AUTHORITY.AUTONOMOUS) {
      const result = autonomousResult(actionType, params || {}, account);
      await audit(sessionId, 'ACTION_EXECUTED', 'agent', { actionType, authority: evaluation.authority, requestedBy: by });
      return { status: 'executed', httpStatus: 200, ...evaluation, result };
    }

    const expiresAt = new Date(now().getTime() + PROPOSAL_TTL_MINUTES * 60 * 1000).toISOString();
    const inserted = await query(
      `INSERT INTO care_agent_action_proposals
         (session_id, user_id, action_type, authority, params, summary, consent_text, effect, proposed_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING proposal_id, expires_at`,
      [
        sessionId, userId, actionType, evaluation.authority,
        JSON.stringify(evaluation.params), JSON.stringify(evaluation.summary),
        evaluation.consentText, evaluation.effect, by, expiresAt,
      ]
    );
    const proposalId = inserted.rows[0].proposal_id;
    await audit(sessionId, 'ACTION_PROPOSED', by, { proposalId, actionType, authority: evaluation.authority, params: evaluation.params });

    return { status: 'awaiting_consent', httpStatus: 201, proposalId, expiresAt, ...evaluation };
  }

  async function claimOrExplain(proposalId, sessionId, userId, claimSql) {
    const claimed = await query(claimSql, [proposalId, sessionId, userId]);
    if (claimed.rows.length > 0) return { row: claimed.rows[0] };
    const existing = await query(
      `SELECT status, expires_at FROM care_agent_action_proposals
       WHERE proposal_id = $1 AND session_id = $2 AND user_id = $3`,
      [proposalId, sessionId, userId]
    );
    if (existing.rows.length === 0) return { outcome: { status: 'not_found', httpStatus: 404, message: 'That request was not found.' } };
    return { outcome: { status: 'already_decided', httpStatus: 409, currentStatus: existing.rows[0].status, message: 'That request has already been dealt with.' } };
  }

  async function runHandler(row, evaluation, userId) {
    const params = evaluation.params;
    const type = row.action_type;

    if (type === 'ACCEPT_OFFER') {
      const result = await acceptOffer(params.offerId, userId);
      await notify(userId, NOTIFICATION_TYPES.ACCEPT_OFFER, 'Offer accepted', 'You accepted a funder offer through the Care Agent. Your payment schedule is being set up.', 'application', params.applicationId);
      return { status: 'executed', result, message: "Done. You've accepted the offer and your payment schedule is being set up." };
    }

    if (type === 'MAKE_PAYMENT') {
      const result = await processPayment({ paymentId: params.paymentId, userId, paymentMethod: 'care_agent' });
      const closed = await query(
        `UPDATE collections
         SET status = 'resolved', resolution_type = 'paid', resolution_date = NOW(), updated_at = NOW()
         WHERE payment_id = $1 AND user_id = $2 AND status IN ('open', 'in_progress')
         RETURNING collection_id`,
        [params.paymentId, userId]
      );
      const closedIds = closed.rows.map((r) => r.collection_id);
      if (closedIds.length > 0) {
        await query(
          `UPDATE promise_to_pay SET status = 'kept', resolved_at = NOW()
           WHERE collection_id = ANY($1) AND status = 'pending'`,
          [closedIds]
        );
      }
      await notify(userId, NOTIFICATION_TYPES.MAKE_PAYMENT, 'Payment received', `We received your payment of ${formatAmount(params.totalDueCents)}.`, 'payment', params.paymentId);
      return { status: 'executed', result: { ...result, collectionsResolved: closedIds }, message: `Paid. ${formatAmount(params.totalDueCents)} is recorded and a receipt is in your notifications.` };
    }

    if (type === 'PROMISE_TO_PAY') {
      const promiseId = await transaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO promise_to_pay (collection_id, promised_amount_cents, promised_date)
           VALUES ($1, $2, $3)
           RETURNING promise_id`,
          [params.collectionId, params.promisedAmountCents, params.promisedDate]
        );
        await client.query(
          `INSERT INTO collection_actions (collection_id, action_type, performed_by, subject, message)
           VALUES ($1, 'promise_to_pay', 'care_agent', $2, $3)`,
          [params.collectionId, 'Promise to pay', `Patient promised ${formatAmount(params.promisedAmountCents)} by ${params.promisedDate} via the Care Agent.`]
        );
        await client.query(
          `UPDATE collections SET status = 'in_progress', next_action_date = $3, updated_at = NOW()
           WHERE collection_id = $1 AND user_id = $2`,
          [params.collectionId, userId, params.promisedDate]
        );
        return inserted.rows[0].promise_id;
      });
      await notify(userId, NOTIFICATION_TYPES.PROMISE_TO_PAY, 'Promise recorded', `You promised to pay ${formatAmount(params.promisedAmountCents)} by ${params.promisedDate}.`, 'collection', params.collectionId);
      return { status: 'executed', result: { promiseId }, message: `Recorded. You've promised ${formatAmount(params.promisedAmountCents)} by ${params.promisedDate}, and reminders are held until then.` };
    }

    // Every remaining consent-gated action is a human_review request.
    const def = ACTION_REGISTRY[type];
    const lodged = await transaction(async (client) => {
      const queued = await client.query(
        `INSERT INTO manual_review_queue (review_type, priority, sla_hours, sla_deadline, status)
         VALUES ($1, $2, $3, NOW() + make_interval(hours => $3), 'OPEN')
         RETURNING id`,
        [`CARE_AGENT_${type}`, def.priority, def.slaHours]
      );
      const reviewQueueId = queued.rows[0].id;
      const request = await client.query(
        `INSERT INTO care_agent_manage_requests (session_id, request_type, reason, details, review_queue_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING request_id`,
        [row.session_id, type, params.reason || null, JSON.stringify(params), reviewQueueId]
      );
      return { requestId: request.rows[0].request_id, reviewQueueId };
    });
    await notify(userId, NOTIFICATION_TYPES.REQUEST, 'Request received', `Your request (${def.label.toLowerCase()}) is with the PaySick team.`, 'care_agent_request', lodged.requestId);
    return {
      status: 'lodged',
      result: lodged,
      message: `Sent to the PaySick team. They aim to respond within ${def.slaHours} hours, and nothing changes on your plan until they've decided.`,
    };
  }

  /**
   * @param {{ sessionId, userId, proposalId, consent }} args
   */
  async function confirm({ sessionId, userId, proposalId, consent }) {
    if (consent !== true) {
      return { status: 'consent_required', httpStatus: 400, message: 'Please confirm you agree before PaySick acts on this.' };
    }

    const { row, outcome } = await claimOrExplain(
      proposalId, sessionId, userId,
      `UPDATE care_agent_action_proposals
       SET status = 'confirming', decided_at = NOW()
       WHERE proposal_id = $1 AND session_id = $2 AND user_id = $3 AND status = 'awaiting_consent'
       RETURNING *`
    );
    if (outcome) return outcome;

    const actionType = row.action_type;
    if (new Date(row.expires_at).getTime() < now().getTime()) {
      await finalize(proposalId, 'expired', {});
      await audit(sessionId, 'ACTION_EXPIRED', 'system', { proposalId, actionType });
      return { status: 'expired', httpStatus: 410, proposalId, actionType, message: 'That request timed out. Ask again and I will prepare it with the latest figures.' };
    }

    const account = await loadAccount(userId);
    const evaluation = evaluateProposal(actionType, row.params || {}, account);
    let refusal = evaluation.ok ? null : { reason: evaluation.reason, message: evaluation.message };
    if (!refusal) {
      const changed = CONSENTED_AMOUNT_FIELDS.find((field) => row.params && field in row.params && row.params[field] !== evaluation.params[field]);
      if (changed) refusal = { reason: 'AMOUNT_CHANGED', message: `The amount has changed since you agreed. It is now ${formatAmount(evaluation.params[changed])}, so please check and confirm again.` };
    }
    if (refusal) {
      await finalize(proposalId, 'refused', refusal);
      await audit(sessionId, 'ACTION_REFUSED_ON_RECHECK', 'agent', { proposalId, actionType, ...refusal });
      return { status: 'refused', httpStatus: 409, proposalId, actionType, ...refusal };
    }

    try {
      const handled = await runHandler(row, evaluation, userId);
      await finalize(proposalId, handled.status, handled.result);
      await audit(sessionId, handled.status === 'lodged' ? 'REQUEST_LODGED' : 'ACTION_EXECUTED', 'patient', {
        proposalId, actionType, authority: row.authority, result: handled.result,
      });
      return { status: handled.status, httpStatus: 200, proposalId, actionType, authority: row.authority, result: handled.result, message: handled.message };
    } catch (err) {
      await finalize(proposalId, 'failed', { error: err.message });
      await audit(sessionId, 'ACTION_FAILED', 'system', { proposalId, actionType, error: err.message });
      return { status: 'failed', httpStatus: err.statusCode || 500, proposalId, actionType, message: err.statusCode ? err.message : "I couldn't complete that just now. Nothing was changed." };
    }
  }

  async function decline({ sessionId, userId, proposalId }) {
    const { row, outcome } = await claimOrExplain(
      proposalId, sessionId, userId,
      `UPDATE care_agent_action_proposals
       SET status = 'declined', decided_at = NOW()
       WHERE proposal_id = $1 AND session_id = $2 AND user_id = $3 AND status = 'awaiting_consent'
       RETURNING *`
    );
    if (outcome) return outcome;
    await audit(sessionId, 'ACTION_DECLINED', 'patient', { proposalId, actionType: row.action_type });
    return { status: 'declined', httpStatus: 200, proposalId, actionType: row.action_type, message: "No problem, I haven't done anything." };
  }

  /** Runs the decision rules on the live account and records them. */
  async function recordAgentDecisions({ sessionId, userId }) {
    const account = await loadAccount(userId);
    const decided = decideNextBestActions(account);
    await audit(sessionId, 'AGENT_DECISION', 'agent', {
      journeyStage: decided.journeyStage,
      reasonCodes: decided.decisions.map((d) => d.reasonCode),
      decisions: decided.decisions,
      suggestedActions: decided.actions.map((a) => ({ actionType: a.actionType, authority: a.authority, reasonCode: a.reasonCode })),
    });
    return { account, ...decided };
  }

  return { propose, confirm, decline, recordAgentDecisions };
}

// ─── Timeline ───────────────────────────────────────────────────────────────

const FIXED_TEXT = {
  SESSION_STARTED: 'Started the conversation',
  DOCUMENT_PROCESSED: 'Read a document you uploaded',
  SUMMARY_CONFIRMED: 'You confirmed your care summary',
  APPROVED: 'You gave consent and chose a payment plan',
  EXECUTED: 'Your application was submitted',
  PAYMENT_DATE_CHANGE_REQUESTED: 'Payment date change sent to the PaySick team',
};

/**
 * Turns one care_agent_audit_log row into a plain timeline line, tagged by
 * who acted: Agent, You, Team, Blocked, or PaySick (the system).
 */
function describeAuditEvent(row) {
  const payload = row.payload || {};
  const label = payload.actionType ? labelFor(payload.actionType) : '';
  let tier = row.actor === 'agent' ? 'Agent' : row.actor === 'patient' ? 'You' : 'PaySick';
  let text;

  switch (row.event_type) {
    case 'AGENT_DECISION': {
      const decisions = payload.decisions || [];
      const codes = decisions.map((d) => d.reasonCode).join(', ');
      text = `Decided ${codes}${decisions[0] ? `: ${decisions[0].rationale}` : ''}`;
      break;
    }
    case 'ACTION_PROPOSED': text = `Prepared: ${label}`; break;
    case 'ACTION_EXECUTED': text = row.actor === 'agent' ? `Did: ${label}` : `Confirmed: ${label}`; break;
    case 'ACTION_DECLINED': text = `Said no to: ${label}`; break;
    case 'ACTION_EXPIRED': text = `Timed out: ${label}`; break;
    case 'ACTION_FAILED': text = `Couldn't complete: ${label}`; break;
    case 'REQUEST_LODGED': tier = 'Team'; text = `Sent to the PaySick team: ${label}`; break;
    case 'ACTION_REFUSED':
    case 'ACTION_REFUSED_ON_RECHECK':
      tier = 'Blocked';
      text = `Not done: ${label}${payload.message ? `. ${payload.message}` : ''}`;
      break;
    default:
      text = FIXED_TEXT[row.event_type] || row.event_type;
  }

  return { at: row.created_at, actor: row.actor, tier, eventType: row.event_type, text };
}

module.exports = {
  createActionExecutor,
  describeAuditEvent,
  PROPOSAL_TTL_MINUTES,
};
