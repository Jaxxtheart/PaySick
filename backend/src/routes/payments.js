const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

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

    // Process payment in transaction
    const result = await transaction(async (client) => {
      // Update payment status
      await client.query(
        `UPDATE payments
         SET status = 'paid',
             payment_date = CURRENT_TIMESTAMP,
             debit_order_status = 'successful'
         WHERE payment_id = $1`,
        [payment_id]
      );

      // Update payment plan
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
        [payment.amount, payment.amount, payment.plan_id]
      );

      // Create transaction record
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
          payment.amount,
          `Payment ${payment.payment_number} of ${payment.plan_id}`
        ]
      );

      return txn.rows[0];
    });

    res.json({
      message: 'Payment processed successfully',
      transaction: result
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
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
