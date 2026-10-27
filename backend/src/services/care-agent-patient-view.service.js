'use strict';

/**
 * CARE AGENT — PATIENT VIEW
 *
 * The single filter between the Care Agent's backend and the patient's
 * screen. Owner direction (v1.19.0): the agent's decisions belong in the
 * backend. The patient sees confirmed facts and statuses only (what is
 * owed and when, what they can do, the outcome of what they confirmed),
 * and nothing that makes it feel like an agent is working in the
 * background.
 *
 * Decisions, reason codes, rationales, authority tiers, journey stages,
 * review routing and offer ranking all still exist and are still written
 * to care_agent_audit_log; staff read them through the admin-only
 * GET /api/care-agent/admin/sessions/:id/decisions. They never reach the
 * patient, because both functions here build their output from an
 * allowlist: a field added to the backend later can't leak by default.
 */

const {
  ACTION_REGISTRY,
  AUTHORITY,
  daysOverdueFor,
  formatAmount,
} = require('./care-agent-actions.service');

/** Fields that must never appear in anything sent to the patient. */
const INTERNAL_KEYS = Object.freeze([
  'decisions', 'reasonCode', 'reasonCodes', 'rationale', 'journeyStage', 'authority', 'authorityLabel',
  'priority', 'slaHours', 'effect', 'reason', 'stage', 'recommended', 'rank', 'reviewQueueId',
  'pressureWarning', 'interestRate', 'proposedBy', 'primary', 'suggestedActions', 'rankedOffers',
  'affordabilityRatio', 'httpStatus',
]);

const UNPAID = ['scheduled', 'overdue', 'failed', 'processing'];

function sortedUnpaid(account) {
  return (account.instalments || [])
    .filter((i) => UNPAID.includes(String(i.status).toLowerCase()))
    .slice()
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

function activePlan(account) {
  return (account.plans || []).find((p) => p.status === 'active') || null;
}

/** One plain sentence about the account: a fact, never a judgement. */
function describeAccountStatus(account) {
  const unpaid = sortedUnpaid(account);
  const late = unpaid.find((i) => daysOverdueFor(i, account.today) > 0);
  if (late) return `Your payment of ${formatAmount(late.amountCents)} due ${late.dueDate} is outstanding.`;
  if (unpaid[0]) return `Your next payment of ${formatAmount(unpaid[0].amountCents)} is due on ${unpaid[0].dueDate}.`;
  const plans = account.plans || [];
  if (plans.length > 0 && plans.every((p) => p.status === 'completed')) return 'Your payment plan is fully paid.';
  if ((account.applications || []).length > 0) return 'Your request has been submitted.';
  return null;
}

/**
 * @param {object} account snapshot from care-agent-account.service.js
 * @param {object} decided result of decideNextBestActions(account)
 */
function patientAccountView(account, decided) {
  const unpaid = sortedUnpaid(account);
  const outstanding = unpaid
    .filter((i) => daysOverdueFor(i, account.today) > 0)
    .map((i) => ({ paymentId: i.paymentId, amountCents: i.amountCents, dueDate: i.dueDate }));
  const upcoming = unpaid.find((i) => daysOverdueFor(i, account.today) === 0);
  const plan = activePlan(account);

  // Offers in a stable, neutral order. The backend still ranks them for the
  // agent; the patient is not told which one it would pick.
  const offers = (account.applications || [])
    .flatMap((a) => a.pendingOffers || [])
    .map((o) => ({ offerId: o.offerId, lenderName: o.lenderName, monthlyPaymentCents: o.monthlyPaymentCents, totalRepayableCents: o.totalRepayableCents, termMonths: o.termMonths }))
    .sort((a, b) => (a.totalRepayableCents - b.totalRepayableCents) || (a.termMonths - b.termMonths));

  const requests = (account.openRequests || []).map((r) => ({
    label: ACTION_REGISTRY[r.requestType] ? ACTION_REGISTRY[r.requestType].label : 'Your request',
    status: 'Received',
  }));

  const options = ((decided && decided.actions) || [])
    .filter((a) => a.actionType !== 'START_CARE_REQUEST')
    .map((a) => ({
      actionType: a.actionType,
      label: a.label,
      params: a.params || {},
      inputs: ACTION_REGISTRY[a.actionType].inputs || [],
    }));

  const hasAccount = Boolean(plan || unpaid.length || offers.length || requests.length || (account.plans || []).length || (account.applications || []).length);

  return {
    hasAccount,
    status: describeAccountStatus(account),
    outstanding,
    nextPayment: upcoming ? { amountCents: upcoming.amountCents, dueDate: upcoming.dueDate } : null,
    balanceCents: plan ? plan.outstandingBalanceCents : null,
    progress: plan ? { paymentsMade: plan.paymentsMade, numberOfPayments: plan.numberOfPayments } : null,
    offers,
    requests,
    options: hasAccount ? options : [],
  };
}

function confirmLabelFor(result) {
  if (result.authority === AUTHORITY.HUMAN_REVIEW) return 'Send request';
  if (result.actionType === 'MAKE_PAYMENT' && result.params) return `Pay ${formatAmount(result.params.totalDueCents)}`;
  if (result.actionType === 'ACCEPT_OFFER') return 'Accept offer';
  return 'Confirm';
}

/**
 * What the page needs from an executor result, and nothing else.
 * @param {object} result from care-agent-action-executor.service.js
 */
function patientActionView(result) {
  if (!result) return null;
  switch (result.status) {
    case 'awaiting_consent':
      return {
        status: result.status,
        proposalId: result.proposalId,
        title: (result.summary && result.summary.title) || null,
        lines: (result.summary && result.summary.lines) || [],
        consentText: result.consentText,
        confirmLabel: confirmLabelFor(result),
      };
    case 'refused':
      return { status: result.status, message: result.message, redirect: result.redirect || null };
    case 'executed':
      if (result.authority === AUTHORITY.AUTONOMOUS) {
        const data = result.result || {};
        if (result.actionType === 'COMPARE_OFFERS' || (data.rankedOffers && !data.instalments)) return { status: result.status, message: data.rankedOffers.length ? 'Here are your offers.' : 'There are no offers right now.' };
        if (data.explanation) return { status: result.status, message: data.explanation };
        const fact = data.instalments ? describeAccountStatus({ ...data, applications: [] }) : null;
        return { status: result.status, message: fact || 'Nothing is due right now.' };
      }
      return { status: result.status, message: result.message };
    default:
      return { status: result.status, message: result.message };
  }
}

module.exports = {
  INTERNAL_KEYS,
  describeAccountStatus,
  patientAccountView,
  patientActionView,
};
