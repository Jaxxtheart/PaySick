/**
 * MARKETPLACE ROUTES
 *
 * API endpoints for the PaySick lending marketplace.
 * Includes:
 * - Application submission to marketplace
 * - Offer management (view, accept, decline)
 * - Lender webhook endpoints
 * - Admin/Lender dashboard endpoints
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../config/database');
const { MarketplaceAuctionService, marketplaceAuctionService } = require('../services/marketplace-auction.service');
const { LoanApprovalBridge } = require('../services/loan-approval-bridge.service');

// ============================================
// MIDDLEWARE
// ============================================

// Default JWT secret for development (should be set in production)
const JWT_SECRET = process.env.JWT_SECRET || 'paysick-dev-secret-change-in-production';

/**
 * Verify JWT token for authenticated routes
 */
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

/**
 * Validate webhook signature from lenders
 */
const validateWebhookSignature = async (req, res, next) => {
  const signature = req.headers['x-paysick-signature'];
  const lenderCode = req.body.lender_code;

  if (!signature || !lenderCode) {
    return res.status(401).json({ error: 'Missing signature or lender code' });
  }

  try {
    // Get lender's API key
    const result = await query(
      'SELECT api_key_encrypted FROM lenders WHERE code = $1 AND active = true',
      [lenderCode]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unknown lender' });
    }

    const apiKey = result.rows[0].api_key_encrypted || 'default-key';

    // Verify signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', apiKey)
      .update(payload)
      .digest('hex');

    // For demo/development, allow requests without valid signature
    if (process.env.NODE_ENV === 'production' && signature !== expectedSignature) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    next();
  } catch (error) {
    console.error('Webhook validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
};

/**
 * Admin authentication (simplified for demo)
 */
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Admin token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    // In production, check admin role
    req.user = user;
    req.isAdmin = true;
    next();
  });
};

// ============================================
// PATIENT ENDPOINTS
// ============================================

/**
 * Submit loan application to marketplace
 *
 * POST /api/marketplace/applications
 *
 * This creates a new marketplace loan application and sends it to eligible lenders
 */
