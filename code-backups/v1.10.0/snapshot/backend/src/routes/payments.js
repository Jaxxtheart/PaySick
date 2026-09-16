const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');
const { logSecurityEvent } = require('../services/security.service');
const { calculateLateFee } = require('../services/fee.service');

// Get all payment plans for user
router.get('/plans', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT pp.*,
              a.provider_name, a.treatment_type, a.bill_amount
       FROM payment_plans pp
       JOIN applications a ON pp.application_id = a.application_id
       WHERE pp.user_id = $1
       ORDER BY pp.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Payment plans fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch payment plans' });
  }
});

// Get single payment plan
router.get('/plans/:id', authenticateToken, async (req, res) => {
  try {
    const planResult = await query(
      `SELECT pp.*,
              a.provider_name, a.treatment_type, a.bill_amount
       FROM payment_plans pp
       JOIN applications a ON pp.application_id = a.application_id
       WHERE pp.plan_id = $1 AND pp.user_id = $2`,
      [req.params.id, req.user.userId]
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Payment plan not found' });
    }

    // Get associated payments
    const paymentsResult = await query(
      `SELECT * FROM payments
       WHERE plan_id = $1
       ORDER BY payment_number ASC`,
      [req.params.id]
    );

    const plan = planResult.rows[0];
    plan.payments = paymentsResult.rows;

    res.json(plan);
  } catch (error) {
    console.error('Payment plan fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch payment plan' });
  }
});

// Get upcoming payments
router.get('/upcoming', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*,
              pp.plan_id,
              a.provider_name, a.treatment_type
       FROM payments p
       JOIN payment_plans pp ON p.plan_id = pp.plan_id
       JOIN applications a ON pp.application_id = a.application_id
       WHERE p.user_id = $1
         AND p.status IN ('scheduled', 'overdue')
         AND p.due_date >= CURRENT_DATE
       ORDER BY p.due_date ASC
       LIMIT 10`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Upcoming payments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming payments' });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*,
              pp.plan_id,
              a.provider_name, a.treatment_type
       FROM payments p
       JOIN payment_plans pp ON p.plan_id = pp.plan_id
       JOIN applications a ON pp.application_id = a.application_id
       WHERE p.user_id = $1
         AND p.status = 'paid'
       ORDER BY p.payment_date DESC
       LIMIT 50`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Payment history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Make a manual payment
router.post('/:payment_id/pay', authenticateToken, async (req, res) => {
  try {
    const { payment_id } = req.params;
    const { amount, payment_method } = req.body;

    // Get payment details
    const paymentCheck = await query(
      `SELECT p.*, pp.plan_id, pp.total_paid, pp.payments_made
       FROM payments p
       JOIN payment_plans pp ON p.plan_id = pp.plan_id
       WHERE p.payment_id = $1 AND p.user_id = $2`,
      [payment_id, req.user.userId]
    );

    if (paymentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = paymentCheck.rows[0];

    if (payment.status === 'paid') {
      return res.status(400).json({ error: 'Payment already completed' });
    }

    // Calculate late fee if the payment is overdue (5% per month, no base interest)
    const daysOverdue = payment.due_date
      ? Math.max(0, Math.floor((Date.now() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const feeCalc = calculateLateFee(parseFloat(payment.amount), daysOverdue);
    const totalAmountDue = feeCalc.total_due;
    const lateFeeAmount = feeCalc.late_fee_amount;

    // Process payment in transaction
    const result = await transaction(async (client) => {
      // Update payment status and record late fee
      await client.query(
        `UPDATE payments
         SET status = 'paid',
             payment_date = CURRENT_TIMESTAMP,
             debit_order_status = 'successful',
             late_fee = $2
         WHERE payment_id = $1`,
        [payment_id, lateFeeAmount]
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
      const txn = await client.query(
        `INSERT INTO transactions (
          payment_id, user_id, transaction_type, amount,
          status, description
        ) VALUES ($1, $2, $3, $4, 'completed', $5)
        RETURNING *`,
        [
          payment_id,
          req.user.userId,
          payment_method || 'manual_payment',
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
            payment_id,
            req.user.userId,
            lateFeeAmount,
            `Late payment fee — ${feeCalc.months_late} month(s) overdue (5% per month)`
          ]
        );
      }

      return txn.rows[0];
    });

    res.json({
      message: 'Payment processed successfully',
      transaction: result,
      late_fee: lateFeeAmount > 0 ? {
        months_late: feeCalc.months_late,
        late_fee_amount: lateFeeAmount,
        total_collected: totalAmountDue,
        policy: '5% per overdue month — no interest on payments made on time'
      } : null
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// Mark overdue payments and update late fees (admin — run nightly via cron)
router.post('/admin/process-overdue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Find all scheduled payments past their due date
    const overdueResult = await query(
      `SELECT payment_id, amount, due_date,
              CURRENT_DATE - due_date AS days_overdue
       FROM payments
       WHERE status = 'scheduled'
         AND due_date < CURRENT_DATE`
    );

    const updated = [];
    for (const p of overdueResult.rows) {
      const feeCalc = calculateLateFee(parseFloat(p.amount), parseInt(p.days_overdue));
      await query(
        `UPDATE payments
         SET status = 'overdue',
             late_fee = $2,
             updated_at = NOW()
         WHERE payment_id = $1`,
        [p.payment_id, feeCalc.late_fee_amount]
      );
      updated.push({
        payment_id: p.payment_id,
        days_overdue: p.days_overdue,
        months_late: feeCalc.months_late,
        late_fee: feeCalc.late_fee_amount,
        total_due: feeCalc.total_due
      });
    }

    res.json({
      processed: updated.length,
      payments: updated,
      policy: '5% late fee per full calendar month overdue — no base interest'
    });
  } catch (error) {
    console.error('Process overdue error:', error);
    res.status(500).json({ error: 'Failed to process overdue payments' });
  }
});

// Get fee preview for a payment (shows late fee if overdue)
router.get('/:payment_id/fee-preview', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.payment_id, p.amount, p.due_date, p.status, p.late_fee
       FROM payments p
       WHERE p.payment_id = $1 AND p.user_id = $2`,
      [req.params.payment_id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const p = result.rows[0];
    const daysOverdue = p.due_date
      ? Math.max(0, Math.floor((Date.now() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24)))
      : 0;
    const feeCalc = calculateLateFee(parseFloat(p.amount), daysOverdue);

    res.json({
      payment_id: p.payment_id,
      original_amount: parseFloat(p.amount),
      days_overdue: daysOverdue,
      months_late: feeCalc.months_late,
      late_fee_amount: feeCalc.late_fee_amount,
      total_due: feeCalc.total_due,
      interest_rate: 0,
      policy: 'No interest charged. 5% late fee applies per full calendar month overdue.'
    });
  } catch (error) {
    console.error('Fee preview error:', error);
    res.status(500).json({ error: 'Failed to calculate fee preview' });
  }
});

// Get transactions for a payment
router.get('/:payment_id/transactions', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*
       FROM transactions t
       JOIN payments p ON t.payment_id = p.payment_id
       WHERE t.payment_id = $1 AND p.user_id = $2
       ORDER BY t.created_at DESC`,
      [req.params.payment_id, req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
