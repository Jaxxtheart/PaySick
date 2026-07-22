/**
 * HUMAN REVIEW SERVICE
 *
 * The human review interface is the MOST IMPORTANT screen in the system.
 *
 * Every decision, every override, every circuit breaker trigger must be logged:
 * - What happened
 * - When it happened
 * - What the AI recommended
 * - What the human decided
 * - Why (mandatory free text for overrides)
 * - Who (authenticated user)
 * - Outcome (what happened subsequently)
 *
 * This is not optional. It is a regulatory requirement under the NCA
 * and will be scrutinised by every auditor, CRO, and regulator who reviews PaySick.
 *
 * Retention: Minimum 7 years. Immutable — no deletions.
 */

const { query } = require('../config/database');

class HumanReviewService {
  /**
   * Get the human review queue — applications awaiting human decision.
   * Designed for 60-second decision-making on typical amber cases.
   */
  async getReviewQueue(filters = {}) {
    const { status = 'pending', limit = 50, offset = 0 } = filters;

    const result = await query(
      `SELECT
         lra.assessment_id,
         lra.application_id,
         lra.patient_id,
         lra.provider_id,
         lra.procedure_type,
         lra.quoted_amount,
         lra.loan_amount_requested,
         lra.loan_term_months,
         lra.monthly_income_verified,
         lra.monthly_obligations,
         lra.disposable_income,
         lra.repayment_to_income,
         lra.debt_to_income_pre,
         lra.debt_to_income_post,
         lra.proposed_monthly_repayment,
         lra.segment,
         lra.borrower_profile,
         lra.income_verification,
         lra.risk_tier,
         lra.ai_recommendation,
         lra.ai_confidence,
         lra.ai_rationale,
         lra.ai_flags,
         lra.ai_conditions,
         lra.alternative_offer,
         lra.traffic_light,
         lra.urgency_classification,
         lra.cooling_off_required,
         lra.created_at,
         -- Patient info
         u.full_name AS patient_name,
         u.email AS patient_email,
         u.cell_number AS patient_phone,
         u.sa_id_number,
         -- Provider info
         p.provider_name,
         p.trust_tier AS provider_trust_tier,
         p.risk_score AS provider_risk_score,
         p.default_rate AS provider_default_rate
       FROM loan_risk_assessments lra
       JOIN users u ON lra.patient_id = u.user_id
       LEFT JOIN providers p ON lra.provider_id = p.provider_id
       WHERE lra.human_decision IS NULL
         AND lra.ai_recommendation IN ('refer_to_human', 'approve_with_conditions')
       ORDER BY
         CASE lra.traffic_light
           WHEN 'red' THEN 1
           WHEN 'amber' THEN 2
           ELSE 3
         END,
         lra.created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Get queue count
    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM loan_risk_assessments
       WHERE human_decision IS NULL
         AND ai_recommendation IN ('refer_to_human', 'approve_with_conditions')`
    );

    return {
      items: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit,
      offset
    };
  }

