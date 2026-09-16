'use strict';

/**
 * BUREAU REPORTING SERVICE
 *
 * For a book with an average facility of R850, credit bureau listing is
 * the recovery engine's strongest lever — external legal action rarely
 * clears its own cost at this ticket size. Reports arrears once a case
 * has reached Mid Collections (30+ days overdue).
 */

const { submitArrearsReport } = require('../adapters/credit-bureau.adapter');

const BUREAU_REPORTING_THRESHOLD_DAYS = 30;

function isReportable(daysOverdue) {
  return Number.isInteger(daysOverdue) && daysOverdue >= BUREAU_REPORTING_THRESHOLD_DAYS;
}

/**
 * @param {{caseId:string, saIdNumber:string, daysOverdue:number, outstandingAmountCents:number}} params
 */
async function reportIfDue({ caseId, saIdNumber, daysOverdue, outstandingAmountCents }) {
  if (!isReportable(daysOverdue)) {
    return { reported: false, reason: 'below_threshold' };
  }

  const result = await submitArrearsReport({ caseId, saIdNumber, daysOverdue, outstandingAmountCents });
  return { reported: true, ...result };
}

module.exports = {
  isReportable,
  reportIfDue,
  BUREAU_REPORTING_THRESHOLD_DAYS
};
