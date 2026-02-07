const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const jwt = require('jsonwebtoken');
const { healthcareRiskService } = require('../services/healthcare-risk.service');

// Default JWT secret for development (should be set in production)
const JWT_SECRET = process.env.JWT_SECRET || 'paysick-dev-secret-change-in-production';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err.message);
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

    if (bill_amount < 500 || bill_amount > 500000) {
      return res.status(400).json({ error: 'Bill amount must be between R500 and R500,000' });
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

    // Get user financial info for risk assessment
    // Note: healthcare_affordability table may not exist yet if migration hasn't run
    let userInfo;
    try {
      userInfo = await query(
        `SELECT u.*, bd.bank_name
         FROM users u
         LEFT JOIN banking_details bd ON u.user_id = bd.user_id AND bd.is_primary = true
         WHERE u.user_id = $1`,
        [req.user.userId]
      );
    } catch (e) {
      userInfo = { rows: [{}] };
    }

    // Create initial application to get application_id for risk assessment
    const initialApp = await query(
      `INSERT INTO applications (
        user_id, provider_id, bill_amount, treatment_type, provider_name,
        existing_patient, status, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
      RETURNING application_id`,
      [
        req.user.userId,
        provider_id || null,
        bill_amount,
        treatment_type,
        provider_name,
        existing_patient || false,
        req.ip,
        req.get('User-Agent')
      ]
    );

    const applicationId = initialApp.rows[0].application_id;

    // Run healthcare risk assessment
    let riskAssessment;
    try {
      riskAssessment = await healthcareRiskService.calculateRiskAssessment({
        userId: req.user.userId,
        applicationId,
        loanAmount: bill_amount,
        procedureType: treatment_type,
        icd10Code: req.body.icd10_code || null,
        providerId: provider_id || null,
        monthlyIncome: userInfo.rows[0]?.declared_income || req.body.monthly_income || 15000,
        existingDebt: userInfo.rows[0]?.monthly_debt_obligations || req.body.existing_debt || 0,
        medicalAidScheme: req.body.medical_aid_scheme || null,
        medicalAidOption: req.body.medical_aid_option || null,
        hasChronicConditions: req.body.has_chronic_conditions || false,
        applicationBehavior: {
          completionTimeSeconds: req.body.completion_time_seconds || 180,
          applicationHour: new Date().getHours(),
          deviceType: req.get('User-Agent')?.includes('Mobile') ? 'mobile' : 'desktop',
          locationConsistent: true
        }
      });
    } catch (riskError) {
      console.error('Risk assessment error:', riskError);
      // Fallback to basic scoring if risk service fails
      riskAssessment = {
        decision: { decision: 'review', reason: 'Risk service unavailable' },
        pd: { score: 0.05 },
        healthScore: 50
      };
    }

    // Determine status based on risk decision
    const status = riskAssessment.decision.decision === 'approve' ? 'approved' :
                   riskAssessment.decision.decision === 'decline' ? 'declined' : 'under_review';
    const approved_amount = status === 'approved' ? bill_amount : null;
    const monthly_payment = status === 'approved' ? (bill_amount / 3).toFixed(2) : null;

    // Convert PD score to 0-100 scale for legacy risk_score field
    const risk_score = Math.round((1 - riskAssessment.pd.score) * 100);

    // Update application with risk assessment results
    const result = await query(
      `UPDATE applications SET
        risk_score = $1,
        status = $2,
        decision_date = CURRENT_TIMESTAMP,
        approved_amount = $3,
        monthly_payment = $4,
        decision_reason = $5
      WHERE application_id = $6
      RETURNING *`,
      [
        risk_score,
        status,
        approved_amount,
        monthly_payment,
        riskAssessment.decision.reason,
        applicationId
      ]
    );

    const application = result.rows[0];

    // Include risk assessment details in response
    application.risk_assessment = {
      pd_score: riskAssessment.pd.score,
      pd_band: riskAssessment.pd.band,
      lgd_score: riskAssessment.lgd?.score,
      lgd_band: riskAssessment.lgd?.band,
      expected_loss_rate: riskAssessment.expectedLoss?.rate,
      health_payment_score: riskAssessment.healthScore,
      affordability_band: riskAssessment.affordability,
      pricing: riskAssessment.pricing
    };

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
