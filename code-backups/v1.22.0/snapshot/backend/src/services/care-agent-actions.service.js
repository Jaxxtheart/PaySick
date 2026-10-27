'use strict';

/**
 * CARE AGENT — GOVERNED ACTION LAYER
 *
 * The Care Agent's rulebook for the whole patient value chain after the
 * first conversation: choosing a funder, repaying, changing a plan,
 * getting through a missed payment, and closing out. Pure: no database,
 * no network, so every rule is unit-testable and auditable as code.
 *
 * Three things live here:
 *
 *   1. ACTION_REGISTRY: every action the agent can touch, each with exactly
 *      one authority tier. The tier, not the language model, decides who
 *      may perform it:
 *        autonomous       read-only; the agent acts and records that it did
 *        patient_consent  the agent prepares it; nothing happens until the
 *                         patient confirms (routes/care-agent.js
 *                         /actions/:id/confirm)
 *        human_review     changes plan terms; the agent lodges a complete
 *                         case for the PaySick team and never promises an
 *                         outcome
 *        prohibited       never in chat; the patient is sent to the secure
 *                         screen or a person instead
 *
 *   2. decideNextBestActions(): the agent's decisions. Deterministic rules
 *      over live account data, each emitting a reason code and a plain
 *      rationale that is written to the audit trail and shown to the
 *      patient. The recovery thresholds are the Recovery Engine's own
 *      (recovery-engine.service.js), so the agent and the collections team
 *      always see the same case stage.
 *
 *   3. evaluateProposal(): re-validates any proposed action against live
 *      account data. Amounts always come from PaySick's own figures (fee
 *      service, plan balances, offers on file), never from the proposal's
 *      params, so neither the model nor a crafted request can set a number.
 *
 * Money is cents-only integer arithmetic (utils/money.js), except where
 * fee.service.js's rand-based calculateLateFee is reused at its boundary.
 */

const { calculateLateFee } = require('./fee.service');
const { createPromise } = require('./promise-to-pay.service');
const { buildRestructureOffer } = require('./restructure-offer.service');
const { RecoveryEngineService } = require('./recovery-engine.service');
const { toCents, toRands } = require('../utils/money');

const recoveryEngine = new RecoveryEngineService();

const AUTHORITY = Object.freeze({
  AUTONOMOUS: 'autonomous',
  PATIENT_CONSENT: 'patient_consent',
  HUMAN_REVIEW: 'human_review',
  PROHIBITED: 'prohibited',
});

const AUTHORITY_LABELS = Object.freeze({
  [AUTHORITY.AUTONOMOUS]: 'Agent does it',
  [AUTHORITY.PATIENT_CONSENT]: 'You approve',
  [AUTHORITY.HUMAN_REVIEW]: 'Team decides',
  [AUTHORITY.PROHIBITED]: 'Not in chat',
});

/** The ten steps of the patient value chain, in order. */
const JOURNEY_STAGES = Object.freeze([
  'ask', 'understand', 'plan', 'apply', 'choose_offer', 'treatment', 'repay', 'change', 'recover', 'close',
]);

const SECURE_BANKING_FORM = 'dashboard.html#banking';

// What the page asks the patient for before it proposes an action. Never an
// amount owed: PaySick supplies those (the final bill on a plan adjustment
// is the patient reporting a document, not setting what they pay).
const DAY_INPUT = Object.freeze({ name: 'preferredDay', type: 'day', label: 'New day of the month (1 to 28)' });
const MONTHS_INPUT = Object.freeze({ name: 'newTermMonths', type: 'months', label: 'Over how many months?' });
const DATE_INPUT = Object.freeze({ name: 'promisedDate', type: 'date', label: 'I will pay by' });
const REASON_INPUT = Object.freeze({ name: 'reason', type: 'text', label: 'Reason', optional: true });

function define(entries) {
  const registry = {};
  for (const [type, def] of Object.entries(entries)) registry[type] = Object.freeze({ actionType: type, ...def });
  return Object.freeze(registry);
}

