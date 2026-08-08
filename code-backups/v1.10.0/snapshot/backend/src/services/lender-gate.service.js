/**
 * LENDER GATE SERVICE (Gate 3)
 *
 * Purpose: Match approved loans with appropriate lenders on the marketplace.
 * Prevent predatory lending and cherry-picking.
 *
 * Hard Rules:
 * - Rate cap: ALL marketplace loans capped at prime + 12% (currently ~22.25% APR)
 * - No single lender exceeds 25% of marketplace volume
 * - Lenders must bid on >= 30% of all loan requests presented
 * - Collections practices must comply with PaySick code of conduct
 * - Balance sheet lending must not exceed 40% of total book value
 */

const { query, transaction } = require('../config/database');

// ═══════════════════════════════════════════════════════════════
// HARD RULES
// ═══════════════════════════════════════════════════════════════

const LENDER_HARD_RULES = {
  max_rate_apr: 0.2225,                // prime + 12%
  max_lender_concentration_pct: 25,    // no single lender > 25%
  min_bid_coverage_pct: 30,            // must bid on >= 30% of presented loans
  max_balance_sheet_pct: 40,           // balance sheet cannot exceed 40% of total book
  balance_sheet_amber_pct: 35          // amber alert at 35%
};

// Risk tier to lender rate band mapping
const RATE_BANDS = {
  prime:    { min: 0.03, max: 0.05 },   // prime + 3-5%
  standard: { min: 0.05, max: 0.08 },   // prime + 5-8%
  cautious: { min: 0.08, max: 0.12 },   // prime + 8-12%
  high_risk: null                         // typically not lent to on marketplace
};

const SA_PRIME_RATE = 0.1125; // 11.25%

class LenderGateService {
  /**
   * MAIN ENTRY: Match an approved loan to appropriate lender(s).
   */
  async matchLoan(assessmentId) {
    const result = {
      gate: 'LENDER_GATE',
      assessment_id: assessmentId,
      decision: null,
      matched_lenders: [],
      routing: null, // 'marketplace' or 'balance_sheet'
      flags: [],
      rationale: [],
      rate_band: null
    };

    // Load the assessment
    const assessmentResult = await query(
      `SELECT * FROM loan_risk_assessments WHERE assessment_id = $1`,
      [assessmentId]
    );

    if (assessmentResult.rows.length === 0) {
      result.decision = 'ERROR';
      result.rationale.push('Assessment not found.');
      return result;
    }

    const assessment = assessmentResult.rows[0];

    // Only match approved/approved_with_conditions
    const approvedStatuses = ['approve', 'approve_with_conditions'];
    const effectiveDecision = assessment.human_decision || assessment.ai_recommendation;
    if (!approvedStatuses.includes(effectiveDecision) && effectiveDecision !== 'approved') {
      result.decision = 'SKIP';
      result.rationale.push(`Assessment not approved (status: ${effectiveDecision}). No lender matching needed.`);
      return result;
    }

    // Determine rate band based on risk tier
    const riskTier = assessment.risk_tier || 'cautious';
    result.rate_band = RATE_BANDS[riskTier] || null;

    if (!result.rate_band) {
      result.decision = 'BALANCE_SHEET_ONLY';
      result.routing = 'balance_sheet';
      result.rationale.push(
        `Risk tier "${riskTier}" does not qualify for marketplace lending. ` +
        `Routing to balance sheet if capacity available.`
      );
    }

    // ── Check balance sheet capacity ──
    const balanceSheetCheck = await this.checkBalanceSheetCapacity();

    if (result.routing === 'balance_sheet') {
      if (balanceSheetCheck.breached) {
        result.decision = 'BLOCK';
        result.rationale.push(
          `Balance sheet at ${balanceSheetCheck.current_pct.toFixed(1)}% of total book (limit: 40%). ` +
          `Cannot route to balance sheet. No marketplace option for this risk tier.`
        );
        return result;
      }
      result.decision = 'ROUTE_BALANCE_SHEET';
      result.rationale.push(
        `Routed to balance sheet. Current capacity: ${(100 - balanceSheetCheck.current_pct).toFixed(1)}% remaining.`
      );
      return result;
    }

    // ── Balance sheet amber warning ──
    if (balanceSheetCheck.amber) {
      result.flags.push('BALANCE_SHEET_AMBER');
      result.rationale.push(
        `Balance sheet at ${balanceSheetCheck.current_pct.toFixed(1)}% — approaching 40% limit. ` +
        `Accelerate marketplace lender onboarding.`
      );
    }

    // ── Find eligible lenders ──
    const eligibleLenders = await this.findEligibleLenders(assessment, riskTier);

    if (eligibleLenders.length === 0) {
      // Fallback to balance sheet
      if (!balanceSheetCheck.breached) {
        result.decision = 'ROUTE_BALANCE_SHEET';
        result.routing = 'balance_sheet';
        result.rationale.push(
          'No eligible marketplace lenders available. Routing to balance sheet as fallback.'
        );
      } else {
        result.decision = 'NO_LENDER_AVAILABLE';
        result.rationale.push(
          'No eligible marketplace lenders and balance sheet at capacity. Loan cannot be funded at this time.'
        );
      }
      return result;
    }

    result.matched_lenders = eligibleLenders;
    result.routing = 'marketplace';
    result.decision = 'MATCHED';
    result.rationale.push(
      `${eligibleLenders.length} eligible lender(s) identified for risk tier "${riskTier}". ` +
      `Rate band: prime + ${(result.rate_band.min * 100).toFixed(0)}-${(result.rate_band.max * 100).toFixed(0)}%.`
    );

    // Update the assessment with Gate 3 result
    await query(
      `UPDATE loan_risk_assessments SET gate_3_result = $2, updated_at = NOW()
       WHERE assessment_id = $1`,
      [assessmentId, JSON.stringify(result)]
    );

    return result;
  }

