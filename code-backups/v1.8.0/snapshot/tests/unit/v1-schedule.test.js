/**
 * Unit tests — instalment schedule generator.
 *
 * Per spec:
 *   totalRepayable = facilitationAmount + patientFacilitationFee
 *   monthlyInstalment = ceil(totalRepayable / termMonths)
 *   lastInstalment = totalRepayable - (monthlyInstalment * (termMonths - 1))
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { buildSchedule } = require('../../backend/src/services/schedule.service');

describe('buildSchedule', () => {
  test('produces termMonths instalments', () => {
    const s = buildSchedule({
      facilitationAmountCents: 1000000,
      facilitationFeeCents: 50000,
      termMonths: 6,
      startDate: new Date('2026-06-01')
    });
    assert.equal(s.instalments.length, 6);
    assert.equal(s.termMonths, 6);
  });

  test('totalRepayable equals facilitation + fee', () => {
    const s = buildSchedule({
      facilitationAmountCents: 1500000,
      facilitationFeeCents: 75000,
      termMonths: 12,
      startDate: new Date('2026-06-01')
    });
    assert.equal(s.totalRepayable, 1575000);
  });

  test('sum of instalments equals totalRepayable (last absorbs remainder)', () => {
    const s = buildSchedule({
      facilitationAmountCents: 1000001,
      facilitationFeeCents: 0,
      termMonths: 3,
      startDate: new Date('2026-06-01')
    });
    const sum = s.instalments.reduce((a, i) => a + i.amount, 0);
    assert.equal(sum, s.totalRepayable);
  });

  test('monthlyInstalment is Math.ceil(total / term)', () => {
    const s = buildSchedule({
      facilitationAmountCents: 1000001,
      facilitationFeeCents: 0,
      termMonths: 3,
      startDate: new Date('2026-06-01')
    });
    assert.equal(s.monthlyInstalment, Math.ceil(1000001 / 3));
  });

  test('all instalments start as PENDING', () => {
    const s = buildSchedule({
      facilitationAmountCents: 600000,
      facilitationFeeCents: 30000,
      termMonths: 6,
      startDate: new Date('2026-06-01')
    });
    s.instalments.forEach((i) => assert.equal(i.status, 'PENDING'));
  });

  test('dueDates are monthly cadence from startDate', () => {
    const s = buildSchedule({
      facilitationAmountCents: 600000,
      facilitationFeeCents: 0,
      termMonths: 3,
      startDate: new Date('2026-06-01')
    });
    assert.equal(new Date(s.instalments[0].dueDate).getUTCMonth(), 5);
    assert.equal(new Date(s.instalments[1].dueDate).getUTCMonth(), 6);
    assert.equal(new Date(s.instalments[2].dueDate).getUTCMonth(), 7);
  });

  test('instalmentNumbers are sequential starting at 1', () => {
    const s = buildSchedule({
      facilitationAmountCents: 600000,
      facilitationFeeCents: 0,
      termMonths: 4,
      startDate: new Date('2026-06-01')
    });
    assert.deepEqual(
      s.instalments.map((i) => i.instalmentNumber),
      [1, 2, 3, 4]
    );
  });
});
