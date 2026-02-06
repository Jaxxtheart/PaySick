const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const jwt = require('jsonwebtoken');
const { healthcareRiskService } = require('../services/healthcare-risk.service');

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

// Admin middleware (in production, check for admin role)
const requireAdmin = (req, res, next) => {
  // For demo, allow all authenticated users
  // In production: check req.user.role === 'admin'
  next();
};

/**
 * GET /api/risk/portfolio-summary
 * Get overall risk portfolio summary for admin dashboard
 */
router.get('/portfolio-summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const summary = await healthcareRiskService.getPortfolioRiskSummary();

    // Get targets for comparison
    const targets = {
      target_pd: 0.032,  // 3.2%
      target_lgd: 0.45,  // 45%
      target_el_rate: 0.014  // 1.4%
    };

    res.json({
      summary: {
        total_assessments: parseInt(summary.total_assessments) || 0,
        avg_pd: parseFloat(summary.avg_pd) || 0,
        avg_lgd: parseFloat(summary.avg_lgd) || 0,
        avg_expected_loss_rate: parseFloat(summary.avg_expected_loss_rate) || 0,
        total_exposure: parseFloat(summary.total_exposure) || 0,
        total_expected_loss: parseFloat(summary.total_expected_loss) || 0,
        approved_count: parseInt(summary.approved_count) || 0,
        declined_count: parseInt(summary.declined_count) || 0,
        review_count: parseInt(summary.review_count) || 0
      },
      targets,
      performance_vs_target: {
        pd_variance: (parseFloat(summary.avg_pd) || 0) - targets.target_pd,
        lgd_variance: (parseFloat(summary.avg_lgd) || 0) - targets.target_lgd,
        el_variance: (parseFloat(summary.avg_expected_loss_rate) || 0) - targets.target_el_rate
      }
    });
  } catch (error) {
    console.error('Portfolio summary error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio summary' });
  }
});

/**
 * GET /api/risk/distribution
 * Get risk distribution by PD band
 */
router.get('/distribution', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const distribution = await healthcareRiskService.getRiskDistribution();

    res.json({
      distribution: distribution.map(band => ({
        pd_band: band.pd_band,
        count: parseInt(band.count),
        avg_pd: parseFloat(band.avg_pd),
        avg_el_rate: parseFloat(band.avg_el_rate),
        total_exposure: parseFloat(band.total_exposure)
      }))
    });
  } catch (error) {
    console.error('Risk distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch risk distribution' });
  }
});

/**
 * GET /api/risk/health-score-distribution
 * Get patient health score distribution
 */
router.get('/health-score-distribution', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        score_band,
        COUNT(*) AS patient_count,
        ROUND(AVG(health_payment_score)) AS avg_score,
        ROUND(AVG(medical_aid_score)) AS avg_medical_aid,
        ROUND(AVG(medication_adherence_score)) AS avg_medication,
        ROUND(AVG(provider_payment_score)) AS avg_provider_payment,
        COUNT(CASE WHEN active_medical_aid THEN 1 END) AS with_medical_aid
      FROM patient_health_scores
      GROUP BY score_band
      ORDER BY
        CASE score_band
          WHEN 'excellent' THEN 1
          WHEN 'good' THEN 2
          WHEN 'fair' THEN 3
          ELSE 4
        END
    `);

    res.json({
      distribution: result.rows.map(row => ({
        score_band: row.score_band,
        patient_count: parseInt(row.patient_count),
        avg_score: parseInt(row.avg_score),
        avg_medical_aid: parseInt(row.avg_medical_aid),
        avg_medication: parseInt(row.avg_medication),
        avg_provider_payment: parseInt(row.avg_provider_payment),
        with_medical_aid: parseInt(row.with_medical_aid)
      }))
    });
  } catch (error) {
    console.error('Health score distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch health score distribution' });
  }
});

/**
 * GET /api/risk/procedure-risk
 * Get risk by procedure type
 */
router.get('/procedure-risk', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        a.treatment_type,
        COUNT(*) AS applications,
        AVG(hra.pd_score) AS avg_pd,
        AVG(hra.lgd_score) AS avg_lgd,
        AVG(hra.expected_loss_rate) AS avg_el_rate,
        SUM(hra.exposure_at_default) AS total_exposure,
        SUM(hra.expected_loss) AS total_expected_loss
      FROM healthcare_risk_assessments hra
      JOIN applications a ON hra.application_id = a.application_id
      WHERE hra.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY a.treatment_type
      ORDER BY total_exposure DESC
      LIMIT 10
    `);

    res.json({
      procedure_risk: result.rows.map(row => ({
        treatment_type: row.treatment_type,
        applications: parseInt(row.applications),
        avg_pd: parseFloat(row.avg_pd),
        avg_lgd: parseFloat(row.avg_lgd),
        avg_el_rate: parseFloat(row.avg_el_rate),
        total_exposure: parseFloat(row.total_exposure),
        total_expected_loss: parseFloat(row.total_expected_loss)
      }))
    });
  } catch (error) {
    console.error('Procedure risk error:', error);
    res.status(500).json({ error: 'Failed to fetch procedure risk data' });
  }
});

