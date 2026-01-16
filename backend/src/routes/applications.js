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

// Create new application
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      bill_amount,
      treatment_type,
      provider_name,
      existing_patient,
      provider_id
    } = req.body;

    // Validation
    if (!bill_amount || !treatment_type || !provider_name) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    if (bill_amount < 500 || bill_amount > 850) {
      return res.status(400).json({ error: 'Bill amount must be between R500 and R850' });
    }

    // Check user's credit limit
    const userCheck = await query(
      'SELECT credit_limit, status FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userCheck.rows[0].status !== 'active') {
      return res.status(403).json({ error: 'Account not active' });
    }

    // Simple risk scoring (in production, this would be more complex)
    const risk_score = Math.floor(Math.random() * 30) + 50; // Random score between 50-80

    // Auto-approve for demo purposes (in production, this would have proper risk assessment)
    const status = risk_score >= 60 ? 'approved' : 'under_review';
    const approved_amount = status === 'approved' ? bill_amount : null;
    const monthly_payment = status === 'approved' ? (bill_amount / 3).toFixed(2) : null;

    // Create application
    const result = await query(
      `INSERT INTO applications (
        user_id, provider_id, bill_amount, treatment_type, provider_name,
        existing_patient, risk_score, status, decision_date, approved_amount,
        monthly_payment, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, $9, $10, $11, $12)
      RETURNING *`,
      [
        req.user.userId,
        provider_id || null,
        bill_amount,
        treatment_type,
        provider_name,
        existing_patient || false,
        risk_score,
        status,
        approved_amount,
        monthly_payment,
        req.ip,
        req.get('User-Agent')
      ]
    );

    const application = result.rows[0];

    // If approved, create payment plan
    if (status === 'approved') {
      const planResult = await transaction(async (client) => {
        // Create payment plan
        const plan = await client.query(
          `INSERT INTO payment_plans (
            application_id, user_id, total_amount, monthly_amount,
            number_of_payments, status, start_date, first_payment_date,
            outstanding_balance
          ) VALUES ($1, $2, $3, $4, 3, 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', $5)
          RETURNING *`,
          [application.application_id, req.user.userId, bill_amount, monthly_payment, bill_amount]
        );

        // Create scheduled payments
        for (let i = 1; i <= 3; i++) {
          await client.query(
            `INSERT INTO payments (
              plan_id, user_id, payment_number, amount, due_date, status
            ) VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '${i} month', 'scheduled')`,
            [plan.rows[0].plan_id, req.user.userId, i, monthly_payment]
          );
        }

        return plan.rows[0];
      });

      application.payment_plan = planResult;
    }

    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });
  } catch (error) {
    console.error('Application creation error:', error);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// Get all applications for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*,
              pp.plan_id, pp.status as plan_status, pp.outstanding_balance,
              pp.payments_made, pp.total_paid
       FROM applications a
       LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Applications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// Get single application
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*,
              pp.plan_id, pp.status as plan_status, pp.outstanding_balance,
              pp.payments_made, pp.total_paid, pp.monthly_amount
       FROM applications a
       LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
       WHERE a.application_id = $1 AND a.user_id = $2`,
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Get associated payments if plan exists
    if (result.rows[0].plan_id) {
      const payments = await query(
        `SELECT * FROM payments
         WHERE plan_id = $1
         ORDER BY payment_number ASC`,
        [result.rows[0].plan_id]
      );
      result.rows[0].payments = payments.rows;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Application fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

module.exports = router;
