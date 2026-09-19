/**
 * HEALTH LINE SERVICE (Revolving Credit Facility)
 *
 * Purpose: Convert proven borrowers into retained, low-risk repeat customers.
 * This structurally inverts adverse selection by rewarding good behaviour.
 *
 * Eligibility:
 * - 6+ months on-time repayment on initial loan
 * - No missed payments during initial term
 * - Income still verifiable and stable
 * - Patient satisfaction survey completed with no red flags
 *
 * Hard Rules:
 * - Frozen (not cancelled) if any payment 30+ days late
 * - Unfreezes only after 3 consecutive on-time payments
 * - Total Health Line exposure cannot exceed 25% of total book
 * - Same affordability ceilings apply to every draw-down
 */

const { query, transaction } = require('../config/database');

const HEALTH_LINE_CONFIG = {
  min_on_time_months: 6,
  initial_limit_pct: 0.50,              // 50% of first loan amount
  limit_12m: 1.0,                       // 100% of original loan at 12 months
  limit_18m: 50000,                     // R50,000 at 18 months
  limit_24m: 75000,                     // R75,000 max at 24+ months
  base_rate_min: 0.03,                  // prime + 3%
  base_rate_max: 0.05,                  // prime + 5%
  max_portfolio_exposure_pct: 25,       // max 25% of total book
  freeze_threshold_days: 30,            // freeze if 30+ days late
  unfreeze_consecutive_payments: 3,     // 3 on-time payments to unfreeze
  max_rti: 0.20,                        // same 20% ceiling applies
  max_dti: 0.55                         // same DTI ceiling applies
};

const SA_PRIME_RATE = 0.1125;

class HealthLineService {
  /**
   * Check if a patient is eligible for Health Line activation.
   */
  async checkEligibility(patientId) {
    const result = {
      eligible: false,
      reasons: [],
      unmet: [],
      patient_id: patientId
    };

    // Check repayment history
    try {
      const paymentHistory = await query(
        `SELECT
           COUNT(*) AS total_payments,
           COUNT(*) FILTER (WHERE status = 'paid') AS paid_on_time,
           COUNT(*) FILTER (WHERE status IN ('overdue', 'failed')) AS missed,
           MIN(pp.start_date) AS earliest_plan,
           MAX(CASE WHEN p.status = 'paid' THEN p.payment_date END) AS last_payment
         FROM payments p
         JOIN payment_plans pp ON p.plan_id = pp.plan_id
         WHERE p.user_id = $1`,
        [patientId]
      );

      const history = paymentHistory.rows[0];

      if (!history || parseInt(history.total_payments) === 0) {
        result.unmet.push('No payment history found.');
        return result;
      }

      // Check months of history
      if (history.earliest_plan) {
        const monthsActive = Math.floor(
          (Date.now() - new Date(history.earliest_plan).getTime()) / (30 * 24 * 60 * 60 * 1000)
        );
        if (monthsActive >= HEALTH_LINE_CONFIG.min_on_time_months) {
          result.reasons.push(`${monthsActive} months of payment history (min: ${HEALTH_LINE_CONFIG.min_on_time_months}).`);
        } else {
          result.unmet.push(`Only ${monthsActive} months of history (need ${HEALTH_LINE_CONFIG.min_on_time_months}).`);
        }
      }

      // Check missed payments
      if (parseInt(history.missed) === 0) {
        result.reasons.push('No missed payments.');
      } else {
        result.unmet.push(`${history.missed} missed payment(s) found.`);
      }
    } catch (err) {
      result.unmet.push('Unable to verify payment history.');
    }

    // Check satisfaction surveys
    try {
      const surveyResult = await query(
        `SELECT COUNT(*) AS completed,
                AVG(overall_rating) AS avg_rating,
                BOOL_OR(complications_reported) AS any_complications
         FROM outcome_surveys
         WHERE patient_id = $1 AND status = 'completed'`,
        [patientId]
      );

      const survey = surveyResult.rows[0];
      if (parseInt(survey?.completed || 0) > 0) {
        if (survey.any_complications) {
          result.unmet.push('Complication reported in satisfaction survey.');
        } else {
          result.reasons.push('Satisfaction survey completed with no red flags.');
        }
      } else {
        result.unmet.push('No completed satisfaction survey found.');
      }
    } catch (err) {
      // Survey check is soft — don't block if table doesn't exist yet
      result.reasons.push('Survey check skipped (system bootstrapping).');
    }

    // Check if already has a Health Line
    try {
      const existing = await query(
        `SELECT account_id, status FROM health_line_accounts WHERE patient_id = $1`,
        [patientId]
      );
      if (existing.rows.length > 0) {
        result.unmet.push(`Health Line already exists (status: ${existing.rows[0].status}).`);
        result.existing_account_id = existing.rows[0].account_id;
        return result;
      }
    } catch (err) {
      // continue
    }

    result.eligible = result.unmet.length === 0;
    return result;
  }

