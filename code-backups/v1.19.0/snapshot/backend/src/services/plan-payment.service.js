'use strict';

/**
 * PLAN PAYMENT SERVICE
 *
 * Pays one instalment of a PaySick payment plan: marks it paid, credits the
 * plan, writes the ledger lines, and adds the 5%-per-full-overdue-month late
 * fee from fee.service.js when it applies.
 *
 * Moved out of routes/payments.js's POST /:payment_id/pay unchanged, so the
 * Make Payment page and the Care Agent's MAKE_PAYMENT action share one code
 * path for money. The query sequence is exactly the route's original one.
 *
 * `query` and `transaction` are injected (config/database.js in production)
 * so this runs under plain node --test with fakes.
 */

const { calculateLateFee } = require('./fee.service');

const DAY_MS = 1000 * 60 * 60 * 24;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function createPlanPaymentService({ query, transaction }) {
  /**
   * @param {{ paymentId: string, userId: string, paymentMethod?: string, now?: number }} params
   * @returns {Promise<{ transaction: object, lateFee: object|null, planId: string, paymentNumber: number, amount: number, totalCollected: number }>}
   * @throws {Error} with statusCode 404 (not this user's payment) or 400 (already paid)
   */
  async function processPayment({ paymentId, userId, paymentMethod, now = Date.now() }) {
    const paymentCheck = await query(
      `SELECT p.*, pp.plan_id, pp.total_paid, pp.payments_made
       FROM payments p
       JOIN payment_plans pp ON p.plan_id = pp.plan_id
       WHERE p.payment_id = $1 AND p.user_id = $2`,
      [paymentId, userId]
    );

    if (paymentCheck.rows.length === 0) {
      throw httpError(404, 'Payment not found');
    }

    const payment = paymentCheck.rows[0];

    if (payment.status === 'paid') {
      throw httpError(400, 'Payment already completed');
    }

    // Calculate late fee if the payment is overdue (5% per month, no base interest)
    const daysOverdue = payment.due_date
      ? Math.max(0, Math.floor((now - new Date(payment.due_date).getTime()) / DAY_MS))
      : 0;
    const feeCalc = calculateLateFee(parseFloat(payment.amount), daysOverdue);
    const totalAmountDue = feeCalc.total_due;
    const lateFeeAmount = feeCalc.late_fee_amount;

    const txn = await transaction(async (client) => {
      // Update payment status and record late fee
      await client.query(
        `UPDATE payments
         SET status = 'paid',
             payment_date = CURRENT_TIMESTAMP,
             debit_order_status = 'successful',
             late_fee = $2
         WHERE payment_id = $1`,
        [paymentId, lateFeeAmount]
      );

      // Update payment plan — credit the full amount collected (including late fee)
      await client.query(
        `UPDATE payment_plans
         SET payments_made = payments_made + 1,
             total_paid = total_paid + $1,
             outstanding_balance = outstanding_balance - $2,
             status = CASE
               WHEN payments_made + 1 >= number_of_payments THEN 'completed'
               ELSE 'active'
             END,
             completion_date = CASE
               WHEN payments_made + 1 >= number_of_payments THEN CURRENT_DATE
               ELSE NULL
             END
         WHERE plan_id = $3`,
        [totalAmountDue, parseFloat(payment.amount), payment.plan_id]
      );

      // Create transaction record for the base payment
      const inserted = await client.query(
        `INSERT INTO transactions (
          payment_id, user_id, transaction_type, amount,
          status, description
        ) VALUES ($1, $2, $3, $4, 'completed', $5)
        RETURNING *`,
        [
          paymentId,
          userId,
          paymentMethod || 'manual_payment',
          parseFloat(payment.amount),
          `Payment ${payment.payment_number} of ${payment.plan_id}`
        ]
      );

      // Record late fee as a separate transaction line if applicable
      if (lateFeeAmount > 0) {
        await client.query(
          `INSERT INTO transactions (
            payment_id, user_id, transaction_type, amount,
            status, description
          ) VALUES ($1, $2, 'fee', $3, 'completed', $4)`,
          [
            paymentId,
            userId,
            lateFeeAmount,
            `Late payment fee — ${feeCalc.months_late} month(s) overdue (5% per month)`
          ]
        );
      }

      return inserted.rows[0];
    });

    return {
      transaction: txn,
      lateFee: lateFeeAmount > 0 ? {
        months_late: feeCalc.months_late,
        late_fee_amount: lateFeeAmount,
        total_collected: totalAmountDue,
        policy: '5% per overdue month — no interest on payments made on time'
      } : null,
      planId: payment.plan_id,
      paymentNumber: payment.payment_number,
      amount: parseFloat(payment.amount),
      totalCollected: totalAmountDue
    };
  }

  return { processPayment };
}

module.exports = { createPlanPaymentService };
