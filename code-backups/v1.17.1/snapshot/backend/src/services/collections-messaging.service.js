'use strict';

/**
 * COLLECTIONS MESSAGING SERVICE
 *
 * Determines the correct communication strategy for a given number of days
 * overdue, and produces the full forward-looking scheduled message sequence
 * for any new overdue payment.
 *
 * Philosophy (from PaySick Shield): medical patients are NOT retail defaulters.
 * The goal is RECOVERY, not punishment. Tone escalates gradually.
 */

const { MESSAGE_TYPES } = require('./messaging-journey.service');

// ─── Escalation stage definitions ─────────────────────────────────────────────

const ESCALATION_STAGES = {
  pre_collections:   { minDays: 1,  maxDays: 7  },
  collections_early: { minDays: 8,  maxDays: 30 },
  collections_mid:   { minDays: 31, maxDays: 60 },
  collections_late:  { minDays: 61, maxDays: null }
};

// ─── Full sequence of all collections touchpoints ─────────────────────────────

const FULL_SEQUENCE = [
  { sendAtDay: 1,  type: MESSAGE_TYPES.collections_day_1,      channels: ['sms'],           stage: 'pre_collections' },
  { sendAtDay: 3,  type: MESSAGE_TYPES.collections_day_3,      channels: ['sms', 'email'],  stage: 'pre_collections' },
  { sendAtDay: 7,  type: MESSAGE_TYPES.collections_day_7,      channels: ['sms', 'email'],  stage: 'pre_collections' },
  { sendAtDay: 8,  type: MESSAGE_TYPES.collections_early_8d,   channels: ['email'],          stage: 'collections_early' },
  { sendAtDay: 14, type: MESSAGE_TYPES.collections_early_14d,  channels: ['sms', 'email'],  stage: 'collections_early' },
  { sendAtDay: 21, type: MESSAGE_TYPES.collections_early_21d,  channels: ['sms', 'email'],  stage: 'collections_early' },
  { sendAtDay: 30, type: MESSAGE_TYPES.collections_early_30d,  channels: ['email'],          stage: 'collections_early' },
  { sendAtDay: 31, type: MESSAGE_TYPES.collections_mid_31d,    channels: ['email'],          stage: 'collections_mid' },
  { sendAtDay: 45, type: MESSAGE_TYPES.collections_mid_45d,    channels: ['sms', 'email'],  stage: 'collections_mid' },
  { sendAtDay: 60, type: MESSAGE_TYPES.collections_mid_60d,    channels: ['email'],          stage: 'collections_mid' },
  { sendAtDay: 61, type: MESSAGE_TYPES.collections_late_61d,   channels: ['email'],          stage: 'collections_late' },
  { sendAtDay: 75, type: MESSAGE_TYPES.collections_late_75d,   channels: ['email'],          stage: 'collections_late' },
  { sendAtDay: 90, type: MESSAGE_TYPES.collections_late_90d,   channels: ['email'],          stage: 'collections_late' }
];

// ─── Stage resolution helper ──────────────────────────────────────────────────

function resolveStage(daysOverdue) {
  if (daysOverdue <= 0)  return null;
  if (daysOverdue <= 7)  return 'pre_collections';
  if (daysOverdue <= 30) return 'collections_early';
  if (daysOverdue <= 60) return 'collections_mid';
  return 'collections_late';
}

// ─── Message type for exact day ───────────────────────────────────────────────

function resolveMessageTypesForDay(daysOverdue) {
  if (daysOverdue <= 2)  return [MESSAGE_TYPES.collections_day_1];
  if (daysOverdue <= 6)  return [MESSAGE_TYPES.collections_day_3];
  if (daysOverdue <= 7)  return [MESSAGE_TYPES.collections_day_7];
  if (daysOverdue <= 13) return [MESSAGE_TYPES.collections_early_8d];
  if (daysOverdue <= 20) return [MESSAGE_TYPES.collections_early_14d];
  if (daysOverdue <= 29) return [MESSAGE_TYPES.collections_early_21d];
  if (daysOverdue <= 30) return [MESSAGE_TYPES.collections_early_30d];
  if (daysOverdue <= 44) return [MESSAGE_TYPES.collections_mid_31d];
  if (daysOverdue <= 59) return [MESSAGE_TYPES.collections_mid_45d];
  if (daysOverdue <= 60) return [MESSAGE_TYPES.collections_mid_60d];
  if (daysOverdue <= 74) return [MESSAGE_TYPES.collections_late_61d];
  if (daysOverdue <= 89) return [MESSAGE_TYPES.collections_late_75d];
  return [MESSAGE_TYPES.collections_late_90d];
}

// ─── CollectionsMessagingService class ───────────────────────────────────────

class CollectionsMessagingService {
  /**
   * Get the collections strategy for a given number of days overdue.
   *
   * @param {number} daysOverdue
   * @returns {{action, stage, messages, escalate, requiresHuman, description}}
   */
  getStrategyForDaysOverdue(daysOverdue) {
    if (daysOverdue <= 0) {
      return { action: 'none', stage: null, messages: [], escalate: false, requiresHuman: false, description: 'Account is current.' };
    }

    const stage = resolveStage(daysOverdue);
    const messages = resolveMessageTypesForDay(daysOverdue);

    // Escalation and human-review thresholds
    const escalate     = daysOverdue >= 30;
    const requiresHuman = daysOverdue >= 30;

    const descriptions = {
      pre_collections:   'Gentle outreach. Do not escalate formally. Recovery-first approach.',
      collections_early: 'Formal outreach. Offer restructuring from day 21. Flag for human review from day 21.',
      collections_mid:   'Formal collections process. Provider notified. Human decision required.',
      collections_late:  'Legal proceedings stage. Attorney referral. Human approval mandatory.'
    };

    return {
      action:        FULL_SEQUENCE.find(s => s.stage === stage)?.type || stage,
      stage,
      messages,
      escalate,
      requiresHuman,
      description:   descriptions[stage] || ''
    };
  }

  /**
   * Get the complete forward-looking sequence of scheduled messages
   * for a payment that is currently {daysOverdue} days past due.
   *
   * Only returns touchpoints that have not yet been triggered
   * (sendAtDay >= daysOverdue).
   *
   * @param {{ daysOverdue: number }} opts
   * @returns {Array<{sendAtDay, type, channels, stage}>}
   */
  getFullSequenceForPayment({ daysOverdue = 0 } = {}) {
    return FULL_SEQUENCE
      .filter(item => item.sendAtDay >= daysOverdue)
      .sort((a, b) => a.sendAtDay - b.sendAtDay);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  CollectionsMessagingService,
  ESCALATION_STAGES,
  FULL_SEQUENCE
};
