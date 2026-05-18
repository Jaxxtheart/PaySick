/**
 * OUTCOME GATE SERVICE (Gate 4)
 *
 * Purpose: Monitor patient satisfaction and repayment post-disbursement.
 * Feed data back into provider and patient scoring.
 *
 * Automated touchpoints:
 * - Day 3: "How was your procedure?" (1-5 star + comment)
 * - Day 30: Patient satisfaction survey
 * - Day 90: Follow-up survey
 * - Monthly: Repayment monitoring
 *
 * Restructuring protocol for medical patients:
 * Medical patients are NOT the same as retail defaulters.
 * The goal is RECOVERY, not punishment.
 */

const { query, transaction } = require('../config/database');

// Restructuring hard rule: no restructuring increases total cost by > 25%
const MAX_RESTRUCTURE_COST_INCREASE = 0.25;

// Arrears escalation timeline
const ARREARS_STAGES = {
  first_missed: {
    days: 1,
    action: 'auto_sms_reminder',
    escalate: false,
    description: 'Gentle SMS reminder. DO NOT escalate for 7 days.'
  },
  seven_days: {
    days: 7,
    action: 'flag_for_monitoring',
    escalate: false,
    description: 'Flag loan for monitoring. Continue gentle outreach.'
  },
  thirty_days: {
    days: 30,
    action: 'proactive_outreach',
    escalate: true,
    description: 'Proactive outreach: restructure offer. Flag provider if pattern detected.'
  },
  sixty_days: {
    days: 60,
    action: 'formal_collections',
    escalate: true,
    description: 'Formal collections process. Provider notified. Human decision required.'
  },
  ninety_days: {
    days: 90,
    action: 'non_performing',
    escalate: true,
    description: 'Loan classified as non-performing. Provider risk score impacted. Circuit breaker feed.'
  }
};

class OutcomeGateService {
  /**
   * Schedule surveys for a newly disbursed loan.
   */
  async scheduleSurveys(loanId, patientId, providerId) {
    const surveys = [
      { type: 'day_3', daysAfter: 3 },
      { type: 'day_30', daysAfter: 30 },
      { type: 'day_90', daysAfter: 90 }
    ];

    const results = [];

    for (const survey of surveys) {
      const sendAt = new Date();
      sendAt.setDate(sendAt.getDate() + survey.daysAfter);

      const result = await query(
        `INSERT INTO outcome_surveys
         (loan_id, patient_id, provider_id, survey_type, sent_via, sent_at, status)
         VALUES ($1, $2, $3, $4, 'sms', $5, 'pending')
         RETURNING survey_id`,
        [loanId, patientId, providerId, survey.type, sendAt]
      );

      results.push({
        survey_id: result.rows[0].survey_id,
        type: survey.type,
        scheduled_for: sendAt
      });
    }

    return results;
  }

  /**
   * Submit a patient survey response.
   */
  async submitSurveyResponse(surveyId, response) {
    const result = await query(
      `UPDATE outcome_surveys SET
        overall_rating = $2,
        outcome_satisfaction = $3,
        would_recommend = $4,
        complications_reported = $5,
        complication_details = $6,
        financial_comfort = $7,
        free_text_comment = $8,
        responded_at = NOW(),
        status = 'completed'
       WHERE survey_id = $1
       RETURNING *`,
      [
        surveyId,
        response.overall_rating,
        response.outcome_satisfaction,
        response.would_recommend,
        response.complications_reported || false,
        response.complication_details || null,
        response.financial_comfort || null,
        response.free_text_comment || null
      ]
    );

    if (result.rows.length === 0) return null;

    const survey = result.rows[0];

    // Update provider satisfaction score aggregate
    if (survey.provider_id) {
      await this.updateProviderSatisfaction(survey.provider_id);
    }

    // Flag if complications reported
    if (response.complications_reported) {
      await this.flagComplication(survey);
    }

    return survey;
  }

