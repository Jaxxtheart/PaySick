/**
 * Document cross-check — every document is checked against the others.
 *
 * Kehr does not take a typed income figure. It reads income from a bank feed
 * (Stitch), an uploaded statement, or a payslip, and checks them against the
 * verified identity and against each other. Inconsistencies become flags;
 * flagged applications go to a person (DOCUMENT_MISMATCH review), never to an
 * automatic decline.
 *
 * Pure: no I/O. Amounts in integer cents.
 */

'use strict';

const PAYSLIP_TOLERANCE = 0.10;

const METHODS = Object.freeze({
  BANK_FEED: 'STITCH_OPEN_BANKING',
  STATEMENT: 'PDF_BANK_STATEMENT',
  MANUAL: 'MANUAL_REVIEW',
});

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function surnameOf(fullName) {
  const parts = String(fullName || '').trim().toUpperCase().split(/[\s.]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function nameMatches(identityName, documentName) {
  const surname = surnameOf(identityName);
  if (!surname || !documentName) return true; // nothing to compare
  const tokens = String(documentName).toUpperCase().split(/[\s.]+/);
  return tokens.includes(surname);
}

function salaryMedian(source) {
  const credits = (source && source.salaryCredits) || [];
  const amounts = credits.map((c) => c.amountCents).filter((n) => Number.isInteger(n) && n > 0);
  return amounts.length ? median(amounts) : null;
}

function crossCheckDocuments({ identity = {}, bankFeed, payslip, statement } = {}) {
  const flags = [];
  const addFlag = (f) => { if (!flags.includes(f)) flags.push(f); };

  for (const doc of [bankFeed, statement]) {
    if (doc && !nameMatches(identity.fullName, doc.accountHolder)) addFlag('NAME_MISMATCH');
  }
  if (payslip && !nameMatches(identity.fullName, payslip.employeeName)) addFlag('NAME_MISMATCH');
  if (payslip && payslip.idNumber && identity.idNumber && payslip.idNumber !== identity.idNumber) {
    addFlag('ID_MISMATCH');
  }

  if (statement && [statement.openingBalanceCents, statement.totalCreditsCents, statement.totalDebitsCents, statement.closingBalanceCents].every(Number.isInteger)) {
    const expected = statement.openingBalanceCents + statement.totalCreditsCents - statement.totalDebitsCents;
    if (expected !== statement.closingBalanceCents) addFlag('STATEMENT_ARITHMETIC');
  }

  let verifiedMonthlyIncomeCents = null;
  let method = null;
  let obligationsCents = 0;

  if (bankFeed) {
    verifiedMonthlyIncomeCents = salaryMedian(bankFeed);
    obligationsCents = Number.isInteger(bankFeed.debitOrdersCents) ? bankFeed.debitOrdersCents : 0;
    method = METHODS.BANK_FEED;
  } else if (statement) {
    verifiedMonthlyIncomeCents = salaryMedian(statement);
    obligationsCents = Number.isInteger(statement.debitOrdersCents) ? statement.debitOrdersCents : 0;
    method = METHODS.STATEMENT;
  } else if (payslip && Number.isInteger(payslip.netPayCents)) {
    verifiedMonthlyIncomeCents = payslip.netPayCents;
    method = METHODS.MANUAL;
  }

  const bankIncome = salaryMedian(bankFeed) ?? salaryMedian(statement);
  if (payslip && Number.isInteger(payslip.netPayCents) && bankIncome) {
    if (Math.abs(payslip.netPayCents - bankIncome) / bankIncome > PAYSLIP_TOLERANCE) {
      addFlag('PAYSLIP_BANK_MISMATCH');
    }
  }

  if (verifiedMonthlyIncomeCents === null) addFlag('NO_INCOME_EVIDENCE');

  return {
    consistent: flags.length === 0,
    flags,
    verifiedMonthlyIncomeCents,
    obligationsCents,
    method,
  };
}

module.exports = { crossCheckDocuments, METHODS, PAYSLIP_TOLERANCE };
