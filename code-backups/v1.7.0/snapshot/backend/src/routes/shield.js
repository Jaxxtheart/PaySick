/**
 * PAYSICK SHIELD UNDERWRITING FRAMEWORK — API ROUTES
 *
 * All endpoints are versioned under /v2/shield/
 * These are NEW endpoints that do not modify existing routes.
 *
 * Endpoints:
 *   POST   /v2/shield/provider-gate/assess
 *   GET    /v2/shield/provider-gate/tier-check/:providerId
 *   POST   /v2/shield/provider-gate/tier-upgrade
 *   POST   /v2/shield/provider-gate/cost-benchmark
 *
 *   POST   /v2/shield/patient-gate/assess
 *
 *   POST   /v2/shield/lender-gate/match
 *   GET    /v2/shield/lender-gate/allocation
 *
 *   POST   /v2/shield/outcome/survey
 *   GET    /v2/shield/outcome/surveys/pending
 *   GET    /v2/shield/outcome/arrears
 *   POST   /v2/shield/outcome/restructure/:loanId
 *
 *   GET    /v2/shield/circuit-breakers/status
 *   POST   /v2/shield/circuit-breakers/evaluate
 *   POST   /v2/shield/circuit-breakers/override
 *   POST   /v2/shield/circuit-breakers/resolve
 *
 *   GET    /v2/shield/dashboard/portfolio
 *   GET    /v2/shield/dashboard/providers
 *
 *   POST   /v2/shield/health-line/activate
 *   POST   /v2/shield/health-line/draw
 *   GET    /v2/shield/health-line/account/:patientId
 *   GET    /v2/shield/health-line/eligibility/:patientId
 *
 *   GET    /v2/shield/human-review/queue
 *   GET    /v2/shield/human-review/detail/:assessmentId
 *   POST   /v2/shield/human-review/decide
 *   GET    /v2/shield/human-review/audit/:entityType/:entityId
 *   GET    /v2/shield/human-review/overrides
 *   GET    /v2/shield/human-review/stats
 */

const express = require('express');
const router = express.Router();

const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');
const { providerGateService } = require('../services/provider-gate.service');
const { patientGateService } = require('../services/patient-gate.service');
const { lenderGateService } = require('../services/lender-gate.service');
const { outcomeGateService } = require('../services/outcome-gate.service');
const { circuitBreakerService } = require('../services/circuit-breaker.service');
const { healthLineService } = require('../services/health-line.service');
const { humanReviewService } = require('../services/human-review.service');

// ═══════════════════════════════════════════════════════════════
// INPUT VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isPositiveNumber(value) {
  return typeof value === 'number' && isFinite(value) && value > 0;
}

function validateUUIDParam(req, res, paramName) {
  const value = req.params[paramName] || req.body[paramName];
  if (!isValidUUID(value)) {
    res.status(400).json({ error: `Invalid ${paramName} format` });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// GATE 1: PROVIDER GATE
// ═══════════════════════════════════════════════════════════════

/**
 * POST /v2/shield/provider-gate/assess
 * Run a provider through Gate 1
 */
router.post('/provider-gate/assess', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { provider_id } = req.body;
    if (!provider_id) {
      return res.status(400).json({ error: 'provider_id is required' });
    }
    if (!isValidUUID(provider_id)) {
      return res.status(400).json({ error: 'Invalid provider_id format' });
    }
    const result = await providerGateService.assessProvider(provider_id);
    res.json(result);
  } catch (error) {
    console.error('Provider gate assess error:', error);
    res.status(500).json({ error: 'Provider gate assessment failed' });
  }
});

/**
 * GET /v2/shield/provider-gate/tier-check/:providerId
 * Check if provider is eligible for tier upgrade
 */
router.get('/provider-gate/tier-check/:providerId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!validateUUIDParam(req, res, 'providerId')) return;
    const result = await providerGateService.checkTierUpgradeEligibility(req.params.providerId);
    if (!result) return res.status(404).json({ error: 'Provider not found' });
    res.json(result);
  } catch (error) {
    console.error('Tier check error:', error);
    res.status(500).json({ error: 'Tier check failed' });
  }
});