  /**
   * Update provider's average satisfaction score from survey data.
   */
  async updateProviderSatisfaction(providerId) {
    try {
      const result = await query(
        `SELECT AVG(overall_rating) AS avg_rating,
                COUNT(*) AS survey_count
         FROM outcome_surveys
         WHERE provider_id = $1 AND status = 'completed' AND overall_rating IS NOT NULL`,
        [providerId]
      );

      if (result.rows[0] && result.rows[0].avg_rating) {
        await query(
          `UPDATE providers SET avg_satisfaction_score = $2, updated_at = NOW()
           WHERE provider_id = $1`,
          [providerId, parseFloat(result.rows[0].avg_rating)]
        );
      }
    } catch (err) {
      console.error('Failed to update provider satisfaction:', err.message);
    }
  }

  /**
   * Flag a complication for review.
   */
  async flagComplication(survey) {
    // Add to provider flags
    try {
      await query(
        `UPDATE providers
         SET shield_flags = COALESCE(shield_flags, '[]'::jsonb) || $2::jsonb, updated_at = NOW()
         WHERE provider_id = $1`,
        [
          survey.provider_id,
          JSON.stringify([{
            type: 'COMPLICATION_REPORTED',
            survey_id: survey.survey_id,
            patient_id: survey.patient_id,
            details: survey.complication_details,
            timestamp: new Date().toISOString()
          }])
        ]
      );
    } catch (err) {
      console.error('Failed to flag complication:', err.message);
    }
  }

  /**
   * Assess arrears status for a loan and determine appropriate action.
   */
  async assessArrears(loanId, daysOverdue) {
    let stage = null;

    if (daysOverdue >= 90) stage = ARREARS_STAGES.ninety_days;
    else if (daysOverdue >= 60) stage = ARREARS_STAGES.sixty_days;
    else if (daysOverdue >= 30) stage = ARREARS_STAGES.thirty_days;
    else if (daysOverdue >= 7) stage = ARREARS_STAGES.seven_days;
    else if (daysOverdue >= 1) stage = ARREARS_STAGES.first_missed;

    if (!stage) return { action: 'none', description: 'Loan is current.' };

    return {
      loan_id: loanId,
      days_overdue: daysOverdue,
      action: stage.action,
      escalate: stage.escalate,
      description: stage.description,
      requires_human: stage.escalate
    };
  }

  /**
   * Propose restructuring options for a loan in arrears.
   * Medical patients need options, not punishment.
   */
  async proposeRestructuring(loanId) {
    // Get loan details
    let loan;
    try {
      const loanResult = await query(
        `SELECT lra.*, ml.loan_amount, ml.interest_rate, ml.term_months
         FROM loan_risk_assessments lra
         LEFT JOIN marketplace_loans ml ON ml.application_id = lra.application_id
         WHERE lra.assessment_id = $1 OR lra.application_id = $1
         LIMIT 1`,
        [loanId]
      );
      loan = loanResult.rows[0];
    } catch (err) {
      console.warn('Loan lookup for restructuring failed:', err.message);
      return { options: [], rationale: 'Unable to load loan details.' };
    }

    if (!loan) return { options: [], rationale: 'Loan not found.' };

    const outstandingBalance = parseFloat(loan.loan_amount_requested || loan.loan_amount || 0);
    const currentRate = parseFloat(loan.interest_rate) || 0.1125;
    const currentTerm = parseInt(loan.loan_term_months || loan.term_months || 6);

    const options = [];

    // Option 1: Term extension (stretch over longer period)
    const extendedTerm = Math.min(currentTerm * 2, 24); // max 24 months
    const extendedMonthlyRate = currentRate / 12;
    const extendedPayment = outstandingBalance *
      (extendedMonthlyRate * Math.pow(1 + extendedMonthlyRate, extendedTerm)) /
      (Math.pow(1 + extendedMonthlyRate, extendedTerm) - 1);

    const originalTotalCost = outstandingBalance * (1 + currentRate * (currentTerm / 12));
    const extendedTotalCost = extendedPayment * extendedTerm;
    const costIncreasePct = (extendedTotalCost - originalTotalCost) / originalTotalCost;

    if (costIncreasePct <= MAX_RESTRUCTURE_COST_INCREASE) {
      options.push({
        type: 'term_extension',
        description: `Extend remaining balance over ${extendedTerm} months. Reduces monthly payment.`,
        new_term_months: extendedTerm,
        new_monthly_payment: Math.ceil(extendedPayment),
        total_cost_increase_pct: costIncreasePct,
        within_hard_rule: true
      });
    }

    // Option 2: Payment holiday (defer 1-2 months)
    options.push({
      type: 'payment_holiday',
      description: 'Defer 1-2 months of payments. Interest capitalised. Resume after holiday.',
      holiday_months: 2,
      interest_capitalised: true,
      total_cost_increase_pct: (2 * (currentRate / 12)),
      within_hard_rule: (2 * (currentRate / 12)) <= MAX_RESTRUCTURE_COST_INCREASE
    });

    // Option 3: Partial settlement (if patient has funds)
    options.push({
      type: 'partial_settlement',
      description: 'Accept reduced lump sum if patient has funds (e.g., insurance payout).',
      min_settlement_pct: 0.60, // Accept 60% of outstanding
      total_cost_increase_pct: 0,
      within_hard_rule: true
    });

    return {
      loan_id: loanId,
      outstanding_balance: outstandingBalance,
      options: options.filter(o => o.within_hard_rule),
      hard_rule: `No restructuring may increase total cost to patient by more than ${(MAX_RESTRUCTURE_COST_INCREASE * 100).toFixed(0)}%.`,
      requires_human_approval: true
    };
  }

