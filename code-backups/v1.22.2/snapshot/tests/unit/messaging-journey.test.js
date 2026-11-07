/**
 * Unit Tests — Customer Messaging Journey
 *
 * Tests cover all permutations of customer communications across the full
 * lifecycle: registration, onboarding, applications, active payment plans,
 * outcome surveys, and the complete collections escalation ladder.
 *
 * Run: node --test tests/unit/messaging-journey.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  MessagingJourneyService,
  JOURNEY_STAGES,
  COLLECTIONS_LADDER,
  MESSAGE_TYPES,
  CHANNELS
} = require('../../backend/src/services/messaging-journey.service');

const {
  CollectionsMessagingService,
  ESCALATION_STAGES
} = require('../../backend/src/services/collections-messaging.service');

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUIRED_CHANNELS = ['email', 'sms', 'in_app'];
const REQUIRED_STAGES = [
  'registration',
  'onboarding',
  'application',
  'active_plan',
  'outcome_survey',
  'pre_collections',
  'collections_early',
  'collections_mid',
  'collections_late',
  'resolution'
];

const REQUIRED_MESSAGE_TYPES = [
  // Registration
  'email_verification_reminder',
  'welcome',
  // Onboarding
  'onboarding_incomplete_24h',
  'onboarding_incomplete_72h',
  'onboarding_banking_missing',
  // Application
  'application_received',
  'application_approved',
  'application_declined',
  'application_more_info',
  'application_expired',
  // Active plan
  'plan_activated',
  'payment_upcoming_7d',
  'payment_upcoming_3d',
  'payment_upcoming_1d',
  'payment_due_today',
  'payment_success',
  'payment_failed',
  'payment_failed_retry',
  // Outcome surveys
  'survey_day_3',
  'survey_day_30',
  'survey_day_90',
  // Pre-collections
  'collections_day_1',
  'collections_day_3',
  'collections_day_7',
  // Early collections
  'collections_early_8d',
  'collections_early_14d',
  'collections_early_21d',
  'collections_early_30d',
  // Mid collections
  'collections_mid_31d',
  'collections_mid_45d',
  'collections_mid_60d',
  // Late / legal
  'collections_late_61d',
  'collections_late_75d',
  'collections_late_90d',
  // Resolution
  'restructure_offer',
  'restructure_accepted',
  'payment_arrangement_set',
  'account_settled',
  'account_written_off',
  // Account management
  'password_changed',
  'banking_details_updated',
  'profile_updated',
  'security_alert_new_device',
  'security_alert_failed_logins'
];

const SAMPLE_DATA = {
  firstName: 'Lerato',
  amount: 'R1,200.00',
  dueDate: '15 April 2026',
  planId: 'plan-abc-123',
  daysOverdue: 14,
  outstandingBalance: 'R2,400.00',
  restructureOption: 'term_extension',
  newMonthlyPayment: 'R450.00',
  providerName: 'Netcare Blaauwberg',
  applicationRef: 'PS-2026-00123'
};

// ─── SERVICE EXPORTS ──────────────────────────────────────────────────────────

describe('MessagingJourneyService — module exports', () => {

  test('exports MessagingJourneyService class', () => {
    assert.strictEqual(typeof MessagingJourneyService, 'function');
  });

  test('exports JOURNEY_STAGES map', () => {
    assert.strictEqual(typeof JOURNEY_STAGES, 'object');
    assert.ok(JOURNEY_STAGES !== null);
  });

  test('exports COLLECTIONS_LADDER array', () => {
    assert.ok(Array.isArray(COLLECTIONS_LADDER));
    assert.ok(COLLECTIONS_LADDER.length > 0);
  });

  test('exports MESSAGE_TYPES constant', () => {
    assert.strictEqual(typeof MESSAGE_TYPES, 'object');
  });

  test('exports CHANNELS constant', () => {
    assert.strictEqual(typeof CHANNELS, 'object');
  });

});

// ─── JOURNEY STAGES COMPLETENESS ─────────────────────────────────────────────

describe('JOURNEY_STAGES — completeness', () => {

  REQUIRED_STAGES.forEach(stage => {
    test(`defines stage: ${stage}`, () => {
      assert.ok(
        Object.prototype.hasOwnProperty.call(JOURNEY_STAGES, stage),
        `JOURNEY_STAGES must include "${stage}"`
      );
    });
  });

  test('every stage has a label and ordered array of message types', () => {
    for (const [key, stage] of Object.entries(JOURNEY_STAGES)) {
      assert.ok(stage.label, `Stage "${key}" must have a label`);
      assert.ok(Array.isArray(stage.messages), `Stage "${key}" messages must be an array`);
      assert.ok(stage.messages.length > 0, `Stage "${key}" must have at least one message type`);
    }
  });

});

// ─── MESSAGE_TYPES COMPLETENESS ───────────────────────────────────────────────

describe('MESSAGE_TYPES — all required types present', () => {

  REQUIRED_MESSAGE_TYPES.forEach(type => {
    test(`defines message type: ${type}`, () => {
      assert.ok(
        Object.prototype.hasOwnProperty.call(MESSAGE_TYPES, type),
        `MESSAGE_TYPES must include "${type}"`
      );
    });
  });

});

// ─── getMessageTemplate — email channel ───────────────────────────────────────

describe('MessagingJourneyService.getMessageTemplate — email', () => {

  const svc = new MessagingJourneyService();

  REQUIRED_MESSAGE_TYPES.forEach(type => {
    test(`email template for ${type} has subject and body`, () => {
      const tpl = svc.getMessageTemplate(type, 'email', SAMPLE_DATA);
      assert.ok(tpl, `Template for "${type}" (email) must not be null`);
      assert.ok(tpl.subject && tpl.subject.length > 0, `"${type}" email must have a non-empty subject`);
      assert.ok(tpl.body && tpl.body.length > 0, `"${type}" email must have a non-empty body`);
    });
  });

  test('email body interpolates firstName', () => {
    const tpl = svc.getMessageTemplate('welcome', 'email', SAMPLE_DATA);
    assert.ok(
      tpl.body.includes(SAMPLE_DATA.firstName),
      'welcome email body must include the customer firstName'
    );
  });

  test('payment_success email includes amount', () => {
    const tpl = svc.getMessageTemplate('payment_success', 'email', SAMPLE_DATA);
    assert.ok(
      tpl.body.includes(SAMPLE_DATA.amount),
      'payment_success email must include the payment amount'
    );
  });

  test('payment_upcoming_7d email includes dueDate', () => {
    const tpl = svc.getMessageTemplate('payment_upcoming_7d', 'email', SAMPLE_DATA);
    assert.ok(
      tpl.body.includes(SAMPLE_DATA.dueDate),
      'payment_upcoming_7d email must include the due date'
    );
  });

  test('collections_day_1 email is friendly (does not use "legal" language)', () => {
    const tpl = svc.getMessageTemplate('collections_day_1', 'email', SAMPLE_DATA);
    const lower = tpl.body.toLowerCase();
    assert.ok(
      !lower.includes('legal action') && !lower.includes('court'),
      'Day-1 collections email must not use threatening legal language'
    );
  });

  test('collections_late_90d email uses firm legal language', () => {
    const tpl = svc.getMessageTemplate('collections_late_90d', 'email', SAMPLE_DATA);
    const lower = tpl.body.toLowerCase();
    assert.ok(
      lower.includes('legal') || lower.includes('attorney') || lower.includes('legal notice'),
      'Day-90 collections email must include legal-action language'
    );
  });

  test('restructure_offer email includes outstandingBalance', () => {
    const tpl = svc.getMessageTemplate('restructure_offer', 'email', SAMPLE_DATA);
    assert.ok(
      tpl.body.includes(SAMPLE_DATA.outstandingBalance),
      'restructure_offer email must include outstanding balance'
    );
  });

  test('returns null for unknown message type', () => {
    const tpl = svc.getMessageTemplate('completely_unknown_type_xyz', 'email', SAMPLE_DATA);
    assert.strictEqual(tpl, null);
  });

});

// ─── getMessageTemplate — SMS channel ────────────────────────────────────────

describe('MessagingJourneyService.getMessageTemplate — sms', () => {

  const svc = new MessagingJourneyService();

  const SMS_TYPES = [
    'collections_day_1',
    'collections_day_3',
    'collections_day_7',
    'collections_early_8d',
    'collections_early_14d',
    'collections_early_21d',
    'payment_upcoming_1d',
    'payment_due_today',
    'payment_success',
    'payment_failed',
    'survey_day_3'
  ];

  SMS_TYPES.forEach(type => {
    test(`sms template for ${type} has a message under 320 chars`, () => {
      const tpl = svc.getMessageTemplate(type, 'sms', SAMPLE_DATA);
      assert.ok(tpl, `SMS template for "${type}" must not be null`);
      assert.ok(tpl.message && tpl.message.length > 0, `"${type}" SMS must have a non-empty message`);
      assert.ok(
        tpl.message.length <= 320,
        `"${type}" SMS must be ≤ 320 characters (got ${tpl.message.length})`
      );
    });
  });

  test('collections_day_1 sms does not include legal threats', () => {
    const tpl = svc.getMessageTemplate('collections_day_1', 'sms', SAMPLE_DATA);
    const lower = tpl.message.toLowerCase();
    assert.ok(
      !lower.includes('legal') && !lower.includes('court'),
      'Day-1 collections SMS must not use threatening legal language'
    );
  });

});

// ─── getMessageTemplate — in_app channel ──────────────────────────────────────

describe('MessagingJourneyService.getMessageTemplate — in_app', () => {

  const svc = new MessagingJourneyService();

  const IN_APP_TYPES = [
    'welcome',
    'plan_activated',
    'payment_success',
    'payment_failed',
    'application_approved',
    'application_declined',
    'collections_day_1'
  ];

  IN_APP_TYPES.forEach(type => {
    test(`in_app template for ${type} has title and message`, () => {
      const tpl = svc.getMessageTemplate(type, 'in_app', SAMPLE_DATA);
      assert.ok(tpl, `in_app template for "${type}" must not be null`);
      assert.ok(tpl.title && tpl.title.length > 0, `"${type}" in_app must have a title`);
      assert.ok(tpl.message && tpl.message.length > 0, `"${type}" in_app must have a message`);
    });
  });

});

// ─── getTriggerRules ──────────────────────────────────────────────────────────

describe('MessagingJourneyService.getTriggerRules', () => {

  const svc = new MessagingJourneyService();

  test('returns an array of trigger rules', () => {
    const rules = svc.getTriggerRules();
    assert.ok(Array.isArray(rules));
    assert.ok(rules.length > 0);
  });

  test('every rule has type, event, channels, and description', () => {
    const rules = svc.getTriggerRules();
    for (const rule of rules) {
      assert.ok(rule.type, `Rule must have a type: ${JSON.stringify(rule)}`);
      assert.ok(rule.event, `Rule "${rule.type}" must have an event`);
      assert.ok(Array.isArray(rule.channels), `Rule "${rule.type}" channels must be an array`);
      assert.ok(rule.channels.length > 0, `Rule "${rule.type}" must specify at least one channel`);
      assert.ok(rule.description, `Rule "${rule.type}" must have a description`);
    }
  });

  test('all rule types are defined in MESSAGE_TYPES', () => {
    const rules = svc.getTriggerRules();
    for (const rule of rules) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(MESSAGE_TYPES, rule.type),
        `Rule type "${rule.type}" must be defined in MESSAGE_TYPES`
      );
    }
  });

  test('all rule channels are valid', () => {
    const validChannels = new Set(Object.values(CHANNELS));
    const rules = svc.getTriggerRules();
    for (const rule of rules) {
      for (const ch of rule.channels) {
        assert.ok(validChannels.has(ch), `Invalid channel "${ch}" in rule "${rule.type}"`);
      }
    }
  });

});

// ─── COLLECTIONS_LADDER ───────────────────────────────────────────────────────

describe('COLLECTIONS_LADDER — structure and completeness', () => {

  test('ladder has at least 13 rungs (full escalation to 90 days)', () => {
    assert.ok(COLLECTIONS_LADDER.length >= 13);
  });

  test('every rung has: days, stage, channels, tone, action, requiresHuman flag', () => {
    for (const rung of COLLECTIONS_LADDER) {
      assert.ok(typeof rung.days === 'number', `Rung must have numeric days: ${JSON.stringify(rung)}`);
      assert.ok(rung.stage, `Rung at day ${rung.days} must have a stage`);
      assert.ok(Array.isArray(rung.channels), `Rung at day ${rung.days} channels must be an array`);
      assert.ok(rung.tone, `Rung at day ${rung.days} must have a tone`);
      assert.ok(rung.action, `Rung at day ${rung.days} must have an action`);
      assert.strictEqual(typeof rung.requiresHuman, 'boolean', `Rung at day ${rung.days} requiresHuman must be boolean`);
    }
  });

  test('ladder is sorted ascending by days', () => {
    for (let i = 1; i < COLLECTIONS_LADDER.length; i++) {
      assert.ok(
        COLLECTIONS_LADDER[i].days >= COLLECTIONS_LADDER[i - 1].days,
        `Ladder must be sorted by days ascending (rung ${i}: ${COLLECTIONS_LADDER[i].days} < ${COLLECTIONS_LADDER[i - 1].days})`
      );
    }
  });

  test('day 1 rung has friendly/reminder tone and does not require human', () => {
    const day1 = COLLECTIONS_LADDER.find(r => r.days === 1);
    assert.ok(day1, 'Ladder must include a day-1 rung');
    assert.match(day1.tone, /friendly|reminder/i);
    assert.strictEqual(day1.requiresHuman, false);
  });

  test('day 90 rung requires human and has legal tone', () => {
    const day90 = COLLECTIONS_LADDER.find(r => r.days === 90);
    assert.ok(day90, 'Ladder must include a day-90 rung');
    assert.match(day90.tone, /legal/i);
    assert.strictEqual(day90.requiresHuman, true);
  });

  test('no legal tone before day 60', () => {
    const earlyLegal = COLLECTIONS_LADDER.filter(r => r.days < 60 && /legal/i.test(r.tone));
    assert.strictEqual(
      earlyLegal.length,
      0,
      `Legal tone must not appear before day 60 (found: ${earlyLegal.map(r => r.days).join(', ')})`
    );
  });

  test('requiresHuman is true for all rungs from day 30 onwards', () => {
    const lateRungs = COLLECTIONS_LADDER.filter(r => r.days >= 30);
    for (const rung of lateRungs) {
      assert.strictEqual(
        rung.requiresHuman,
        true,
        `Day-${rung.days} rung must require human review`
      );
    }
  });

});

// ─── CollectionsMessagingService ──────────────────────────────────────────────

describe('CollectionsMessagingService — exports', () => {

  test('exports CollectionsMessagingService class', () => {
    assert.strictEqual(typeof CollectionsMessagingService, 'function');
  });

  test('exports ESCALATION_STAGES', () => {
    assert.strictEqual(typeof ESCALATION_STAGES, 'object');
    assert.ok(ESCALATION_STAGES !== null);
  });

});

describe('CollectionsMessagingService.getStrategyForDaysOverdue', () => {

  const svc = new CollectionsMessagingService();

  test('returns strategy for 0 days overdue (no action)', () => {
    const strategy = svc.getStrategyForDaysOverdue(0);
    assert.strictEqual(strategy.action, 'none');
  });

  test('returns pre_collections strategy for day 1', () => {
    const strategy = svc.getStrategyForDaysOverdue(1);
    assert.strictEqual(strategy.stage, 'pre_collections');
    assert.ok(Array.isArray(strategy.messages));
    assert.ok(strategy.messages.length > 0);
  });

  test('returns pre_collections strategy for day 3', () => {
    const strategy = svc.getStrategyForDaysOverdue(3);
    assert.strictEqual(strategy.stage, 'pre_collections');
  });

  test('returns pre_collections strategy for day 7', () => {
    const strategy = svc.getStrategyForDaysOverdue(7);
    assert.strictEqual(strategy.stage, 'pre_collections');
  });

  test('returns early collections strategy for day 8', () => {
    const strategy = svc.getStrategyForDaysOverdue(8);
    assert.strictEqual(strategy.stage, 'collections_early');
  });

  test('returns early collections strategy for day 14', () => {
    const strategy = svc.getStrategyForDaysOverdue(14);
    assert.strictEqual(strategy.stage, 'collections_early');
  });

  test('returns early collections strategy for day 21', () => {
    const strategy = svc.getStrategyForDaysOverdue(21);
    assert.strictEqual(strategy.stage, 'collections_early');
  });

  test('returns early collections strategy for day 30', () => {
    const strategy = svc.getStrategyForDaysOverdue(30);
    assert.strictEqual(strategy.stage, 'collections_early');
  });

  test('returns mid collections strategy for day 31', () => {
    const strategy = svc.getStrategyForDaysOverdue(31);
    assert.strictEqual(strategy.stage, 'collections_mid');
  });

  test('returns mid collections strategy for day 45', () => {
    const strategy = svc.getStrategyForDaysOverdue(45);
    assert.strictEqual(strategy.stage, 'collections_mid');
  });

  test('returns mid collections strategy for day 60', () => {
    const strategy = svc.getStrategyForDaysOverdue(60);
    assert.strictEqual(strategy.stage, 'collections_mid');
  });

  test('returns late/legal strategy for day 61', () => {
    const strategy = svc.getStrategyForDaysOverdue(61);
    assert.strictEqual(strategy.stage, 'collections_late');
  });

  test('returns late/legal strategy for day 75', () => {
    const strategy = svc.getStrategyForDaysOverdue(75);
    assert.strictEqual(strategy.stage, 'collections_late');
  });

  test('returns late/legal strategy for day 90', () => {
    const strategy = svc.getStrategyForDaysOverdue(90);
    assert.strictEqual(strategy.stage, 'collections_late');
  });

  test('returns late/legal strategy for day 120 (beyond 90)', () => {
    const strategy = svc.getStrategyForDaysOverdue(120);
    assert.strictEqual(strategy.stage, 'collections_late');
  });

  test('strategy includes escalate flag (true from day 30+)', () => {
    const day30 = svc.getStrategyForDaysOverdue(30);
    assert.strictEqual(day30.escalate, true);
  });

  test('strategy does not escalate before day 8', () => {
    const day7 = svc.getStrategyForDaysOverdue(7);
    assert.strictEqual(day7.escalate, false);
  });

  test('strategy includes list of message types to send', () => {
    const strategy = svc.getStrategyForDaysOverdue(14);
    assert.ok(Array.isArray(strategy.messages));
    assert.ok(strategy.messages.length > 0);
    for (const msgType of strategy.messages) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(MESSAGE_TYPES, msgType),
        `Collections strategy message type "${msgType}" must be in MESSAGE_TYPES`
      );
    }
  });

  test('strategy includes requiresHuman flag', () => {
    const strategy = svc.getStrategyForDaysOverdue(45);
    assert.strictEqual(typeof strategy.requiresHuman, 'boolean');
    assert.strictEqual(strategy.requiresHuman, true);
  });

});

describe('CollectionsMessagingService.getFullSequenceForPayment', () => {

  const svc = new CollectionsMessagingService();

  test('returns full sequence of scheduled messages for a new overdue payment', () => {
    const sequence = svc.getFullSequenceForPayment({ daysOverdue: 1 });
    assert.ok(Array.isArray(sequence));
    assert.ok(sequence.length >= 10, 'Sequence must include at least 10 scheduled touchpoints');
  });

  test('each item in sequence has sendAtDay, type, channels, stage', () => {
    const sequence = svc.getFullSequenceForPayment({ daysOverdue: 1 });
    for (const item of sequence) {
      assert.ok(typeof item.sendAtDay === 'number', `Item must have sendAtDay: ${JSON.stringify(item)}`);
      assert.ok(item.type, `Item must have type: ${JSON.stringify(item)}`);
      assert.ok(Array.isArray(item.channels), `Item must have channels array: ${JSON.stringify(item)}`);
      assert.ok(item.stage, `Item must have stage: ${JSON.stringify(item)}`);
    }
  });

  test('sequence starts from day >= daysOverdue (no past messages)', () => {
    const daysOverdue = 10;
    const sequence = svc.getFullSequenceForPayment({ daysOverdue });
    for (const item of sequence) {
      assert.ok(
        item.sendAtDay >= daysOverdue,
        `Sequence item at day ${item.sendAtDay} must not be in the past (daysOverdue=${daysOverdue})`
      );
    }
  });

  test('sequence is sorted ascending by sendAtDay', () => {
    const sequence = svc.getFullSequenceForPayment({ daysOverdue: 1 });
    for (let i = 1; i < sequence.length; i++) {
      assert.ok(
        sequence[i].sendAtDay >= sequence[i - 1].sendAtDay,
        `Sequence must be sorted by sendAtDay ascending`
      );
    }
  });

});

// ─── Channel coverage per lifecycle stage ─────────────────────────────────────

describe('Channel coverage — critical stages must use multi-channel', () => {

  const svc = new MessagingJourneyService();

  test('payment_failed is sent via both email and sms', () => {
    const rules = svc.getTriggerRules();
    const rule = rules.find(r => r.type === 'payment_failed');
    assert.ok(rule, 'payment_failed must have a trigger rule');
    assert.ok(rule.channels.includes('email'), 'payment_failed must include email channel');
    assert.ok(rule.channels.includes('sms'), 'payment_failed must include sms channel');
  });

  test('collections_day_1 is sent via sms (immediate reach)', () => {
    const rules = svc.getTriggerRules();
    const rule = rules.find(r => r.type === 'collections_day_1');
    assert.ok(rule, 'collections_day_1 must have a trigger rule');
    assert.ok(rule.channels.includes('sms'), 'day-1 collections must go via SMS');
  });

  test('account_settled is sent via both email and in_app', () => {
    const rules = svc.getTriggerRules();
    const rule = rules.find(r => r.type === 'account_settled');
    assert.ok(rule, 'account_settled must have a trigger rule');
    assert.ok(rule.channels.includes('email'), 'account_settled must include email channel');
    assert.ok(rule.channels.includes('in_app'), 'account_settled must include in_app channel');
  });

});

// ─── South Africa compliance ──────────────────────────────────────────────────

describe('Compliance — South African regulatory requirements', () => {

  const svc = new MessagingJourneyService();

  test('all email templates include opt-out / contact information footer marker', () => {
    const typesToCheck = ['payment_success', 'plan_activated', 'collections_day_1', 'restructure_offer'];
    for (const type of typesToCheck) {
      const tpl = svc.getMessageTemplate(type, 'email', SAMPLE_DATA);
      assert.ok(
        tpl.body.toLowerCase().includes('paysick') || tpl.body.toLowerCase().includes('hello@paysick'),
        `"${type}" email must include PaySick branding/contact in body`
      );
    }
  });

  test('collections messages for pre_collections do not threaten credit listing before day 30', () => {
    const earlyTypes = ['collections_day_1', 'collections_day_3', 'collections_day_7', 'collections_early_8d'];
    for (const type of earlyTypes) {
      const tpl = svc.getMessageTemplate(type, 'email', SAMPLE_DATA);
      if (!tpl) continue;
      const lower = tpl.body.toLowerCase();
      assert.ok(
        !lower.includes('credit bureau') || !lower.includes('list your account'),
        `"${type}" email must not threaten credit bureau listing in early stage`
      );
    }
  });

  test('restructure_offer email mentions patient-first recovery language', () => {
    const tpl = svc.getMessageTemplate('restructure_offer', 'email', SAMPLE_DATA);
    const lower = tpl.body.toLowerCase();
    assert.ok(
      lower.includes('help') || lower.includes('support') || lower.includes('arrangement') || lower.includes('option'),
      'restructure_offer email must include supportive/recovery-oriented language'
    );
  });

  test('account_written_off email does not use abusive language', () => {
    const tpl = svc.getMessageTemplate('account_written_off', 'email', SAMPLE_DATA);
    const lower = tpl.body.toLowerCase();
    const abusive = ['defaulter', 'delinquent', 'criminal', 'fraud'];
    for (const word of abusive) {
      assert.ok(
        !lower.includes(word),
        `account_written_off email must not use abusive term "${word}"`
      );
    }
  });

});