const ACTION_REGISTRY = define({
  START_CARE_REQUEST: { authority: AUTHORITY.AUTONOMOUS, stage: 'ask', label: 'Start a new care request' },
  VIEW_ACCOUNT: { authority: AUTHORITY.AUTONOMOUS, stage: 'repay', label: 'See my plan and schedule' },
  COMPARE_OFFERS: { authority: AUTHORITY.AUTONOMOUS, stage: 'choose_offer', label: 'Compare funder offers' },
  EXPLAIN_FEE: { authority: AUTHORITY.AUTONOMOUS, stage: 'repay', label: 'Explain a fee' },

  ACCEPT_OFFER: { authority: AUTHORITY.PATIENT_CONSENT, stage: 'choose_offer', label: 'Accept this offer' },
  MAKE_PAYMENT: { authority: AUTHORITY.PATIENT_CONSENT, stage: 'repay', label: 'Pay an instalment now' },
  PROMISE_TO_PAY: { authority: AUTHORITY.PATIENT_CONSENT, stage: 'recover', label: 'Promise to pay by a date', inputs: [DATE_INPUT] },

  REQUEST_PAYMENT_DATE_CHANGE: { authority: AUTHORITY.HUMAN_REVIEW, stage: 'change', label: 'Move my payment date', priority: 'STANDARD', slaHours: 24, inputs: [DAY_INPUT, REASON_INPUT] },
  REQUEST_RESTRUCTURE: { authority: AUTHORITY.HUMAN_REVIEW, stage: 'recover', label: 'Spread what I owe over longer', priority: 'STANDARD', slaHours: 24, inputs: [MONTHS_INPUT, REASON_INPUT] },
  REPORT_HARDSHIP: { authority: AUTHORITY.HUMAN_REVIEW, stage: 'recover', label: "I'm going through hardship", priority: 'HIGH', slaHours: 8, inputs: [{ ...REASON_INPUT, label: "What's happening? Share only what you're comfortable with" }] },
  DISPUTE_CHARGE: { authority: AUTHORITY.HUMAN_REVIEW, stage: 'treatment', label: 'Dispute a charge', priority: 'STANDARD', slaHours: 24, inputs: [{ ...REASON_INPUT, optional: false, label: 'What looks wrong?' }] },
  REQUEST_PLAN_ADJUSTMENT: { authority: AUTHORITY.HUMAN_REVIEW, stage: 'treatment', label: 'My final bill is different', priority: 'STANDARD', slaHours: 24, inputs: [{ name: 'finalAmountCents', type: 'rands', label: 'Final bill amount (R)', optional: true }, REASON_INPUT] },
  REQUEST_CANCELLATION: { authority: AUTHORITY.HUMAN_REVIEW, stage: 'change', label: 'Cancel my plan', priority: 'STANDARD', slaHours: 24, inputs: [REASON_INPUT] },

  UPDATE_BANKING_DETAILS: { authority: AUTHORITY.PROHIBITED, stage: 'repay', label: 'Change my banking details', redirect: SECURE_BANKING_FORM },
  CHANGE_AMOUNT_OWED: { authority: AUTHORITY.PROHIBITED, stage: 'repay', label: 'Change the amount I owe', redirect: 'contact.html' },
  WRITE_OFF: { authority: AUTHORITY.PROHIBITED, stage: 'recover', label: 'Write off what I owe', redirect: 'contact.html' },
});

/** An instalment due within this many days triggers DUE_SOON. */
const DUE_SOON_DAYS = 5;
/** Agent policy: a promise to pay more than a month out is a restructure, not a promise. */
const MAX_PROMISE_HORIZON_DAYS = 30;
const MAX_FREE_TEXT_LENGTH = 500;
const MAX_RESTRUCTURE_TERM_MONTHS = 24;
const UNPAID_STATUSES = ['scheduled', 'overdue', 'failed', 'processing'];
const DAY_MS = 24 * 60 * 60 * 1000;

function describeAuthority(authority) {
  return AUTHORITY_LABELS[authority] || 'Unknown';
}

