'use strict';

/**
 * RECOVERY ENGINE SERVICE
 *
 * The single authoritative case state machine for an overdue PaySick
 * payment plan — the "PaySick Recovery Engine" capability. It composes
 * the existing CollectionsMessagingService (message cadence, channels)
 * and adds the governance gate, self-cure eligibility, and resolution
 * outcomes that let a provider run zero collections activity of its own.
 *
 * Philosophy (unchanged from PaySick Shield / collections-messaging.service.js):
 * medical patients are NOT retail defaulters. The goal is RECOVERY, not
 * punishment.
 */

const { CollectionsMessagingService, FULL_SEQUENCE } = require('./collections-messaging.service');

const messaging = new CollectionsMessagingService();

// ─── Recovery lifecycle stages ────────────────────────────────────────────────

const RECOVERY_STAGES = {
  active:             'active',
  pre_collections:    'pre_collections',
  collections_early:  'collections_early',
  collections_mid:    'collections_mid',
  collections_late:   'collections_late',
  resolution:         'resolution'
};

// Human review is mandatory from day 30 — matches the requiresHuman
// threshold already enforced in collections-messaging.service.js.
const HUMAN_REVIEW_THRESHOLD_DAYS = 30;

// Beyond day 90 the case leaves the automated escalation ladder entirely
// and can only be closed by a human-approved resolution.
const RESOLUTION_THRESHOLD_DAYS = 91;

class RecoveryEngineService {
  /**
   * Resolve the current stage, gate, and treatment for a case.
   *
   * @param {number} daysOverdue
   * @returns {{stage, requiresHuman, escalate, selfCureEligible, gate, channels, messages, description}}
   */
  getCaseView(daysOverdue = 0) {
    const days = Number.isFinite(daysOverdue) ? daysOverdue : 0;

    if (days <= 0) {
      return {
        stage: RECOVERY_STAGES.active,
        requiresHuman: false,
        escalate: false,
        selfCureEligible: true,
        gate: null,
        channels: [],
        messages: [],
        description: 'Account is current.'
      };
    }

    const strategy = messaging.getStrategyForDaysOverdue(days);
    const inResolution = days >= RESOLUTION_THRESHOLD_DAYS;

    const stage = inResolution ? RECOVERY_STAGES.resolution : strategy.stage;
    const requiresHuman = inResolution || strategy.requiresHuman || days >= HUMAN_REVIEW_THRESHOLD_DAYS;
    const gate = requiresHuman ? 'human_review' : null;

    const channels = [...new Set(
      strategy.messages
        .map(type => FULL_SEQUENCE.find(item => item.type === type))
        .filter(Boolean)
        .flatMap(item => item.channels)
    )];

    return {
      stage,
      requiresHuman,
      escalate: strategy.escalate || inResolution,
      selfCureEligible: !inResolution,
      gate,
      channels,
      messages: strategy.messages,
      description: inResolution
        ? 'Resolution stage: cure, restructure, or human-approved write-off / external referral.'
        : strategy.description
    };
  }

  /**
   * Resolve the terminal outcome for a case, given the decisions made
   * about it so far. A case only ever leaves "open" through one of these
   * three doors, and write-off always requires an explicit human approval
   * recorded at or after the resolution threshold.
   *
   * @param {{daysOverdue:number, paidInFull?:boolean, restructureAccepted?:boolean, humanApprovedWriteOff?:boolean}} opts
   * @returns {{outcome:'cured'|'restructured'|'write_off'|'open'}}
   */
  resolveOutcome({ daysOverdue = 0, paidInFull = false, restructureAccepted = false, humanApprovedWriteOff = false } = {}) {
    if (paidInFull) {
      return { outcome: 'cured' };
    }
    if (restructureAccepted) {
      return { outcome: 'restructured' };
    }
    if (humanApprovedWriteOff && daysOverdue >= RESOLUTION_THRESHOLD_DAYS) {
      return { outcome: 'write_off' };
    }
    return { outcome: 'open' };
  }
}

module.exports = {
  RecoveryEngineService,
  RECOVERY_STAGES,
  HUMAN_REVIEW_THRESHOLD_DAYS,
  RESOLUTION_THRESHOLD_DAYS
};