  /**
   * Get detailed view of a single assessment for human review.
   * Includes all context needed for a confident decision.
   */
  async getReviewDetail(assessmentId) {
    // Get the assessment
    const assessmentResult = await query(
      `SELECT lra.*,
              u.full_name AS patient_name,
              u.email AS patient_email,
              u.cell_number AS patient_phone,
              u.sa_id_number,
              u.created_at AS patient_since,
              p.provider_name,
              p.trust_tier AS provider_trust_tier,
              p.risk_score AS provider_risk_score,
              p.default_rate AS provider_default_rate,
              p.avg_satisfaction_score AS provider_satisfaction,
              p.total_loans_referred AS provider_total_loans
       FROM loan_risk_assessments lra
       JOIN users u ON lra.patient_id = u.user_id
       LEFT JOIN providers p ON lra.provider_id = p.provider_id
       WHERE lra.assessment_id = $1`,
      [assessmentId]
    );

    if (assessmentResult.rows.length === 0) return null;

    const assessment = assessmentResult.rows[0];

    // Get similar historical loans (if data exists)
    let similarLoans = [];
    try {
      const similarResult = await query(
        `SELECT
           ai_recommendation,
           human_decision,
           risk_tier,
           borrower_profile,
           loan_amount_requested,
           repayment_to_income,
           traffic_light,
           created_at
         FROM loan_risk_assessments
         WHERE procedure_type = $1
           AND risk_tier = $2
           AND assessment_id != $3
           AND human_decision IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 5`,
        [assessment.procedure_type, assessment.risk_tier, assessmentId]
      );
      similarLoans = similarResult.rows;
    } catch (err) {
      // No similar loans available yet
    }

    // Get patient's loan history
    let patientHistory = [];
    try {
      const historyResult = await query(
        `SELECT
           a.application_id, a.bill_amount, a.status AS app_status,
           a.treatment_type, a.created_at,
           pp.status AS plan_status, pp.payments_made, pp.outstanding_balance
         FROM applications a
         LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
         WHERE a.user_id = $1
         ORDER BY a.created_at DESC
         LIMIT 10`,
        [assessment.patient_id]
      );
      patientHistory = historyResult.rows;
    } catch (err) {
      // No history
    }

    return {
      assessment,
      similar_loans: similarLoans,
      patient_history: patientHistory,
      review_guidance: this.generateReviewGuidance(assessment)
    };
  }

  /**
   * Generate plain-English review guidance for the human reviewer.
   */
  generateReviewGuidance(assessment) {
    const guidance = [];

    // Traffic light summary
    const flags = assessment.ai_flags || [];
    if (flags.includes('RTI_AMBER')) {
      guidance.push({
        area: 'Affordability',
        status: 'amber',
        message: `RTI is ${(assessment.repayment_to_income * 100).toFixed(1)}% — above comfort zone but within ceiling. Check income stability.`
      });
    }
    if (flags.includes('DTI_AMBER')) {
      guidance.push({
        area: 'Debt Load',
        status: 'amber',
        message: `Post-loan DTI is ${(assessment.debt_to_income_post * 100).toFixed(1)}%. Patient has significant existing obligations. Assess if they are stable.`
      });
    }
    if (assessment.borrower_profile === 'urgent_necessity') {
      guidance.push({
        area: 'Borrower Profile',
        status: 'amber',
        message: 'Urgent-necessity borrower. Higher risk profile. Tighter criteria recommended.'
      });
    }
    if (assessment.income_verification === 'manual_verified') {
      guidance.push({
        area: 'Verification',
        status: 'amber',
        message: 'Income verified manually only. Higher uncertainty. Consider requesting bank statements.'
      });
    }

    return guidance;
  }