/** Fixed "R1,200.00" formatting so consent wording never varies by locale. */
function formatAmount(cents) {
  const value = Math.round(Number(cents) || 0);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const rands = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}R${rands}.${String(abs % 100).padStart(2, '0')}`;
}

function toDay(value) {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function daysBetween(fromDay, toDayValue) {
  return Math.round((toDay(toDayValue) - toDay(fromDay)) / DAY_MS);
}

function daysOverdueFor(instalment, today) {
  const due = toDay(instalment && instalment.dueDate);
  const now = toDay(today);
  if (due === null || now === null) return 0;
  return Math.max(0, Math.round((now - due) / DAY_MS));
}

// ─── Account helpers ────────────────────────────────────────────────────────

function unpaidInstalments(account) {
  return (account.instalments || [])
    .filter((i) => UNPAID_STATUSES.includes(String(i.status).toLowerCase()))
    .slice()
    .sort((a, b) => toDay(a.dueDate) - toDay(b.dueDate));
}

function overdueInstalments(account) {
  return unpaidInstalments(account).filter((i) => daysOverdueFor(i, account.today) > 0);
}

function activePlans(account) {
  return (account.plans || []).filter((p) => p.status === 'active');
}

function pendingOffers(account) {
  return (account.applications || []).flatMap((app) =>
    (app.pendingOffers || []).map((offer) => ({ ...offer, applicationId: app.applicationId }))
  );
}

function openCollectionFor(account, paymentId) {
  return (account.collections || []).find(
    (c) => c.paymentId === paymentId && ['open', 'in_progress'].includes(c.status)
  ) || null;
}

function activePromiseFor(account, collectionId) {
  return (account.promises || []).find(
    (p) => p.collectionId === collectionId && p.status === 'pending' && toDay(p.promisedDate) >= toDay(account.today)
  ) || null;
}

function openRequestsOfType(account, requestType) {
  return (account.openRequests || []).filter(
    (r) => r.requestType === requestType && ['OPEN', 'IN_PROGRESS'].includes(r.status)
  );
}

function lateFeeCentsFor(instalment, today) {
  const fee = calculateLateFee(toRands(instalment.amountCents), daysOverdueFor(instalment, today));
  return toCents(fee.late_fee_amount);
}

// ─── Journey stage ──────────────────────────────────────────────────────────

function deriveJourneyStage(account) {
  if (overdueInstalments(account).length > 0) return 'recover';
  if (pendingOffers(account).length > 0) return 'choose_offer';
  if (activePlans(account).length > 0) return 'repay';
  const plans = account.plans || [];
  if (plans.length > 0 && plans.every((p) => p.status === 'completed')) return 'close';
  if ((account.applications || []).length > 0) return 'apply';
  return 'ask';
}

// ─── Offer ranking ──────────────────────────────────────────────────────────

/**
 * Orders offers by what the patient would repay in total, lowest first,
 * shorter term on a tie. A fixed rule anyone can check: the agent marks the
 * lowest, it does not choose for the patient.
 */
function rankOffers(offers) {
  return (offers || [])
    .map((offer) => ({ ...offer }))
    .sort((a, b) => (a.totalRepayableCents - b.totalRepayableCents) || (a.termMonths - b.termMonths))
    .map((offer, index) => ({ ...offer, rank: index + 1, recommended: index === 0 }));
}

// ─── Decisions ──────────────────────────────────────────────────────────────

/**
 * The agent's next-best-action decisions for an account. Each decision is a
 * reason code plus a rationale; each suggested action names the reason code
 * that produced it and carries its registry tier, so the UI can badge it and
 * the audit trail can explain it.
 *
 * @param {object} account snapshot from care-agent-account.service.js
 * @returns {{ journeyStage: string, decisions: object[], actions: object[], rankedOffers: object[] }}
 */
function decideNextBestActions(account) {
  const decisions = [];
  const actions = [];
  const seen = new Set();

  function decide(reasonCode, rationale) {
    decisions.push({ reasonCode, rationale });
  }

  function suggest(actionType, reasonCode, params = {}, primary = false) {
    const key = `${actionType}:${JSON.stringify(params)}`;
    if (seen.has(key)) return;
    if (ACTION_REGISTRY[actionType].authority === AUTHORITY.HUMAN_REVIEW && openRequestsOfType(account, actionType).length > 0) return;
    seen.add(key);
    const def = ACTION_REGISTRY[actionType];
    actions.push({ actionType, label: def.label, authority: def.authority, authorityLabel: describeAuthority(def.authority), reasonCode, params, primary });
  }

  const hardshipOpen = openRequestsOfType(account, 'REPORT_HARDSHIP').length > 0;
  const overdue = overdueInstalments(account);
  const offers = rankOffers(pendingOffers(account));

  if (overdue.length > 0) {
    const earliest = overdue[0];
    const days = daysOverdueFor(earliest, account.today);
    const view = recoveryEngine.getCaseView(days);
    const collection = openCollectionFor(account, earliest.paymentId);
    const promise = collection ? activePromiseFor(account, collection.collectionId) : null;
    const amount = formatAmount(earliest.amountCents);

    if (hardshipOpen) {
      decide('HARDSHIP_REVIEW', `Your hardship request is with the PaySick team, so I've stopped suggesting payments until they've reviewed it.`);
      suggest('VIEW_ACCOUNT', 'HARDSHIP_REVIEW');
    } else if (promise) {
      decide('PROMISE_ACTIVE', `You've promised to pay ${formatAmount(promise.promisedAmountCents)} by ${promise.promisedDate}, so I won't ask for another promise. You can still pay now.`);
      suggest('MAKE_PAYMENT', 'PROMISE_ACTIVE', { paymentId: earliest.paymentId }, true);
    } else if (!view.requiresHuman) {
      decide('SELF_CURE', `Your ${amount} instalment is ${days} days late. Under 30 days you can sort it out yourself, without anyone needing to review it.`);
      suggest('MAKE_PAYMENT', 'SELF_CURE', { paymentId: earliest.paymentId }, true);
      if (collection) suggest('PROMISE_TO_PAY', 'SELF_CURE', { paymentId: earliest.paymentId });
      suggest('REPORT_HARDSHIP', 'SELF_CURE');
    } else if (view.selfCureEligible) {
      decide('HUMAN_GATE', `Your ${amount} instalment is ${days} days late. From 30 days, any change to your plan is reviewed by a person. Paying or promising a date you can still do here.`);
      suggest('MAKE_PAYMENT', 'HUMAN_GATE', { paymentId: earliest.paymentId }, true);
      if (collection) suggest('PROMISE_TO_PAY', 'HUMAN_GATE', { paymentId: earliest.paymentId });
      suggest('REQUEST_RESTRUCTURE', 'HUMAN_GATE');
      suggest('REPORT_HARDSHIP', 'HUMAN_GATE');
    } else {
      decide('RESOLUTION', `Your ${amount} instalment is ${days} days late. At this stage only the PaySick team can agree a way forward, so I can't take a new promise to pay.`);
      suggest('MAKE_PAYMENT', 'RESOLUTION', { paymentId: earliest.paymentId }, true);
      suggest('REQUEST_RESTRUCTURE', 'RESOLUTION');
      suggest('REPORT_HARDSHIP', 'RESOLUTION');
    }
  }

  if (offers.length > 0) {
    const best = offers[0];
    decide('OFFERS_AWAITING', `${offers.length} funder offer${offers.length === 1 ? '' : 's'} came in. I've put them in order of what you'd repay in total; ${best.lenderName} is lowest at ${formatAmount(best.totalRepayableCents)}.`);
    suggest('COMPARE_OFFERS', 'OFFERS_AWAITING');
    suggest('ACCEPT_OFFER', 'OFFERS_AWAITING', { offerId: best.offerId });
  }

  if (overdue.length === 0 && !hardshipOpen && activePlans(account).length > 0) {
    const next = unpaidInstalments(account)[0];
    const daysUntil = next ? daysBetween(account.today, next.dueDate) : null;
    if (next && daysUntil !== null && daysUntil <= DUE_SOON_DAYS) {
      decide('DUE_SOON', `Your next instalment of ${formatAmount(next.amountCents)} is due on ${next.dueDate}. I can set up paying it early, or a person can look at moving the date.`);
      suggest('MAKE_PAYMENT', 'DUE_SOON', { paymentId: next.paymentId }, true);
      suggest('REQUEST_PAYMENT_DATE_CHANGE', 'DUE_SOON');
    } else {
      decide('ON_TRACK', next
        ? `Your plan is on track. The next instalment of ${formatAmount(next.amountCents)} is due on ${next.dueDate}.`
        : 'Your plan is on track and nothing is due right now.');
      suggest('VIEW_ACCOUNT', 'ON_TRACK');
      suggest('REQUEST_PAYMENT_DATE_CHANGE', 'ON_TRACK');
    }
  }

  if (decisions.length === 0) {
    const plans = account.plans || [];
    if (plans.length > 0 && plans.every((p) => p.status === 'completed')) {
      decide('PLAN_COMPLETE', 'Your payment plan is fully paid. If you need help with another treatment, I can start a new request.');
    } else if ((account.applications || []).length > 0) {
      decide('APPLICATION_IN_PROGRESS', "Your request has been submitted. I'll show funder offers here as soon as they come in.");
    } else {
      decide('NO_ACCOUNT', "You don't have a payment plan yet. Tell me about the treatment and I'll help you work out the options.");
    }
    suggest('START_CARE_REQUEST', decisions[0].reasonCode);
  }

  const open = (account.openRequests || []).filter((r) => ['OPEN', 'IN_PROGRESS'].includes(r.status));
  if (open.length > 0) {
    const names = open.map((r) => (ACTION_REGISTRY[r.requestType] ? ACTION_REGISTRY[r.requestType].label.toLowerCase() : 'a request'));
    decide('REQUEST_PENDING', `With the PaySick team for review: ${names.join(', ')}. I'll show their decision here once they've made it.`);
  }

  return { journeyStage: deriveJourneyStage(account), decisions, actions, rankedOffers: offers };
}