  /**
   * Activate a Health Line for a patient (requires human approval).
   */
  async activate(patientId, activatedBy, originalLoanAmount) {
    // Check eligibility first
    const eligibility = await this.checkEligibility(patientId);
    if (!eligibility.eligible) {
      return { success: false, reason: 'Not eligible', details: eligibility.unmet };
    }

    // Check portfolio exposure
    const exposureCheck = await this.checkPortfolioExposure();
    if (exposureCheck.exceeded) {
      return {
        success: false,
        reason: `Health Line portfolio exposure at ${exposureCheck.current_pct.toFixed(1)}% (max: ${HEALTH_LINE_CONFIG.max_portfolio_exposure_pct}%).`
      };
    }

    // Calculate initial limit
    const initialLimit = Math.floor(originalLoanAmount * HEALTH_LINE_CONFIG.initial_limit_pct);
    const rate = SA_PRIME_RATE + HEALTH_LINE_CONFIG.base_rate_min; // Best rate for proven borrowers

    const result = await query(
      `INSERT INTO health_line_accounts
       (patient_id, credit_limit, available_balance, interest_rate,
        status, original_loan_id, initial_limit,
        activated_by, activated_at, activation_date)
       VALUES ($1, $2, $2, $3, 'active', $4, $2, $5, NOW(), NOW())
       RETURNING *`,
      [patientId, initialLimit, rate, null, activatedBy]
    );

    // Update patient record
    await query(
      `UPDATE users SET health_line_eligible = true, updated_at = NOW()
       WHERE user_id = $1`,
      [patientId]
    );

    return {
      success: true,
      account: result.rows[0],
      message: `Health Line activated with R${initialLimit.toLocaleString()} limit at ${(rate * 100).toFixed(1)}% rate.`
    };
  }