/**
 * POST /v2/shield/provider-gate/tier-upgrade
 * Upgrade a provider's trust tier (requires admin)
 */
router.post('/provider-gate/tier-upgrade', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { provider_id, new_tier, reason } = req.body;
    if (!provider_id || !new_tier || !reason) {
      return res.status(400).json({ error: 'provider_id, new_tier, and reason are required' });
    }
    if (!isValidUUID(provider_id)) {
      return res.status(400).json({ error: 'Invalid provider_id format' });
    }
    const validTiers = ['probation', 'standard', 'trusted', 'preferred'];
    if (!validTiers.includes(new_tier)) {
      return res.status(400).json({ error: `new_tier must be one of: ${validTiers.join(', ')}` });
    }
    if (typeof reason !== 'string' || reason.length < 3 || reason.length > 500) {
      return res.status(400).json({ error: 'reason must be between 3 and 500 characters' });
    }
    const result = await providerGateService.upgradeProviderTier(
      provider_id, new_tier, req.user.userId, reason
    );

    // Log the human decision
    await humanReviewService.logDecision(
      'provider_tier', provider_id,
      'upgrade_recommended', null,
      'approved', reason, req.user.userId
    );

    res.json(result);
  } catch (error) {
    console.error('Tier upgrade error:', error);
    res.status(500).json({ error: error.message || 'Tier upgrade failed' });
  }
});

/**
 * POST /v2/shield/provider-gate/cost-benchmark
 * Check a quoted cost against procedure benchmarks
 */
router.post('/provider-gate/cost-benchmark', authenticateToken, async (req, res) => {
  try {
    const { procedure_type, procedure_subtype, region, quoted_cost } = req.body;
    if (!procedure_type || !procedure_subtype || !region || !quoted_cost) {
      return res.status(400).json({ error: 'procedure_type, procedure_subtype, region, and quoted_cost are required' });
    }
    const result = await providerGateService.checkCostBenchmark(
      procedure_type, procedure_subtype, region, parseFloat(quoted_cost)
    );
    res.json(result);
  } catch (error) {
    console.error('Cost benchmark error:', error);
    res.status(500).json({ error: 'Cost benchmark check failed' });
  }
});

/**
 * GET /v2/shield/provider-gate/providers
 * Get providers filtered by traffic light status
 */