// ─── Proposal validation ────────────────────────────────────────────────────

/**
 * Flags free text that carries banking details. They belong in the secure
 * banking form, never in a chat transcript or a review-queue note (POPIA).
 */
function containsBankingDetails(text) {
  const value = String(text || '');
  if (/\b(account\s*(number|no\.?)|acc\s*no|branch\s*code|iban|swift)\b/i.test(value)) return true;
  // 9-12 consecutive digits reads as a SA bank account number. Dates and
  // rand amounts never reach 9 digits once separators are counted.
  return /(?<![\d-])\d{9,12}(?![\d-])/.test(value.replace(/\s+/g, ' '));
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_FREE_TEXT_LENGTH ? trimmed.slice(0, MAX_FREE_TEXT_LENGTH) : trimmed;
}

function refuse(actionType, reason, message, extra = {}) {
  const def = ACTION_REGISTRY[actionType];
  return { ok: false, actionType, authority: def ? def.authority : null, reason, message, ...extra };
}

function accept(actionType, params, { title, lines = [], consentText, effect }) {
  const def = ACTION_REGISTRY[actionType];
  return {
    ok: true,
    actionType,
    authority: def.authority,
    authorityLabel: describeAuthority(def.authority),
    stage: def.stage,
    params,
    summary: { title: title || def.label, lines },
    consentText: consentText || null,
    effect: effect || null,
    priority: def.priority || null,
    slaHours: def.slaHours || null,
  };
}