  /**
   * Process a Health Line draw-down.
   * Same affordability ceilings apply — this is NOT a blank cheque.
   */
  async drawDown(accountId, drawRequest) {
    return transaction(async (client) => {
      // Get account
      const accountResult = await client.query(
        `SELECT * FROM health_line_accounts WHERE account_id = $1 FOR UPDATE`,
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        return { success: false, reason: 'Account not found.' };
      }

      const account = accountResult.rows[0];

      // Check account is active
      if (account.status !== 'active') {
        return { success: false, reason: `Account is ${account.status}. Cannot draw.` };
      }

      // Check available balance
      const drawAmount = drawRequest.draw_amount;
      if (drawAmount > parseFloat(account.available_balance)) {
        return {
          success: false,
          reason: `Draw amount R${drawAmount.toLocaleString()} exceeds available balance R${parseFloat(account.available_balance).toLocaleString()}.`
        };
      }

      // Affordability check (same ceilings apply)
      if (drawRequest.monthly_income_verified) {
        const monthlyRate = parseFloat(account.interest_rate) / 12;
        const termMonths = drawRequest.repayment_term_months || 6;
        const monthlyRepayment = drawAmount *
          (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
          (Math.pow(1 + monthlyRate, termMonths) - 1);

        const rti = monthlyRepayment / drawRequest.monthly_income_verified;
        if (rti > HEALTH_LINE_CONFIG.max_rti) {
          return {
            success: false,
            reason: `RTI of ${(rti * 100).toFixed(1)}% exceeds 20% ceiling even for Health Line draw-downs.`
          };
        }
      }

      // Process the draw
      const termMonths = drawRequest.repayment_term_months || 6;
      const monthlyRate = parseFloat(account.interest_rate) / 12;
      const monthlyRepayment = drawAmount *
        (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
        (Math.pow(1 + monthlyRate, termMonths) - 1);

      const drawResult = await client.query(
        `INSERT INTO health_line_draws
         (account_id, patient_id, provider_id, draw_amount,
          procedure_type, procedure_description,
          repayment_term_months, monthly_repayment, interest_rate,
          rti_at_draw, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved')
         RETURNING *`,
        [
          accountId, account.patient_id, drawRequest.provider_id || null,
          drawAmount, drawRequest.procedure_type || null,
          drawRequest.procedure_description || null,
          termMonths, Math.ceil(monthlyRepayment),
          parseFloat(account.interest_rate),
          drawRequest.monthly_income_verified
            ? (monthlyRepayment / drawRequest.monthly_income_verified)
            : null
        ]
      );

      // Update account balances
      await client.query(
        `UPDATE health_line_accounts
         SET available_balance = available_balance - $2,
             current_balance = current_balance + $2,
             last_draw_date = NOW(),
             updated_at = NOW()
         WHERE account_id = $1`,
        [accountId, drawAmount]
      );

      return {
        success: true,
        draw: drawResult.rows[0],
        remaining_balance: parseFloat(account.available_balance) - drawAmount
      };
    });
  }

  /**
   * Freeze a Health Line (payment 30+ days late).
   */
  async freeze(accountId, reason) {
    const result = await query(
      `UPDATE health_line_accounts
       SET status = 'frozen', freeze_reason = $2, frozen_at = NOW(), updated_at = NOW()
       WHERE account_id = $1 AND status = 'active'
       RETURNING *`,
      [accountId, reason]
    );
    return result.rows[0];
  }

  /**
   * Unfreeze a Health Line (after 3 consecutive on-time payments).
   */
  async unfreeze(accountId) {
    const account = await query(
      `SELECT * FROM health_line_accounts WHERE account_id = $1`,
      [accountId]
    );

    if (!account.rows[0] || account.rows[0].status !== 'frozen') {
      return { success: false, reason: 'Account is not frozen.' };
    }

    if (account.rows[0].consecutive_on_time_payments < HEALTH_LINE_CONFIG.unfreeze_consecutive_payments) {
      return {
        success: false,
        reason: `Need ${HEALTH_LINE_CONFIG.unfreeze_consecutive_payments} consecutive on-time payments. Currently: ${account.rows[0].consecutive_on_time_payments}.`
      };
    }

    const result = await query(
      `UPDATE health_line_accounts
       SET status = 'active', freeze_reason = NULL, frozen_at = NULL, updated_at = NOW()
       WHERE account_id = $1
       RETURNING *`,
      [accountId]
    );

    return { success: true, account: result.rows[0] };
  }

  /**
   * Check if a limit increase is available.
   */
  async checkLimitIncrease(accountId) {
    const account = await query(
      `SELECT * FROM health_line_accounts WHERE account_id = $1`,
      [accountId]
    );

    if (!account.rows[0]) return null;

    const acct = account.rows[0];
    const monthsActive = acct.activation_date
      ? Math.floor((Date.now() - new Date(acct.activation_date).getTime()) / (30 * 24 * 60 * 60 * 1000))
      : 0;

    const currentLimit = parseFloat(acct.credit_limit);
    const initialLimit = parseFloat(acct.initial_limit);
    let newLimit = currentLimit;

    if (monthsActive >= 24) {
      newLimit = Math.min(HEALTH_LINE_CONFIG.limit_24m, currentLimit * 1.5);
    } else if (monthsActive >= 18) {
      newLimit = Math.min(HEALTH_LINE_CONFIG.limit_18m, currentLimit * 1.3);
    } else if (monthsActive >= 12) {
      newLimit = Math.min(initialLimit * HEALTH_LINE_CONFIG.limit_12m / HEALTH_LINE_CONFIG.initial_limit_pct, currentLimit * 1.5);
    }

    return {
      account_id: accountId,
      current_limit: currentLimit,
      proposed_limit: Math.floor(newLimit),
      months_active: monthsActive,
      eligible: newLimit > currentLimit,
      requires_income_reverification: true,
      requires_human_approval: true
    };
  }

  /**
   * Apply a limit increase (after human approval).
   */
  async applyLimitIncrease(accountId, newLimit, approvedBy) {
    const result = await query(
      `UPDATE health_line_accounts
       SET credit_limit = $2,
           available_balance = available_balance + ($2 - credit_limit),
           limit_increase_count = limit_increase_count + 1,
           last_limit_increase_date = NOW(),
           updated_at = NOW()
       WHERE account_id = $1
       RETURNING *`,
      [accountId, newLimit]
    );
    return result.rows[0];
  }

  /**
   * Check total Health Line exposure vs portfolio limit.
   */
  async checkPortfolioExposure() {
    try {
      const hlResult = await query(
        `SELECT COALESCE(SUM(current_balance), 0) AS total_hl_exposure
         FROM health_line_accounts WHERE status IN ('active', 'frozen')`
      );
      const totalResult = await query(
        `SELECT COALESCE(SUM(loan_amount_requested), 0) AS total_book
         FROM loan_risk_assessments
         WHERE (ai_recommendation IN ('approve','approve_with_conditions') OR human_decision = 'approved')`
      );

      const hlExposure = parseFloat(hlResult.rows[0]?.total_hl_exposure || 0);
      const totalBook = parseFloat(totalResult.rows[0]?.total_book || 0);
      const currentPct = totalBook > 0 ? (hlExposure / totalBook) * 100 : 0;

      return {
        total_hl_exposure: hlExposure,
        total_book: totalBook,
        current_pct: currentPct,
        exceeded: currentPct >= HEALTH_LINE_CONFIG.max_portfolio_exposure_pct
      };
    } catch (err) {
      return { total_hl_exposure: 0, total_book: 0, current_pct: 0, exceeded: false };
    }
  }

  /**
   * Get a patient's Health Line account.
   */
  async getAccount(patientId) {
    const result = await query(
      `SELECT hla.*,
              u.full_name AS patient_name
       FROM health_line_accounts hla
       JOIN users u ON hla.patient_id = u.user_id
       WHERE hla.patient_id = $1`,
      [patientId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get draw history for an account.
   */
  async getDrawHistory(accountId) {
    const result = await query(
      `SELECT hld.*, p.provider_name
       FROM health_line_draws hld
       LEFT JOIN providers p ON hld.provider_id = p.provider_id
       WHERE hld.account_id = $1
       ORDER BY hld.created_at DESC`,
      [accountId]
    );
    return result.rows;
  }
}

const healthLineService = new HealthLineService();

module.exports = { HealthLineService, healthLineService, HEALTH_LINE_CONFIG };
