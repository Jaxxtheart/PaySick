'use strict';

/**
 * Unit Tests — External Referral (registered debt collector / attorney)
 *
 * The rarest, most expensive lever in the recovery ladder. Reserved for
 * the small tail of cases where the outstanding balance justifies the
 * cost of external recovery, and always requires human approval — never
 * triggered automatically.
 *
 * Written BEFORE implementation (test-first workflow, CLAUDE.md).
 * Run: node --test tests/unit/external-referral.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { referCase } = require('../../backend/src/adapters/debt-collector.adapter');

const {
  isEligibleForReferral,
  referIfEligible,
  MIN_REFERRAL_BALANCE_CENTS,
  MIN_DAYS_OVERDUE_FOR_REFERRAL
} = require('../../backend/src/services/external-referral.service');

describe('debt-collector.adapter — referCase (mock)', () => {
  test('returns a referralId and REFERRED status for a registered partner type', async () => {
    const result = await referCase({
      caseId: 'case-1',
      partnerType: 'registered_debt_collector',
      outstandingAmountCents: 85000,
      humanApprovedBy: 'ops-lead-1'
    });
    assert.ok(typeof result.referralId === 'string' && result.referralId.startsWith('ext-ref-'));
    assert.equal(result.status, 'REFERRED');
  });

  test('rejects an unregistered / unknown partner type', async () => {
    await assert.rejects(() => referCase({
      caseId: 'case-1',
      partnerType: 'random_agency',
      outstandingAmountCents: 85000,
      humanApprovedBy: 'ops-lead-1'
    }));
  });

  test('rejects a missing humanApprovedBy', async () => {
    await assert.rejects(() => referCase({
      caseId: 'case-1',
      partnerType: 'attorney',
      outstandingAmountCents: 85000
    }));
  });
});

describe('external-referral.service — isEligibleForReferral (proportionality rule)', () => {
  test('never eligible without explicit human approval, regardless of balance or age', () => {
    const result = isEligibleForReferral({
      daysOverdue: 120,
      outstandingAmountCents: 1000000,
      humanApproved: false
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'requires_human_approval');
  });

  test('not eligible before the case has reached late stage, even if approved', () => {
    const result = isEligibleForReferral({
      daysOverdue: 45,
      outstandingAmountCents: 1000000,
      humanApproved: true
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'not_yet_late_stage');
  });

  test('not eligible when the balance is too small to justify external cost', () => {
    const result = isEligibleForReferral({
      daysOverdue: 95,
      outstandingAmountCents: 8500, // one typical facility — far below the floor
      humanApproved: true
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'balance_too_small_to_justify_cost');
  });

  test('eligible once late-stage, above the balance floor, and human-approved', () => {
    const result = isEligibleForReferral({
      daysOverdue: 95,
      outstandingAmountCents: MIN_REFERRAL_BALANCE_CENTS,
      humanApproved: true
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, null);
  });

  test('the late-stage floor matches the recovery lifecycle (day 90)', () => {
    assert.equal(MIN_DAYS_OVERDUE_FOR_REFERRAL, 90);
  });
});

describe('external-referral.service — referIfEligible', () => {
  test('does not call the adapter when ineligible', async () => {
    const result = await referIfEligible({
      caseId: 'case-1',
      partnerType: 'attorney',
      daysOverdue: 10,
      outstandingAmountCents: 1000000,
      humanApprovedBy: null
    });
    assert.equal(result.referred, false);
  });

  test('refers to the adapter and returns a referralId when eligible', async () => {
    const result = await referIfEligible({
      caseId: 'case-1',
      partnerType: 'attorney',
      daysOverdue: 95,
      outstandingAmountCents: MIN_REFERRAL_BALANCE_CENTS,
      humanApprovedBy: 'ops-lead-1'
    });
    assert.equal(result.referred, true);
    assert.ok(typeof result.referralId === 'string');
  });
});