/**
 * GET /api/risk/data-sources
 * Get healthcare data sources configuration
 */
router.get('/data-sources', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT
        source_id,
        source_name,
        source_type,
        provider_name,
        pd_weight,
        lgd_weight,
        status,
        last_sync
      FROM health_data_sources
      ORDER BY pd_weight DESC
    `);

    res.json({
      data_sources: result.rows.map(row => ({
        source_id: row.source_id,
        source_name: row.source_name,
        source_type: row.source_type,
        provider_name: row.provider_name,
        pd_weight: parseFloat(row.pd_weight),
        lgd_weight: parseFloat(row.lgd_weight),
        status: row.status,
        last_sync: row.last_sync
      }))
    });
  } catch (error) {
    console.error('Data sources error:', error);
    res.status(500).json({ error: 'Failed to fetch data sources' });
  }
});

/**
 * GET /api/risk/model-performance
 * Get risk model performance metrics
 */
router.get('/model-performance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM risk_model_performance
      ORDER BY period_end DESC
      LIMIT 12
    `);

    // Calculate current period performance
    const currentPeriod = await query(`
      SELECT
        COUNT(*) AS total_assessments,
        AVG(pd_score) AS avg_predicted_pd,
        model_version
      FROM healthcare_risk_assessments
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY model_version
    `);

    res.json({
      historical: result.rows,
      current_period: currentPeriod.rows[0] || null,
      model_version: 'v1.0'
    });
  } catch (error) {
    console.error('Model performance error:', error);
    res.status(500).json({ error: 'Failed to fetch model performance' });
  }
});

/**
 * GET /api/risk/assessment/:applicationId
 * Get risk assessment details for a specific application
 */
router.get('/assessment/:applicationId', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT hra.*,
              a.bill_amount,
              a.treatment_type,
              a.provider_name,
              u.full_name
       FROM healthcare_risk_assessments hra
       JOIN applications a ON hra.application_id = a.application_id
       JOIN users u ON hra.user_id = u.user_id
       WHERE hra.application_id = $1`,
      [req.params.applicationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Risk assessment not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Risk assessment fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch risk assessment' });
  }
});

/**
 * GET /api/risk/health-score/:userId
 * Get patient health score for a specific user
 */
router.get('/health-score/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM patient_health_scores WHERE user_id = $1`,
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Health score not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Health score fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch health score' });
  }
});

/**
 * POST /api/risk/recalculate/:applicationId
 * Recalculate risk for an application (admin only)
 */
router.post('/recalculate/:applicationId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get application details
    const appResult = await query(
      `SELECT a.*, u.user_id
       FROM applications a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.application_id = $1`,
      [req.params.applicationId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const app = appResult.rows[0];

    // Recalculate risk
    const riskAssessment = await healthcareRiskService.calculateRiskAssessment({
      userId: app.user_id,
      applicationId: app.application_id,
      loanAmount: parseFloat(app.bill_amount),
      procedureType: app.treatment_type,
      providerId: app.provider_id,
      monthlyIncome: req.body.monthly_income || 15000,
      existingDebt: req.body.existing_debt || 0,
      medicalAidScheme: req.body.medical_aid_scheme,
      medicalAidOption: req.body.medical_aid_option,
      hasChronicConditions: req.body.has_chronic_conditions
    });

    res.json({
      message: 'Risk recalculated successfully',
      assessment: riskAssessment
    });
  } catch (error) {
    console.error('Risk recalculation error:', error);
    res.status(500).json({ error: 'Failed to recalculate risk' });
  }
});

module.exports = router;
