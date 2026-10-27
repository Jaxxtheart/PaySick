const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');
const { logSecurityEvent } = require('../services/security.service');
const { calculateLateFee } = require('../services/fee.service');
const { createPlanPaymentService } = require('../services/plan-payment.service');

const planPaymentService = createPlanPaymentService({ query, transaction });

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
    const { payment_method } = req.body;

    // Shared with the Care Agent's MAKE_PAYMENT action: one code path for money.
    const result = await planPaymentService.processPayment({
      paymentId: payment_id,
      userId: req.user.userId,
      paymentMethod: payment_method
    });

    res.json({
      message: 'Payment processed successfully',
      transaction: result.transaction,
      late_fee: result.lateFee
    });
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 400) {
      return res.status(error.statusCode).json({ error: error.message });
    }
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