const HUMAN_REVIEW_EFFECT = 'A review case is opened for the PaySick team. Your plan stays as it is until someone approves.';

/**
 * Validates a proposed action against live account data and resolves its
 * authority from the registry. Never trusts amounts in params.
 *
 * @param {string} actionType
 * @param {object} params
 * @param {object} account snapshot from care-agent-account.service.js
 * @returns {object} { ok, actionType, authority, params, summary, consentText, effect, ... } or { ok:false, reason, message, redirect? }
 */
function evaluateProposal(actionType, params, account) {
  const def = ACTION_REGISTRY[actionType];
  if (!def) return { ok: false, actionType, authority: null, reason: 'UNKNOWN_ACTION', message: "That isn't available here." };

  const input = params && typeof params === 'object' ? params : {};

  if (def.authority === AUTHORITY.PROHIBITED) {
    return refuse(actionType, 'NOT_IN_CHAT', actionType === 'UPDATE_BANKING_DETAILS' ? 'Banking details can be updated on the secure banking page.' : 'Please contact PaySick about this.', { redirect: def.redirect });
  }

  for (const value of Object.values(input)) {
    if (typeof value === 'string' && containsBankingDetails(value)) {
      return refuse(actionType, 'BANKING_DETAILS_IN_CHAT', 'Please leave banking details out of this message. They can be updated on the secure banking page.', { redirect: SECURE_BANKING_FORM });
    }
  }

  if (def.authority === AUTHORITY.AUTONOMOUS) return accept(actionType, {}, {});

  const plan = activePlans(account)[0] || null;

  switch (actionType) {
    case 'ACCEPT_OFFER': {
      const offer = rankOffers(pendingOffers(account)).find((o) => o.offerId === input.offerId);
      if (!offer) return refuse(actionType, 'OFFER_NOT_AVAILABLE', 'That offer is no longer available.');
      return accept(actionType, { offerId: offer.offerId, applicationId: offer.applicationId }, {
        title: `Accept ${offer.lenderName}?`,
        lines: [
          { label: 'Monthly', value: formatAmount(offer.monthlyPaymentCents) },
          { label: 'Term', value: `${offer.termMonths} months` },
          { label: 'Total to repay', value: formatAmount(offer.totalRepayableCents) },
        ],
        consentText: `I accept the ${offer.lenderName} offer of ${formatAmount(offer.monthlyPaymentCents)} a month for ${offer.termMonths} months, and understand the other offers will be declined.`,
        effect: 'This offer is accepted, the other offers are declined, and your payment schedule is created.',
      });
    }

    case 'MAKE_PAYMENT': {
      const target = unpaidInstalments(account).find((i) => i.paymentId === input.paymentId);
      if (!target) return refuse(actionType, 'PAYMENT_NOT_DUE', 'That payment is not due.');
      const lateFeeCents = lateFeeCentsFor(target, account.today);
      const totalDueCents = target.amountCents + lateFeeCents;
      const targetPlan = (account.plans || []).find((p) => p.planId === target.planId) || plan;
      const lines = [
        { label: 'Instalment', value: targetPlan ? `${target.paymentNumber} of ${targetPlan.numberOfPayments}` : String(target.paymentNumber) },
        { label: 'Amount', value: formatAmount(target.amountCents) },
        { label: 'Late fee', value: formatAmount(lateFeeCents) },
      ];
      const balanceAfter = targetPlan ? Math.max(0, targetPlan.outstandingBalanceCents - target.amountCents) : null;
      return accept(actionType, { paymentId: target.paymentId, planId: target.planId, amountCents: target.amountCents, lateFeeCents, totalDueCents }, {
        title: `Pay instalment ${target.paymentNumber}`,
        lines,
        consentText: `I authorise PaySick to collect ${formatAmount(totalDueCents)} now.`,
        effect: balanceAfter === null
          ? 'This instalment is marked paid and a receipt is added to your notifications.'
          : `This instalment is marked paid, your balance goes to ${formatAmount(balanceAfter)}, and a receipt is added to your notifications.`,
      });
    }

    case 'PROMISE_TO_PAY': {
      const target = unpaidInstalments(account).find((i) => i.paymentId === input.paymentId);
      const collection = target ? openCollectionFor(account, target.paymentId) : null;
      if (!target || !collection) return refuse(actionType, 'NO_OPEN_CASE', 'That payment is not outstanding.');
      const days = daysOverdueFor(target, account.today);
      if (!recoveryEngine.getCaseView(days).selfCureEligible) {
        return refuse(actionType, 'PROMISE_NOT_ELIGIBLE', 'A promise to pay is not available for this payment. You can pay now or send a request instead.');
      }
      const amountCents = input.promisedAmountCents === undefined ? collection.amountOutstandingCents : Number(input.promisedAmountCents);
      if (toDay(input.promisedDate) !== null && daysBetween(account.today, input.promisedDate) > MAX_PROMISE_HORIZON_DAYS) {
        return refuse(actionType, 'INVALID_PROMISE', `Please choose a date within the next ${MAX_PROMISE_HORIZON_DAYS} days.`);
      }
      let promise;
      try {
        promise = createPromise({
          caseId: collection.collectionId,
          promisedAmountCents: amountCents,
          promisedDate: input.promisedDate,
          outstandingBalanceCents: collection.amountOutstandingCents,
          today: new Date(`${String(account.today).slice(0, 10)}T00:00:00Z`),
        });
      } catch (err) {
        // createPromise's own messages are written for developers; the patient
        // gets the plain version.
        return refuse(actionType, 'INVALID_PROMISE', 'Please choose a date from today onward, for no more than the amount outstanding.');
      }
      return accept(actionType, { paymentId: target.paymentId, collectionId: collection.collectionId, promisedAmountCents: promise.promisedAmountCents, promisedDate: promise.promisedDate }, {
        title: 'Promise to pay',
        lines: [
          { label: 'Amount', value: formatAmount(promise.promisedAmountCents) },
          { label: 'By', value: promise.promisedDate },
        ],
        consentText: `I promise to pay ${formatAmount(promise.promisedAmountCents)} by ${promise.promisedDate}.`,
        effect: 'Your promise is recorded on your account and reminders are held until that date.',
      });
    }

    case 'REQUEST_PAYMENT_DATE_CHANGE': {
      if (!plan) return refuse(actionType, 'NO_ACTIVE_PLAN', "You don't have an active plan to change.");
      const day = Number(input.preferredDay);
      if (!Number.isInteger(day) || day < 1 || day > 28) return refuse(actionType, 'INVALID_PARAMS', 'Please choose a day between the 1st and the 28th.');
      const reason = cleanText(input.reason);
      return accept(actionType, { planId: plan.planId, preferredDay: day, reason }, {
        title: 'Move my payment date',
        lines: [{ label: 'New date', value: `Day ${day} of each month` }, ...(reason ? [{ label: 'Reason', value: reason }] : [])],
        consentText: 'Send this request.',
        effect: HUMAN_REVIEW_EFFECT,
      });
    }

    case 'REQUEST_RESTRUCTURE': {
      if (!plan) return refuse(actionType, 'NO_ACTIVE_PLAN', "You don't have an active plan to change.");
      const term = Number(input.newTermMonths);
      if (!Number.isInteger(term) || term < 1 || term > MAX_RESTRUCTURE_TERM_MONTHS) {
        return refuse(actionType, 'INVALID_PARAMS', `Please choose between 1 and ${MAX_RESTRUCTURE_TERM_MONTHS} months.`);
      }
      const lateFees = overdueInstalments(account).reduce((sum, i) => sum + lateFeeCentsFor(i, account.today), 0);
      const preview = buildRestructureOffer({
        originalOutstandingCents: plan.outstandingBalanceCents,
        remainingBalanceCents: plan.outstandingBalanceCents + lateFees,
        newTermMonths: term,
      });
      if (!preview.withinCap) return refuse(actionType, 'RESTRUCTURE_OVER_CAP', 'That term is not available. Please choose a shorter one.');
      const reason = cleanText(input.reason);
      return accept(actionType, { planId: plan.planId, newTermMonths: term, reason, preview }, {
        title: 'Spread what I owe',
        lines: [
          { label: 'New term', value: `${term} months` },
          { label: 'About', value: `${formatAmount(preview.newMonthlyAmountCents)} a month` },
        ],
        consentText: 'Send this request.',
        effect: HUMAN_REVIEW_EFFECT,
      });
    }

    case 'REPORT_HARDSHIP':
    case 'DISPUTE_CHARGE':
    case 'REQUEST_CANCELLATION':
    case 'REQUEST_PLAN_ADJUSTMENT': {
      const anyPlan = plan || (account.plans || [])[0] || null;
      if (!anyPlan) return refuse(actionType, 'NO_ACTIVE_PLAN', "You don't have a plan for me to raise this on.");
      const reason = cleanText(input.reason);
      const next = { planId: anyPlan.planId, reason };
      const lines = reason ? [{ label: 'Details', value: reason }] : [];
      if (actionType === 'REQUEST_PLAN_ADJUSTMENT' && input.finalAmountCents !== undefined) {
        const cents = Number(input.finalAmountCents);
        if (!Number.isInteger(cents) || cents < 0) return refuse(actionType, 'INVALID_PARAMS', 'The final amount needs to be a valid amount.');
        next.finalAmountCents = cents;
        lines.unshift({ label: 'Final bill', value: formatAmount(cents) });
      }
      return accept(actionType, next, {
        title: def.label,
        lines,
        consentText: 'Send this request.',
        effect: actionType === 'REPORT_HARDSHIP'
          ? 'A review case is opened for the PaySick team and payment reminders are paused until they have reviewed it.'
          : HUMAN_REVIEW_EFFECT,
      });
    }

    default:
      return refuse(actionType, 'UNKNOWN_ACTION', "That isn't available here.");
  }
}