  /**
   * Get pending surveys (ready to send).
   */
  async getPendingSurveys() {
    const result = await query(
      `SELECT os.*, u.full_name AS patient_name, u.cell_number,
              p.provider_name
       FROM outcome_surveys os
       JOIN users u ON os.patient_id = u.user_id
       LEFT JOIN providers p ON os.provider_id = p.provider_id
       WHERE os.status = 'pending' AND os.sent_at <= NOW()
       ORDER BY os.sent_at ASC`
    );
    return result.rows;
  }

  /**
   * Get provider outcome metrics (for provider scoring).
   */
  async getProviderOutcomeMetrics(providerId) {
    const result = await query(
      `SELECT
         COUNT(*) AS total_surveys,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_surveys,
         AVG(overall_rating) FILTER (WHERE status = 'completed') AS avg_rating,
         AVG(outcome_satisfaction) FILTER (WHERE status = 'completed') AS avg_outcome,
         AVG(financial_comfort) FILTER (WHERE status = 'completed') AS avg_financial_comfort,
         COUNT(*) FILTER (WHERE complications_reported = true) AS complications_count,
         COUNT(*) FILTER (WHERE would_recommend = true) AS would_recommend_count,
         COUNT(*) FILTER (WHERE would_recommend = false) AS would_not_recommend_count
       FROM outcome_surveys
       WHERE provider_id = $1`,
      [providerId]
    );

    return result.rows[0] || {};
  }

  /**
   * Get loans in arrears (for monitoring).
   */
  async getLoansInArrears() {
    try {
      const result = await query(
        `SELECT
           p.payment_id,
           p.user_id,
           p.amount,
           p.due_date,
           CURRENT_DATE - p.due_date AS days_overdue,
           u.full_name,
           u.cell_number,
           pp.plan_id,
           a.provider_name,
           a.provider_id
         FROM payments p
         JOIN users u ON p.user_id = u.user_id
         JOIN payment_plans pp ON p.plan_id = pp.plan_id
         JOIN applications a ON pp.application_id = a.application_id
         WHERE p.status IN ('overdue', 'failed')
           AND p.due_date < CURRENT_DATE
         ORDER BY days_overdue DESC`
      );
      return result.rows;
    } catch (err) {
      console.warn('Arrears query failed:', err.message);
      return [];
    }
  }
}

const outcomeGateService = new OutcomeGateService();

module.exports = { OutcomeGateService, outcomeGateService, ARREARS_STAGES };