  /**
   * Check current balance sheet capacity.
   */
  async checkBalanceSheetCapacity() {
    // Get balance sheet vs total book metrics
    // Using marketplace_loans to determine marketplace volume
    try {
      const totalResult = await query(
        `SELECT
           COALESCE(SUM(loan_amount_requested), 0) AS total_book
         FROM loan_risk_assessments
         WHERE ai_recommendation IN ('approve', 'approve_with_conditions')
            OR human_decision = 'approved'`
      );

      const marketplaceResult = await query(
        `SELECT COALESCE(SUM(loan_amount), 0) AS marketplace_total
         FROM marketplace_loans
         WHERE status IN ('funded', 'active', 'repaying')`
      );

      const totalBook = parseFloat(totalResult.rows[0]?.total_book || 0);
      const marketplaceTotal = parseFloat(marketplaceResult.rows[0]?.marketplace_total || 0);
      const balanceSheetTotal = Math.max(0, totalBook - marketplaceTotal);

      const currentPct = totalBook > 0 ? (balanceSheetTotal / totalBook) * 100 : 0;

      return {
        total_book: totalBook,
        balance_sheet_total: balanceSheetTotal,
        marketplace_total: marketplaceTotal,
        current_pct: currentPct,
        amber: currentPct >= LENDER_HARD_RULES.balance_sheet_amber_pct,
        breached: currentPct >= LENDER_HARD_RULES.max_balance_sheet_pct
      };
    } catch (err) {
      console.warn('Balance sheet capacity check failed:', err.message);
      return { total_book: 0, balance_sheet_total: 0, marketplace_total: 0, current_pct: 0, amber: false, breached: false };
    }
  }

  /**
   * Find lenders eligible for this loan.
   */
  async findEligibleLenders(assessment, riskTier) {
    const rateBand = RATE_BANDS[riskTier];
    if (!rateBand) return [];

    try {
      const result = await query(
        `SELECT l.*,
                ls.composite_score,
                ls.bid_coverage_pct,
                ls.concentration_pct
         FROM lenders l
         LEFT JOIN lender_scores ls ON l.lender_id = ls.lender_id
           AND ls.period_end = (SELECT MAX(period_end) FROM lender_scores WHERE lender_id = l.lender_id)
         WHERE l.status = 'active'
           AND (ls.concentration_pct IS NULL OR ls.concentration_pct < $1)
         ORDER BY ls.composite_score DESC NULLS LAST`,
        [LENDER_HARD_RULES.max_lender_concentration_pct]
      );

      return result.rows.map(lender => ({
        lender_id: lender.lender_id,
        lender_name: lender.institution_name || lender.lender_name,
        composite_score: lender.composite_score,
        concentration_pct: lender.concentration_pct || 0,
        rate_band: {
          min_rate: SA_PRIME_RATE + rateBand.min,
          max_rate: SA_PRIME_RATE + rateBand.max,
          cap: LENDER_HARD_RULES.max_rate_apr
        }
      }));
    } catch (err) {
      console.warn('Lender lookup failed:', err.message);
      return [];
    }
  }