// ─── Intent detection (deterministic fallback) ──────────────────────────────

const INTENT_PATTERNS = [
  ['UPDATE_BANKING_DETAILS', /\b(bank(ing)?\s+(details|account)|account\s+number|branch\s+code|change\s+(my\s+)?bank)\b/i],
  ['REPORT_HARDSHIP', /\b(lost my job|retrench\w*|hardship|can'?t afford|cannot afford|struggling|no income)\b/i],
  ['DISPUTE_CHARGE', /\b(dispute|wrong (amount|charge)|overcharged|charged twice|double charged)\b/i],
  ['REQUEST_CANCELLATION', /\bcancel\b/i],
  ['REQUEST_PLAN_ADJUSTMENT', /\b(final (bill|invoice)|bill (is|was) (different|less|more)|eob)\b/i],
  ['REQUEST_PAYMENT_DATE_CHANGE', /\b((change|move|shift)\b.*\b(date|debit|day)|debit order date|different date)\b/i],
  ['REQUEST_RESTRUCTURE', /\b(spread|restructure|smaller (payments|instalments)|longer|extend)\b/i],
  ['PROMISE_TO_PAY', /\b(promise|when i get paid|on payday|pay (it )?(on|by) (friday|monday|the \d))\b/i],
  ['COMPARE_OFFERS', /\b(offers?|funders?|lenders?)\b/i],
  ['VIEW_ACCOUNT', /\b(next payment|balance|how much (do )?i (still )?owe|schedule|when is my)\b/i],
  ['MAKE_PAYMENT', /\b(pay|make a payment|settle)\b/i],
];

/**
 * Maps a patient message to an account action when no language model is
 * configured. Order matters: banking and hardship are checked first, so a
 * message that mentions both money and hardship is treated with care.
 */
function detectAccountIntent(message) {
  const text = String(message || '');
  for (const [actionType, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) return actionType;
  }
  return null;
}

/** Default params for an action, from the account, so a tap needs no typing. */
function suggestParamsFor(actionType, account) {
  switch (actionType) {
    case 'MAKE_PAYMENT': {
      const target = overdueInstalments(account)[0] || unpaidInstalments(account)[0];
      return target ? { paymentId: target.paymentId } : {};
    }
    case 'PROMISE_TO_PAY': {
      const target = overdueInstalments(account).find((i) => openCollectionFor(account, i.paymentId));
      return target ? { paymentId: target.paymentId } : {};
    }
    case 'ACCEPT_OFFER': {
      const best = rankOffers(pendingOffers(account))[0];
      return best ? { offerId: best.offerId } : {};
    }
    default:
      return {};
  }
}

module.exports = {
  AUTHORITY,
  ACTION_REGISTRY,
  JOURNEY_STAGES,
  DUE_SOON_DAYS,
  MAX_PROMISE_HORIZON_DAYS,
  describeAuthority,
  formatAmount,
  daysOverdueFor,
  deriveJourneyStage,
  rankOffers,
  decideNextBestActions,
  evaluateProposal,
  detectAccountIntent,
  suggestParamsFor,
  containsBankingDetails,
};