router.get('/provider-gate/providers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { traffic_light } = req.query;
    const result = await providerGateService.getProvidersByStatus(traffic_light || null);
    res.json({ providers: result });
  } catch (error) {
    console.error('Provider list error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

/**
 * GET /v2/shield/provider-gate/score-history/:providerId
 * Get provider risk score history
 */
router.get('/provider-gate/score-history/:providerId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!validateUUIDParam(req, res, 'providerId')) return;
    const months = Math.min(Math.max(parseInt(req.query.months) || 12, 1), 60);
    const result = await providerGateService.getProviderScoreHistory(req.params.providerId, months);
    res.json({ scores: result });
  } catch (error) {
    console.error('Score history error:', error);
    res.status(500).json({ error: 'Failed to fetch score history' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GATE 2: PATIENT GATE
// ═══════════════════════════════════════════════════════════════

/**
 * POST /v2/shield/patient-gate/assess
 * Run a loan application through Gate 2
 */
router.post('/patient-gate/assess', authenticateToken, async (req, res) => {
  try {
    const application = req.body;

    // Validate required fields
    const required = ['patient_id', 'loan_amount_requested', 'loan_term_months', 'monthly_income_verified'];
    const missing = required.filter(f => application[f] === undefined || application[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    // Type and range validation
    if (!isValidUUID(application.patient_id)) {
      return res.status(400).json({ error: 'Invalid patient_id format' });
    }
    const loanAmount = parseFloat(application.loan_amount_requested);
    if (!isFinite(loanAmount) || loanAmount < 500 || loanAmount > 500000) {
      return res.status(400).json({ error: 'loan_amount_requested must be between 500 and 500000' });
    }
    const termMonths = parseInt(application.loan_term_months);
    if (!isFinite(termMonths) || termMonths < 3 || termMonths > 60) {
      return res.status(400).json({ error: 'loan_term_months must be between 3 and 60' });
    }
    const income = parseFloat(application.monthly_income_verified);
    if (!isFinite(income) || income <= 0) {
      return res.status(400).json({ error: 'monthly_income_verified must be a positive number' });
    }

    // Run Gate 1 first if provider_id is present
    let gate1Result = null;
    if (application.provider_id) {
      if (!isValidUUID(application.provider_id)) {
        return res.status(400).json({ error: 'Invalid provider_id format' });
      }
      gate1Result = await providerGateService.assessProvider(application.provider_id);
      if (!gate1Result.passed) {
        return res.json({
          gate: 'PROVIDER_GATE',
          passed: false,
          message: 'Application blocked at Provider Gate (Gate 1).',
          gate_1_result: gate1Result
        });
      }
    }

    // Run Gate 2
    const result = await patientGateService.assessApplication(application);

    // Attach Gate 1 result
    if (gate1Result) {
      result.gate_1_result = gate1Result;
    }

    res.json(result);
  } catch (error) {
    console.error('Patient gate assess error:', error);
    res.status(500).json({ error: 'Patient gate assessment failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GATE 3: LENDER GATE
// ═══════════════════════════════════════════════════════════════

/**
 * POST /v2/shield/lender-gate/match
 * Match an approved loan to lender(s)
 */
router.post('/lender-gate/match', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { assessment_id } = req.body;
    if (!assessment_id) {
      return res.status(400).json({ error: 'assessment_id is required' });
    }
    if (!isValidUUID(assessment_id)) {
      return res.status(400).json({ error: 'Invalid assessment_id format' });
    }
    const result = await lenderGateService.matchLoan(assessment_id);
    res.json(result);
  } catch (error) {
    console.error('Lender gate match error:', error);
    res.status(500).json({ error: 'Lender matching failed' });
  }
});

/**
 * GET /v2/shield/lender-gate/allocation
 * Get portfolio allocation metrics
 */
router.get('/lender-gate/allocation', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await lenderGateService.getPortfolioAllocation();
    res.json(result);
  } catch (error) {
    console.error('Allocation error:', error);
    res.status(500).json({ error: 'Failed to fetch allocation data' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GATE 4: OUTCOME GATE
// ═══════════════════════════════════════════════════════════════

/**
 * POST /v2/shield/outcome/survey
 * Submit a patient survey response
 */
router.post('/outcome/survey', authenticateToken, async (req, res) => {
  try {
    const { survey_id, ...response } = req.body;
    if (!survey_id) {
      return res.status(400).json({ error: 'survey_id is required' });
    }
    const result = await outcomeGateService.submitSurveyResponse(survey_id, response);
    if (!result) return res.status(404).json({ error: 'Survey not found' });
    res.json(result);
  } catch (error) {
    console.error('Survey submission error:', error);
    res.status(500).json({ error: 'Survey submission failed' });
  }
});

/**
 * GET /v2/shield/outcome/surveys/pending
 * Get pending surveys ready to send
 */
router.get('/outcome/surveys/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await outcomeGateService.getPendingSurveys();
    res.json({ surveys: result });
  } catch (error) {
    console.error('Pending surveys error:', error);
    res.status(500).json({ error: 'Failed to fetch pending surveys' });
  }
});

/**
 * GET /v2/shield/outcome/arrears
 * Get loans currently in arrears
 */
router.get('/outcome/arrears', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const loans = await outcomeGateService.getLoansInArrears();
    // Assess each loan's arrears stage
    const assessed = await Promise.all(
      loans.map(async (loan) => ({
        ...loan,
        arrears_assessment: await outcomeGateService.assessArrears(
          loan.payment_id, parseInt(loan.days_overdue)
        )
      }))
    );
    res.json({ arrears: assessed });
  } catch (error) {
    console.error('Arrears error:', error);
    res.status(500).json({ error: 'Failed to fetch arrears data' });
  }
});

/**
 * POST /v2/shield/outcome/restructure/:loanId
 * Get restructuring options for a loan
 */
router.post('/outcome/restructure/:loanId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await outcomeGateService.proposeRestructuring(req.params.loanId);
    res.json(result);
  } catch (error) {
    console.error('Restructuring error:', error);
    res.status(500).json({ error: 'Restructuring proposal failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// GATE 5: CIRCUIT BREAKERS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /v2/shield/circuit-breakers/status
 * Get current status of all circuit breakers
 */
router.get('/circuit-breakers/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await circuitBreakerService.getDashboardData();
    res.json(result);
  } catch (error) {
    console.error('Circuit breaker status error:', error);
    res.status(500).json({ error: 'Failed to fetch circuit breaker status' });
  }
});

/**
 * POST /v2/shield/circuit-breakers/evaluate
 * Trigger evaluation of all circuit breakers
 */
router.post('/circuit-breakers/evaluate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await circuitBreakerService.evaluateAll();
    res.json(result);
  } catch (error) {
    console.error('Circuit breaker evaluate error:', error);
    res.status(500).json({ error: 'Circuit breaker evaluation failed' });
  }
});

/**
 * POST /v2/shield/circuit-breakers/override
 * Override a circuit breaker (requires admin + documented reason)
 */
router.post('/circuit-breakers/override', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { event_id, reason, expires_at } = req.body;
    if (!event_id || !reason) {
      return res.status(400).json({ error: 'event_id and reason are required' });
    }
    const result = await circuitBreakerService.overrideBreaker(
      event_id, req.user.userId, reason,
      expires_at ? new Date(expires_at) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // default 7 days
    );

    // Log override
    await humanReviewService.logDecision(
      'circuit_breaker', event_id,
      'triggered', null,
      'overridden', reason, req.user.userId
    );

    res.json(result);
  } catch (error) {
    console.error('Circuit breaker override error:', error);
    res.status(500).json({ error: error.message || 'Override failed' });
  }
});

/**
 * POST /v2/shield/circuit-breakers/resolve
 * Resolve a circuit breaker event
 */
router.post('/circuit-breakers/resolve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { event_id, notes } = req.body;
    if (!event_id || !notes) {
      return res.status(400).json({ error: 'event_id and notes are required' });
    }
    const result = await circuitBreakerService.resolveEvent(event_id, req.user.userId, notes);
    if (!result) return res.status(404).json({ error: 'Event not found' });
    res.json(result);
  } catch (error) {
    console.error('Circuit breaker resolve error:', error);
    res.status(500).json({ error: 'Resolution failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

/**
 * GET /v2/shield/dashboard/portfolio
 * Portfolio health metrics for dashboard
 */
router.get('/dashboard/portfolio', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [breakerData, allocation] = await Promise.all([
      circuitBreakerService.getDashboardData(),
      lenderGateService.getPortfolioAllocation()
    ]);

    // Patient segmentation
    const { query: dbQuery } = require('../config/database');
    let segmentation = {};
    try {
      const segResult = await dbQuery(
        `SELECT
           borrower_profile,
           COUNT(*) AS count,
           AVG(repayment_to_income) AS avg_rti,
           AVG(debt_to_income_post) AS avg_dti
         FROM loan_risk_assessments
         WHERE borrower_profile IS NOT NULL
         GROUP BY borrower_profile`
      );
      segmentation = segResult.rows;
    } catch (err) {
      segmentation = [];
    }

    // Income verification distribution
    let verificationDist = [];
    try {
      const verResult = await dbQuery(
        `SELECT income_verification, COUNT(*) AS count
         FROM loan_risk_assessments
         GROUP BY income_verification`
      );
      verificationDist = verResult.rows;
    } catch (err) {
      // ignore
    }

    res.json({
      portfolio_health: breakerData.metrics,
      circuit_breakers: breakerData.summary,
      balance_sheet: allocation.balance_sheet,
      lender_concentration: allocation.lender_concentration,
      patient_segmentation: segmentation,
      income_verification_distribution: verificationDist
    });
  } catch (error) {
    console.error('Portfolio dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio dashboard' });
  }
});

/**
 * GET /v2/shield/dashboard/providers
 * Provider health metrics for dashboard
 */
router.get('/dashboard/providers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { query: dbQuery } = require('../config/database');

    // Provider risk score distribution
    let scoreDistribution = [];
    try {
      const distResult = await dbQuery(
        `SELECT
           CASE
             WHEN composite_score >= 80 THEN 'excellent'
             WHEN composite_score >= 70 THEN 'good'
             WHEN composite_score >= 45 THEN 'fair'
             ELSE 'poor'
           END AS score_band,
           COUNT(*) AS count,
           AVG(composite_score) AS avg_score
         FROM provider_risk_scores
         WHERE period_end = (SELECT MAX(period_end) FROM provider_risk_scores)
         GROUP BY score_band`
      );
      scoreDistribution = distResult.rows;
    } catch (err) {
      // No score data yet
    }

    // Top providers by volume
    let topProviders = [];
    try {
      const topResult = await dbQuery(
        `SELECT provider_id, provider_name, trust_tier, risk_score,
                default_rate, total_loans_referred, concentration_pct,
                avg_satisfaction_score
         FROM providers
         WHERE status = 'active'
         ORDER BY total_loans_referred DESC NULLS LAST
         LIMIT 10`
      );
      topProviders = topResult.rows;
    } catch (err) {
      // ignore
    }

    // Providers in amber/red
    let flaggedProviders = [];
    try {
      const flagResult = await dbQuery(
        `SELECT p.provider_id, p.provider_name, p.trust_tier,
                p.default_rate, p.status, p.shield_flags,
                prs.traffic_light, prs.composite_score
         FROM providers p
         LEFT JOIN provider_risk_scores prs ON p.provider_id = prs.provider_id
           AND prs.period_end = (SELECT MAX(period_end) FROM provider_risk_scores WHERE provider_id = p.provider_id)
         WHERE p.status IN ('active', 'suspended')
           AND (prs.traffic_light IN ('amber', 'red') OR p.status = 'suspended')
         ORDER BY prs.composite_score ASC NULLS FIRST`
      );
      flaggedProviders = flagResult.rows;
    } catch (err) {
      // ignore
    }

    res.json({
      score_distribution: scoreDistribution,
      top_providers: topProviders,
      flagged_providers: flaggedProviders
    });
  } catch (error) {
    console.error('Provider dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch provider dashboard' });
  }
});

// ═══════════════════════════════════════════════════════════════
// HEALTH LINE
// ═══════════════════════════════════════════════════════════════

/**
 * GET /v2/shield/health-line/eligibility/:patientId
 * Check Health Line eligibility
 */
router.get('/health-line/eligibility/:patientId', authenticateToken, async (req, res) => {
  try {
    if (!validateUUIDParam(req, res, 'patientId')) return;
    const result = await healthLineService.checkEligibility(req.params.patientId);
    res.json(result);
  } catch (error) {
    console.error('Health Line eligibility error:', error);
    res.status(500).json({ error: 'Eligibility check failed' });
  }
});

/**
 * POST /v2/shield/health-line/activate
 * Activate Health Line for a patient (requires admin)
 */
router.post('/health-line/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { patient_id, original_loan_amount } = req.body;
    if (!patient_id || !original_loan_amount) {
      return res.status(400).json({ error: 'patient_id and original_loan_amount are required' });
    }
    if (!isValidUUID(patient_id)) {
      return res.status(400).json({ error: 'Invalid patient_id format' });
    }
    const loanAmount = parseFloat(original_loan_amount);
    if (!isFinite(loanAmount) || loanAmount <= 0) {
      return res.status(400).json({ error: 'original_loan_amount must be a positive number' });
    }
    const result = await healthLineService.activate(
      patient_id, req.user.userId, loanAmount
    );

    if (result.success) {
      await humanReviewService.logDecision(
        'health_line', patient_id,
        'eligible', null,
        'activated', `Health Line activated. Limit: R${result.account.credit_limit}`,
        req.user.userId
      );
    }

    res.json(result);
  } catch (error) {
    console.error('Health Line activation error:', error);
    res.status(500).json({ error: 'Activation failed' });
  }
});

/**
 * POST /v2/shield/health-line/draw
 * Process a Health Line draw-down
 */
router.post('/health-line/draw', authenticateToken, async (req, res) => {
  try {
    const { account_id, ...drawRequest } = req.body;
    if (!account_id || !drawRequest.draw_amount) {
      return res.status(400).json({ error: 'account_id and draw_amount are required' });
    }
    if (!isValidUUID(account_id)) {
      return res.status(400).json({ error: 'Invalid account_id format' });
    }
    const drawAmount = parseFloat(drawRequest.draw_amount);
    if (!isFinite(drawAmount) || drawAmount <= 0) {
      return res.status(400).json({ error: 'draw_amount must be a positive number' });
    }
    const result = await healthLineService.drawDown(account_id, drawRequest);
    res.json(result);
  } catch (error) {
    console.error('Health Line draw error:', error);
    res.status(500).json({ error: 'Draw-down failed' });
  }
});

/**
 * GET /v2/shield/health-line/account/:patientId
 * Get patient's Health Line account
 */
router.get('/health-line/account/:patientId', authenticateToken, async (req, res) => {
  try {
    if (!validateUUIDParam(req, res, 'patientId')) return;
    const account = await healthLineService.getAccount(req.params.patientId);
    if (!account) return res.status(404).json({ error: 'No Health Line account found' });

    const draws = await healthLineService.getDrawHistory(account.account_id);
    res.json({ account, draws });
  } catch (error) {
    console.error('Health Line account error:', error);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// ═══════════════════════════════════════════════════════════════
// HUMAN REVIEW
// ═══════════════════════════════════════════════════════════════

/**
 * GET /v2/shield/human-review/queue
 * Get the human review queue
 */
router.get('/human-review/queue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const result = await humanReviewService.getReviewQueue({ limit, offset });
    res.json(result);
  } catch (error) {
    console.error('Review queue error:', error);
    res.status(500).json({ error: 'Failed to fetch review queue' });
  }
});

/**
 * GET /v2/shield/human-review/detail/:assessmentId
 * Get detailed review context for a single assessment
 */
router.get('/human-review/detail/:assessmentId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (!validateUUIDParam(req, res, 'assessmentId')) return;
    const result = await humanReviewService.getReviewDetail(req.params.assessmentId);
    if (!result) return res.status(404).json({ error: 'Assessment not found' });
    res.json(result);
  } catch (error) {
    console.error('Review detail error:', error);
    res.status(500).json({ error: 'Failed to fetch review detail' });
  }
});