router.post('/applications', authenticateToken, async (req, res) => {
  try {
    const {
      providerId,
      procedureType,
      procedureCode,
      procedureDescription,
      loanAmount,
      requestedTerm,
      monthlyIncome,
      employmentStatus,
      employmentDurationMonths
    } = req.body;

    // Validation
    if (!procedureType || !loanAmount || !requestedTerm) {
      return res.status(400).json({
        error: 'Required fields missing',
        required: ['procedureType', 'loanAmount', 'requestedTerm']
      });
    }

    if (loanAmount < 1000 || loanAmount > 500000) {
      return res.status(400).json({
        error: 'Loan amount must be between R1,000 and R500,000'
      });
    }

    if (requestedTerm < 3 || requestedTerm > 60) {
      return res.status(400).json({
        error: 'Loan term must be between 3 and 60 months'
      });
    }

    // Use the bridge service to submit to marketplace
    const bridge = new LoanApprovalBridge();
    const applicationId = await bridge.sendToMarketplace({
      userId: req.user.userId,
      providerId,
      procedureType,
      procedureCode,
      procedureDescription,
      loanAmount,
      requestedTerm,
      existingMonthlyIncome: monthlyIncome,
      existingEmploymentStatus: employmentStatus,
      existingEmploymentDurationMonths: employmentDurationMonths,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted to marketplace',
      applicationId,
      status: 'Finding you the best rates...'
    });

  } catch (error) {
    console.error('Marketplace application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

/**
 * Get user's marketplace applications
 *
 * GET /api/marketplace/applications
 */
router.get('/applications', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        la.*,
        p.provider_name,
        (
          SELECT COUNT(*)
          FROM lender_offers lo
          WHERE lo.application_id = la.application_id AND lo.status = 'PENDING'
        ) AS pending_offers,
        (
          SELECT MIN(lo.interest_rate)
          FROM lender_offers lo
          WHERE lo.application_id = la.application_id AND lo.status = 'PENDING'
        ) AS best_rate
      FROM loan_applications la
      LEFT JOIN providers p ON la.provider_id = p.provider_id
      WHERE la.user_id = $1
      ORDER BY la.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Applications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

/**
 * Get single application with offers
 *
 * GET /api/marketplace/applications/:id
 */
router.get('/applications/:id', authenticateToken, async (req, res) => {
  try {
    const appResult = await query(
      `SELECT la.*, p.provider_name
       FROM loan_applications la
       LEFT JOIN providers p ON la.provider_id = p.provider_id
       WHERE la.application_id = $1 AND la.user_id = $2`,
      [req.params.id, req.user.userId]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const application = appResult.rows[0];

    // Get offers for this application
    const offersResult = await query(
      `SELECT
        lo.*,
        l.name AS lender_name,
        l.code AS lender_code,
        l.type AS lender_type
      FROM lender_offers lo
      JOIN lenders l ON lo.lender_id = l.lender_id
      WHERE lo.application_id = $1
      ORDER BY lo.interest_rate ASC`,
      [req.params.id]
    );

    application.offers = offersResult.rows;

    res.json(application);
  } catch (error) {
    console.error('Application fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

/**
 * Get offers for an application
 *
 * GET /api/marketplace/applications/:id/offers
 */
router.get('/applications/:id/offers', authenticateToken, async (req, res) => {
  try {
    // Verify user owns this application
    const appCheck = await query(
      'SELECT application_id FROM loan_applications WHERE application_id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (appCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const offers = await marketplaceAuctionService.getApplicationOffers(req.params.id);

    res.json(offers);
  } catch (error) {
    console.error('Offers fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

/**
 * Accept an offer
 *
 * POST /api/marketplace/offers/:offerId/accept
 */
router.post('/offers/:offerId/accept', authenticateToken, async (req, res) => {
  try {
    const result = await marketplaceAuctionService.acceptOffer(
      req.params.offerId,
      req.user.userId
    );

    res.json({
      success: true,
      message: 'Offer accepted! Your loan is being processed.',
      ...result
    });
  } catch (error) {
    console.error('Accept offer error:', error);
    res.status(500).json({ error: error.message || 'Failed to accept offer' });
  }
});

/**
 * Get user's marketplace loans
 *
 * GET /api/marketplace/loans
 */
router.get('/loans', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        ml.*,
        l.name AS lender_name,
        p.provider_name,
        (
          SELECT COUNT(*)
          FROM loan_repayments lr
          WHERE lr.loan_id = ml.loan_id AND lr.status = 'COMPLETED'
        ) AS completed_payments
      FROM marketplace_loans ml
      JOIN lenders l ON ml.lender_id = l.lender_id
      LEFT JOIN providers p ON ml.provider_id = p.provider_id
      WHERE ml.user_id = $1
      ORDER BY ml.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Loans fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

/**
 * Get loan repayment schedule
 *
 * GET /api/marketplace/loans/:id/repayments
 */
router.get('/loans/:id/repayments', authenticateToken, async (req, res) => {
  try {
    // Verify user owns this loan
    const loanCheck = await query(
      'SELECT loan_id FROM marketplace_loans WHERE loan_id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (loanCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const result = await query(
      `SELECT * FROM loan_repayments
       WHERE loan_id = $1
       ORDER BY payment_number ASC`,
      [req.params.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Repayments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch repayments' });
  }
});

// ============================================
// WEBHOOK ENDPOINTS (For Lenders)
// ============================================

/**
 * Webhook endpoint for lender offer responses
 *
 * POST /api/marketplace/webhooks/offer-response
 *
 * Lenders call this to respond to loan packages
 */
router.post('/webhooks/offer-response', validateWebhookSignature, async (req, res) => {
  try {
    const {
      application_id,
      lender_code,
      decision,           // 'ACCEPT' or 'DECLINE'
      adjusted_rate,      // Optional: if lender wants different rate
      adjusted_term,      // Optional: if lender wants different term
      decline_reason,     // Optional: why they declined
      lender_notes,       // Optional: any notes
      conditions          // Optional: loan conditions
    } = req.body;

    if (!application_id || !lender_code || !decision) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['application_id', 'lender_code', 'decision']
      });
    }

    if (!['ACCEPT', 'DECLINE'].includes(decision)) {
      return res.status(400).json({
        error: 'Decision must be ACCEPT or DECLINE'
      });
    }

    await marketplaceAuctionService.receiveLenderOffer({
      applicationId: application_id,
      lenderCode: lender_code,
      accepted: decision === 'ACCEPT',
      adjustedRate: adjusted_rate,
      adjustedTerm: adjusted_term,
      reason: decline_reason,
      lenderNotes: lender_notes,
      conditions
    });

    res.json({
      success: true,
      message: decision === 'ACCEPT' ? 'Offer recorded' : 'Decline recorded'
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message || 'Failed to process webhook' });
  }
});

// ============================================
// ADMIN/LENDER DASHBOARD ENDPOINTS
// ============================================

/**
 * Get pending applications for lender dashboard
 *
 * GET /api/marketplace/admin/pending-applications
 */
router.get('/admin/pending-applications', authenticateAdmin, async (req, res) => {
  try {
    const applications = await marketplaceAuctionService.getPendingApplications();
    res.json(applications);
  } catch (error) {
    console.error('Pending applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

/**
 * Manual offer submission (for lenders without API)
 *
 * POST /api/marketplace/admin/manual-offers
 *
 * Admin dashboard uses this to manually enter lender responses
 */
router.post('/admin/manual-offers', authenticateAdmin, async (req, res) => {
  try {
    const {
      applicationId,
      lenderCode,
      accepted,
      adjustedRate,
      adjustedTerm,
      reason,
      lenderNotes,
      conditions
    } = req.body;

    if (!applicationId || !lenderCode || typeof accepted !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['applicationId', 'lenderCode', 'accepted']
      });
    }

    await marketplaceAuctionService.receiveLenderOffer({
      applicationId,
      lenderCode,
      accepted,
      adjustedRate,
      adjustedTerm,
      reason,
      lenderNotes,
      conditions
    });

    res.json({
      success: true,
      message: accepted ? 'Offer created' : 'Decline recorded'
    });

  } catch (error) {
    console.error('Manual offer error:', error);
    res.status(500).json({ error: error.message || 'Failed to create offer' });
  }
});

/**
 * Get all lenders
 *
 * GET /api/marketplace/admin/lenders
 */
router.get('/admin/lenders', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        lender_id,
        name,
        code,
        type,
        active,
        min_loan_amount,
        max_loan_amount,
        min_risk_score,
        max_risk_score,
        base_rate,
        min_term,
        max_term,
        contact_email,
        created_at
      FROM lenders
      ORDER BY name ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Lenders fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch lenders' });
  }
});

/**
 * Get lender performance statistics
 *
 * GET /api/marketplace/admin/lender-stats
 */
router.get('/admin/lender-stats', authenticateAdmin, async (req, res) => {
  try {
    const result = await query(`SELECT * FROM vw_lender_performance`);
    res.json(result.rows);
  } catch (error) {
    console.error('Lender stats error:', error);
    res.status(500).json({ error: 'Failed to fetch lender stats' });
  }
});

/**
 * Get marketplace overview statistics
 *
 * GET /api/marketplace/admin/stats
 */
router.get('/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        (SELECT COUNT(*) FROM loan_applications WHERE status = 'SUBMITTED') AS pending_applications,
        (SELECT COUNT(*) FROM loan_applications WHERE status = 'OFFERS_RECEIVED') AS awaiting_selection,
        (SELECT COUNT(*) FROM marketplace_loans WHERE status = 'ACTIVE') AS active_loans,
        (SELECT COALESCE(SUM(principal_amount), 0) FROM marketplace_loans WHERE status = 'ACTIVE') AS total_loaned,
        (SELECT COUNT(*) FROM lenders WHERE active = true) AS active_lenders,
        (SELECT COUNT(*) FROM lender_offers WHERE status = 'PENDING') AS pending_offers
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
