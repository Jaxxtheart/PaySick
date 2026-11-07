/**
 * FEE SERVICE
 *
 * Central source of truth for all fee rates across the PaySick platform.
 *
 * Policy:
 *  - Patients pay ZERO interest on their payment plan (bill amount split over 3 months)
 *  - If a patient misses a payment, a 5% late fee is charged on the overdue amount
 *    for EACH calendar month the payment remains unpaid (compounding monthly)
 *  - Providers are charged a 5% service fee on each settlement (deducted from gross)
 */

// ─── Fee Rates ────────────────────────────────────────────────────────────────

/** Service fee deducted from provider gross settlement amount (5%) */
const PROVIDER_SERVICE_FEE_PCT = 0.05;

/** Monthly late fee charged on overdue patient payments (5% per month late) */
const PATIENT_LATE_FEE_PCT_PER_MONTH = 0.05;

/** Patient base interest rate — always zero (PaySick charges providers, not patients) */
const PATIENT_BASE_INTEREST_RATE = 0.00;

// ─── Calculation Helpers ──────────────────────────────────────────────────────

/**
 * Calculate the late fee owed on an overdue patient payment.
 *
 * @param {number} originalAmount  - The original scheduled payment amount (ZAR)
 * @param {number} daysOverdue     - Calendar days since the payment due date
 * @returns {{ months_late: number, late_fee_amount: number, total_due: number }}
 */
function calculateLateFee(originalAmount, daysOverdue) {
  if (daysOverdue <= 0) {
    return { months_late: 0, late_fee_amount: 0, total_due: originalAmount };
  }

  // Charge 5% for each FULL calendar month overdue (30-day periods)
  const months_late = Math.floor(daysOverdue / 30);
  if (months_late === 0) {
    return { months_late: 0, late_fee_amount: 0, total_due: originalAmount };
  }

  // Compound: each month the fee is applied to the growing outstanding balance
  const total_due = originalAmount * Math.pow(1 + PATIENT_LATE_FEE_PCT_PER_MONTH, months_late);
  const late_fee_amount = parseFloat((total_due - originalAmount).toFixed(2));

  return {
    months_late,
    late_fee_amount,
    total_due: parseFloat(total_due.toFixed(2))
  };
}

/**
 * Calculate the provider service fee and net payout for a settlement.
 *
 * @param {number} grossAmount  - Total bill amount being settled (ZAR)
 * @returns {{ gross_amount: number, service_fee_amount: number, net_amount: number, service_fee_pct: number }}
 */
function calculateProviderSettlement(grossAmount) {
  const service_fee_amount = parseFloat((grossAmount * PROVIDER_SERVICE_FEE_PCT).toFixed(2));
  const net_amount = parseFloat((grossAmount - service_fee_amount).toFixed(2));

  return {
    gross_amount: parseFloat(grossAmount.toFixed(2)),
    service_fee_amount,
    net_amount,
    service_fee_pct: PROVIDER_SERVICE_FEE_PCT * 100 // 5
  };
}

module.exports = {
  PROVIDER_SERVICE_FEE_PCT,
  PATIENT_LATE_FEE_PCT_PER_MONTH,
  PATIENT_BASE_INTEREST_RATE,
  calculateLateFee,
  calculateProviderSettlement
};