/**
 * POST /v2/shield/human-review/decide
 * Record a human decision on an assessment
 */
router.post('/human-review/decide', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { assessment_id, decision, rationale } = req.body;
    if (!assessment_id || !decision) {
      return res.status(400).json({ error: 'assessment_id and decision are required' });
    }
    if (!isValidUUID(assessment_id)) {
      return res.status(400).json({ error: 'Invalid assessment_id format' });
    }
    const validDecisions = ['approved', 'declined', 'escalated', 'deferred'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({ error: `decision must be one of: ${validDecisions.join(', ')}` });
    }
    const result = await humanReviewService.recordDecision(
      assessment_id, decision, req.user.userId, rationale || ''
    );
    res.json(result);
  } catch (error) {
    console.error('Decision record error:', error);
    res.status(500).json({ error: error.message || 'Failed to record decision' });
  }
});

/**
 * GET /v2/shield/human-review/audit/:entityType/:entityId
 * Get audit trail for a specific entity
 */
router.get('/human-review/audit/:entityType/:entityId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await humanReviewService.getAuditTrail(
      req.params.entityType, req.params.entityId
    );
    res.json({ audit_trail: result });
  } catch (error) {
    console.error('Audit trail error:', error);
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

/**
 * GET /v2/shield/human-review/overrides
 * Get override history (compliance reporting)
 */
router.get('/human-review/overrides', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const result = await humanReviewService.getOverrideHistory({ limit, offset });
    res.json(result);
  } catch (error) {
    console.error('Override history error:', error);
    res.status(500).json({ error: 'Failed to fetch override history' });
  }
});

/**
 * GET /v2/shield/human-review/stats
 * Get decision statistics for dashboard
 */
router.get('/human-review/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const result = await humanReviewService.getDecisionStats(days);
    res.json(result);
  } catch (error) {
    console.error('Decision stats error:', error);
    res.status(500).json({ error: 'Failed to fetch decision stats' });
  }
});

module.exports = router;
