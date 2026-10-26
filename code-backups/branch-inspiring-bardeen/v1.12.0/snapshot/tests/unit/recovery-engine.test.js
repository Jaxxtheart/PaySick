'use strict';

/**
 * Unit Tests — Recovery Engine (Collections Capability)
 *
 * The Recovery Engine is the single authoritative case state machine for
 * an overdue payment plan. It composes the existing
 * CollectionsMessagingService (message cadence) and adds the governance
 * gate, self-cure eligibility, and resolution-outcome decisions described
 * in the PaySick Recovery Engine capability design.
 *
 * Written BEFORE implementation (test-first workflow, CLAUDE.md).
 * Run: node --test tests/unit/recovery-engine.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  RecoveryEngineService,
  RECOVERY_STAGES,
  HUMAN_REVIEW_THRESHOLD_DAYS
} = require('../../backend/src/services/recovery-engine.service');

const engine = new RecoveryEngineService();

describe('RecoveryEngineService.getCaseView — stage resolution', () => {
  test('day 0 or earlier is active, no gate, self-cure eligible', () => {
    const view = engine.getCaseView(0);
    assert.equal(view.stage, RECOVERY_STAGES.active);
    assert.equal(view.requiresHuman, false);
    assert.equal(view.gate, null);
    assert.equal(view.selfCureEligible, true);
  });

  test('day 1-7 is pre_collections, fully automated', () => {
    const view = engine.getCaseView(3);
    assert.equal(view.stage, RECOVERY_STAGES.pre_collections);
    assert.equal(view.requiresHuman, false);
    assert.equal(view.gate, null);
    assert.equal(view.selfCureEligible, true);
  });

  test('day 8-29 is collections_early, still automated', () => {
    const view = engine.getCaseView(15);
    assert.equal(view.stage, RECOVERY_STAGES.collections_early);
    assert.equal(view.requiresHuman, false);
    assert.equal(view.gate, null);
  });

  test('day 30 crosses the human review threshold', () => {
    const view = engine.getCaseView(HUMAN_REVIEW_THRESHOLD_DAYS);
    assert.equal(view.requiresHuman, true);
    assert.equal(view.gate, 'human_review');
  });

  test('day 31-60 is collections_mid, human review required', () => {
    const view = engine.getCaseView(45);
    assert.equal(view.stage, RECOVERY_STAGES.collections_mid);
    assert.equal(view.requiresHuman, true);
    assert.equal(view.gate, 'human_review');
    assert.equal(view.selfCureEligible, true);
  });

  test('day 61-90 is collections_late, human review required', () => {
    const view = engine.getCaseView(75);
    assert.equal(view.stage, RECOVERY_STAGES.collections_late);
    assert.equal(view.requiresHuman, true);
  });

  test('day 91+ moves to resolution, not self-cure eligible, escalated', () => {
    const view = engine.getCaseView(95);
    assert.equal(view.stage, RECOVERY_STAGES.resolution);
    assert.equal(view.requiresHuman, true);
    assert.equal(view.gate, 'human_review');
    assert.equal(view.selfCureEligible, false);
    assert.equal(view.escalate, true);
  });

  test('channels are derived from the underlying messaging sequence', () => {
    const view = engine.getCaseView(3);
    assert.ok(Array.isArray(view.channels));
    assert.ok(view.channels.includes('sms'));
  });

  test('rejects a negative daysOverdue silently falling back to active-equivalent, not throwing', () => {
    assert.doesNotThrow(() => engine.getCaseView(-5));
  });
});

describe('RecoveryEngineService.resolveOutcome — terminal case resolution', () => {
  test('paidInFull always resolves to cured, regardless of stage', () => {
    const outcome = engine.resolveOutcome({ daysOverdue: 45, paidInFull: true });
    assert.equal(outcome.outcome, 'cured');
  });

  test('an accepted restructure resolves to restructured', () => {
    const outcome = engine.resolveOutcome({ daysOverdue: 45, restructureAccepted: true });
    assert.equal(outcome.outcome, 'restructured');
  });

  test('write-off requires both resolution-stage days and explicit human approval', () => {
    const notApproved = engine.resolveOutcome({ daysOverdue: 95 });
    assert.equal(notApproved.outcome, 'open');

    const approvedTooEarly = engine.resolveOutcome({ daysOverdue: 45, humanApprovedWriteOff: true });
    assert.equal(approvedTooEarly.outcome, 'open');

    const approved = engine.resolveOutcome({ daysOverdue: 95, humanApprovedWriteOff: true });
    assert.equal(approved.outcome, 'write_off');
  });

  test('an open case with no resolution inputs stays open', () => {
    const outcome = engine.resolveOutcome({ daysOverdue: 15 });
    assert.equal(outcome.outcome, 'open');
  });
});
