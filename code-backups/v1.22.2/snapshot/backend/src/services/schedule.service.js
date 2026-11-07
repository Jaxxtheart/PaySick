/**
 * Schedule service — instalment schedule generator.
 *
 * Pure function. All amounts in integer cents.
 *
 *   totalRepayable = facilitationAmount + patientFacilitationFee
 *   monthlyInstalment = ceil(totalRepayable / termMonths)
 *   lastInstalment = totalRepayable - (monthlyInstalment * (termMonths - 1))
 *
 * The last instalment absorbs the rounding remainder so that sum equals total.
 */

'use strict';

function addMonths(date, n) {
  const d = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + n,
    date.getUTCDate()
  ));
  return d;
}

function buildSchedule({
  facilitationAmountCents,
  facilitationFeeCents,
  termMonths,
  startDate
}) {
  if (!Number.isInteger(facilitationAmountCents) || facilitationAmountCents < 0) {
    throw new Error('facilitationAmountCents must be a non-negative integer');
  }
  if (!Number.isInteger(facilitationFeeCents) || facilitationFeeCents < 0) {
    throw new Error('facilitationFeeCents must be a non-negative integer');
  }
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new Error('termMonths must be a positive integer');
  }
  if (!(startDate instanceof Date)) {
    throw new Error('startDate must be a Date');
  }

  const totalRepayable = facilitationAmountCents + facilitationFeeCents;
  const monthlyInstalment = Math.ceil(totalRepayable / termMonths);
  const lastInstalment = totalRepayable - monthlyInstalment * (termMonths - 1);

  const instalments = [];
  for (let i = 0; i < termMonths; i++) {
    const isLast = i === termMonths - 1;
    instalments.push({
      instalmentNumber: i + 1,
      dueDate: addMonths(startDate, i).toISOString(),
      amount: isLast ? lastInstalment : monthlyInstalment,
      status: 'PENDING'
    });
  }

  return {
    totalFacilitationAmount: facilitationAmountCents,
    totalFacilitationFee: facilitationFeeCents,
    totalRepayable,
    monthlyInstalment,
    termMonths,
    instalments
  };
}

module.exports = {
  buildSchedule
};
