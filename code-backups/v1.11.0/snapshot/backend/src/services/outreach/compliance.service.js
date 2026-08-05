'use strict';

/**
 * TERMINOLOGY LINTER — COMPLIANCE GATE (§6.3)
 *
 * PaySick is a payment FACILITATOR, not a lender or credit provider. Provider-
 * and patient-facing copy must never use lending/credit terminology (CPA/POPIA
 * positioning). Every generated draft passes through this linter BEFORE it can
 * enter the approve-queue. A non-empty flag list routes the touch to
 * `compliance_hold` — it is never queued for send.
 *
 * This is enforced in code, not left to the LLM's discretion (§2.1).
 */

// Denied terms. Word-boundaried and case-insensitive. Optional plural/suffix
// groups are captured so "loans", "lending", "borrower", "debtor", "defaults",
// "repayments" all match.
const DENY = /\b(credit|loans?|lend(?:ing)?|borrow(?:er)?|interest|apr|debt(?:or)?|defaults?|repayments?|financing)\b/i;

/**
 * Scan text for denied terminology.
 * @param {string} text
 * @returns {string[]} distinct, lowercased matched terms (empty => compliant)
 */
function complianceScan(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const matches = text.match(new RegExp(DENY, 'gi'));
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

/**
 * @param {string} text
 * @returns {boolean} true when the text contains no denied terminology
 */
function isCompliant(text) {
  return complianceScan(text).length === 0;
}

module.exports = { complianceScan, isCompliant, DENY };