  /**
   * Score a lender (monthly calculation).
   */
  async scoreLender(lenderId, periodStart, periodEnd) {
    // Get lender's performance metrics for the period
    try {
      const metricsResult = await query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'funded') AS funded_count,
           COUNT(*) AS total_offers,
           AVG(interest_rate) AS avg_rate,
           COUNT(*) FILTER (WHERE status = 'funded')::FLOAT /
             NULLIF(COUNT(*), 0) AS approval_rate
         FROM lender_offers
         WHERE lender_id = $1
           AND created_at BETWEEN $2 AND $3`,
        [lenderId, periodStart, periodEnd]
      );

      const metrics = metricsResult.rows[0] || {};

      // Scoring components (each 0-100)
      const approvalScore = this.scoreApprovalRate(parseFloat(metrics.approval_rate) || 0);
      const rateScore = this.scoreRateFairness(parseFloat(metrics.avg_rate) || 0);

      const composite = (
        approvalScore * 0.30 +
        rateScore * 0.30 +
        50 * 0.20 + // placeholder for complaint rate (no data yet)
        50 * 0.20   // placeholder for time-to-fund (no data yet)
      );

      await query(
        `INSERT INTO lender_scores
         (lender_id, approval_rate, avg_rate_charged,
          composite_score, total_loans_funded,
          period_start, period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          lenderId,
          parseFloat(metrics.approval_rate) || 0,
          parseFloat(metrics.avg_rate) || 0,
          composite,
          parseInt(metrics.funded_count) || 0,
          periodStart, periodEnd
        ]
      );

      return { lender_id: lenderId, composite_score: composite };
    } catch (err) {
      console.error('Lender scoring failed:', err.message);
      return null;
    }
  }

  /**
   * Score approval rate consistency (not too high, not too low).
   */
  scoreApprovalRate(rate) {
    // Sweet spot is 40-70% — rubber stamping (>90%) or cherry-picking (<20%) are bad
    if (rate >= 0.40 && rate <= 0.70) return 100;
    if (rate >= 0.30 && rate <= 0.80) return 75;
    if (rate >= 0.20 && rate <= 0.90) return 50;
    return 25;
  }

  /**
   * Score rate fairness (is the lender charging fairly?).
   */
  scoreRateFairness(avgRate) {
    if (avgRate <= SA_PRIME_RATE + 0.05) return 100;
    if (avgRate <= SA_PRIME_RATE + 0.08) return 75;
    if (avgRate <= SA_PRIME_RATE + 0.10) return 50;
    if (avgRate <= LENDER_HARD_RULES.max_rate_apr) return 25;
    return 0; // exceeds rate cap
  }

  /**
   * Validate a lender's offered rate against caps.
   */
  validateRate(offeredRate) {
    if (offeredRate > LENDER_HARD_RULES.max_rate_apr) {
      return {
        valid: false,
        reason: `Offered rate ${(offeredRate * 100).toFixed(2)}% exceeds cap of ${(LENDER_HARD_RULES.max_rate_apr * 100).toFixed(2)}%.`
      };
    }
    return { valid: true };
  }

  /**
   * Get portfolio allocation metrics.
   */
  async getPortfolioAllocation() {
    const bsCheck = await this.checkBalanceSheetCapacity();

    // Get per-lender concentration
    let lenderConcentration = [];
    try {
      const result = await query(
        `SELECT
           l.lender_id,
           l.institution_name,
           COUNT(ml.loan_id) AS loan_count,
           COALESCE(SUM(ml.loan_amount), 0) AS total_value
         FROM lenders l
         LEFT JOIN marketplace_loans ml ON l.lender_id = ml.lender_id
           AND ml.status IN ('funded', 'active', 'repaying')
         GROUP BY l.lender_id, l.institution_name
         ORDER BY total_value DESC`
      );
      lenderConcentration = result.rows;
    } catch (err) {
      console.warn('Lender concentration query failed:', err.message);
    }

    return {
      balance_sheet: bsCheck,
      lender_concentration: lenderConcentration.map(l => ({
        ...l,
        concentration_pct: bsCheck.marketplace_total > 0
          ? (parseFloat(l.total_value) / bsCheck.marketplace_total * 100).toFixed(1)
          : 0
      }))
    };
  }
}

const lenderGateService = new LenderGateService();

module.exports = { LenderGateService, lenderGateService, LENDER_HARD_RULES };