  /**
   * Record a human decision on an assessment.
   * The MOST IMPORTANT operation in the system from a compliance perspective.
   */
  async recordDecision(assessmentId, decision, decidedBy, rationale, isOverride = null) {
    // Validate mandatory rationale for overrides
    if (isOverride && (!rationale || rationale.trim().length < 10)) {
      throw new Error('Override decisions require a detailed rationale (minimum 10 characters).');
    }

    // Get the assessment to determine if this is an override
    const assessmentResult = await query(
      `SELECT ai_recommendation, ai_confidence, ai_rationale
       FROM loan_risk_assessments WHERE assessment_id = $1`,
      [assessmentId]
    );

    if (assessmentResult.rows.length === 0) {
      throw new Error('Assessment not found.');
    }

    const assessment = assessmentResult.rows[0];

    // Determine if this is an override
    const aiRecommendation = assessment.ai_recommendation;
    const decisionMap = {
      'approved': ['approve', 'approve_with_conditions'],
      'declined': ['decline']
    };
    const isActualOverride = isOverride !== null
      ? isOverride
      : !((decisionMap[decision] || []).includes(aiRecommendation));

    // Require rationale for all overrides
    if (isActualOverride && (!rationale || rationale.trim().length < 10)) {
      throw new Error(
        `Decision "${decision}" overrides AI recommendation "${aiRecommendation}". ` +
        `Mandatory rationale required (minimum 10 characters).`
      );
    }

    // Update the assessment
    await query(
      `UPDATE loan_risk_assessments
       SET human_decision = $2,
           human_decision_by = $3,
           human_decision_at = NOW(),
           human_decision_reason = $4,
           updated_at = NOW()
       WHERE assessment_id = $1`,
      [assessmentId, decision, decidedBy, rationale]
    );

    // Log to immutable human review log (7-year retention, no deletions)
    await query(
      `INSERT INTO human_review_log
       (entity_type, entity_id,
        ai_recommendation, ai_confidence, ai_rationale,
        human_decision, decision_rationale, is_override,
        decided_by)
       VALUES ('loan_application', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        assessmentId,
        aiRecommendation,
        assessment.ai_confidence,
        assessment.ai_rationale,
        decision,
        rationale || '',
        isActualOverride,
        decidedBy
      ]
    );

    return {
      assessment_id: assessmentId,
      decision,
      is_override: isActualOverride,
      decided_by: decidedBy,
      rationale,
      ai_recommendation: aiRecommendation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Log a human decision on any entity (provider tier, circuit breaker, etc).
   */
  async logDecision(entityType, entityId, aiRecommendation, aiConfidence, humanDecision, rationale, decidedBy) {
    const result = await query(
      `INSERT INTO human_review_log
       (entity_type, entity_id,
        ai_recommendation, ai_confidence,
        human_decision, decision_rationale, is_override,
        decided_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING review_id`,
      [
        entityType, entityId,
        aiRecommendation, aiConfidence,
        humanDecision, rationale,
        humanDecision !== aiRecommendation,
        decidedBy
      ]
    );
    return result.rows[0];
  }

  /**
   * Get audit trail for a specific entity.
   */
  async getAuditTrail(entityType, entityId) {
    const result = await query(
      `SELECT hrl.*,
              u.full_name AS decided_by_name
       FROM human_review_log hrl
       LEFT JOIN users u ON hrl.decided_by = u.user_id
       WHERE hrl.entity_type = $1 AND hrl.entity_id = $2
       ORDER BY hrl.created_at DESC`,
      [entityType, entityId]
    );
    return result.rows;
  }

  /**
   * Get override history (for compliance reporting).
   */
  async getOverrideHistory(filters = {}) {
    const { limit = 100, offset = 0 } = filters;

    const result = await query(
      `SELECT hrl.*,
              u.full_name AS decided_by_name
       FROM human_review_log hrl
       LEFT JOIN users u ON hrl.decided_by = u.user_id
       WHERE hrl.is_override = true
       ORDER BY hrl.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM human_review_log WHERE is_override = true`
    );

    return {
      overrides: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit,
      offset
    };
  }

  /**
   * Get decision statistics for dashboard.
   */
  async getDecisionStats(periodDays = 30) {
    const result = await query(
      `SELECT
         COUNT(*) AS total_decisions,
         COUNT(*) FILTER (WHERE human_decision = 'approved') AS approved,
         COUNT(*) FILTER (WHERE human_decision = 'declined') AS declined,
         COUNT(*) FILTER (WHERE human_decision = 'modified') AS modified,
         COUNT(*) FILTER (WHERE is_override = true) AS overrides,
         AVG(ai_confidence) FILTER (WHERE is_override = false) AS avg_confidence_aligned,
         AVG(ai_confidence) FILTER (WHERE is_override = true) AS avg_confidence_overridden
       FROM human_review_log
       WHERE created_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL`,
      [periodDays]
    );
    return result.rows[0] || {};
  }
}

const humanReviewService = new HumanReviewService();

module.exports = { HumanReviewService, humanReviewService };
