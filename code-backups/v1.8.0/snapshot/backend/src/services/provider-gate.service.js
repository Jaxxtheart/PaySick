/**
 * PROVIDER GATE SERVICE (Gate 1)
 *
 * Purpose: Prevent adverse selection at origination.
 * Providers receive payment within 24 hours regardless of patient repayment —
 * this creates moral hazard. The Provider Gate manages that risk.
 *
 * Responsibilities:
 * - Graduated trust system (probation → standard → trusted → premium)
 * - Provider risk scorecard (composite score 0-100)
 * - Hard rules enforcement (HPCSA, default rate, concentration)
 * - Treatment cost benchmarking
 * - Holdback management
 */

const { query, transaction } = require('../config/database');

// ═══════════════════════════════════════════════════════════════
// TRUST TIER DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const TRUST_TIERS = {
  probation: {
    per_patient_cap: 10000,
    payout_speed_days: 5,
    holdback_pct: 10,
    max_monthly_volume: 10,
    min_months: 0,
    upgrade_criteria: {
      min_months: 6,
      max_default_rate: 0.04,
      max_cost_variance: 0.20,
      min_completed_loans: 15,
      no_flags: true
    }
  },
  standard: {
    per_patient_cap: 25000,
    payout_speed_days: 3,
    holdback_pct: 5,
    max_monthly_volume: 30,
    min_months: 6,
    upgrade_criteria: {
      min_months: 12,
      max_default_rate: 0.025,
      min_completed_loans: 50,
      min_clean_months: 12,
      min_satisfaction: 85
    }
  },
  trusted: {
    per_patient_cap: 45000,
    payout_speed_days: 1,
    holdback_pct: 0,
    max_monthly_volume: null, // no cap
    min_months: 12,
    upgrade_criteria: {
      min_months: 18,
      invitation_only: true
    }
  },
  premium: {
    per_patient_cap: 75000,
    payout_speed_days: 0, // same-day
    holdback_pct: 0,
    max_monthly_volume: null,
    min_months: 18
  }
};

// ═══════════════════════════════════════════════════════════════
// HARD RULES — No override without Head of Credit + CEO approval
// ═══════════════════════════════════════════════════════════════

const HARD_RULES = {
  max_default_rate_auto_suspend: 0.08,
  max_concentration_pct: 5,
  max_procedure_type_concentration_pct: 20,
  max_cost_above_benchmark_pct: 0.50
};

const AMBER_THRESHOLDS = {
  default_rate_review: { min: 0.05, max: 0.08 },
  cost_variance_review: { min: 0.30, max: 0.50 },
  volume_spike_pct: 0.50,
  min_satisfaction_score: 3.5,
  complaint_count_30_days: 3
};

class ProviderGateService {
  /**
   * MAIN ENTRY: Assess a provider for a loan application.
   * Returns pass/fail with detailed rationale.
   */
  async assessProvider(providerId) {
    const result = {
      gate: 'PROVIDER_GATE',
      provider_id: providerId,
      passed: false,
      decision: null,
      flags: [],
      blocks: [],
      rationale: [],
      requires_human_review: false,
      provider_data: null,
      risk_score: null,
      trust_tier: null
    };

    // Load provider data
    const providerResult = await query(
      `SELECT * FROM providers WHERE provider_id = $1`,
      [providerId]
    );

    if (providerResult.rows.length === 0) {
      result.decision = 'BLOCK';
      result.blocks.push('PROVIDER_NOT_FOUND');
      result.rationale.push('Provider not found in system.');
      return result;
    }

    const provider = providerResult.rows[0];
    result.provider_data = {
      provider_id: provider.provider_id,
      provider_name: provider.provider_name,
      trust_tier: provider.trust_tier || 'probation',
      status: provider.status,
      risk_score: provider.risk_score,
      default_rate: provider.default_rate,
      concentration_pct: provider.concentration_pct
    };
    result.trust_tier = provider.trust_tier || 'probation';

    // ── HARD RULE: Status check ──
    if (provider.status === 'suspended' || provider.status === 'terminated') {
      result.decision = 'BLOCK';
      result.blocks.push('PROVIDER_SUSPENDED_OR_TERMINATED');
      result.rationale.push(
        `Provider status is "${provider.status}". No loans can be originated through this provider.`
      );
      return result;
    }

    // ── HARD RULE: HPCSA registration ──
    if (!provider.hpcsa_registration) {
      result.decision = 'BLOCK';
      result.blocks.push('HPCSA_INVALID');
      result.rationale.push(
        'Provider HPCSA registration is missing or invalid. Cannot proceed without valid registration.'
      );
      return result;
    }

    // ── HARD RULE: Default rate > 8% → auto-suspend ──
    if (provider.default_rate > HARD_RULES.max_default_rate_auto_suspend) {
      await this.suspendProvider(providerId, 'Default rate exceeded 8% threshold');
      result.decision = 'BLOCK';
      result.blocks.push('DEFAULT_RATE_AUTO_SUSPEND');
      result.rationale.push(
        `Provider rolling 12-month default rate of ${(provider.default_rate * 100).toFixed(1)}% ` +
        `exceeds 8% hard ceiling. Provider has been auto-suspended pending review.`
      );
      return result;
    }

    // ── HARD RULE: Concentration > 5% of total book ──
    if (provider.concentration_pct > HARD_RULES.max_concentration_pct) {
      result.decision = 'BLOCK';
      result.blocks.push('CONCENTRATION_LIMIT');
      result.rationale.push(
        `Provider represents ${(provider.concentration_pct).toFixed(1)}% of total loan book, ` +
        `exceeding 5% concentration limit. New originations paused until concentration decreases.`
      );
      return result;
    }

    // ── HARD RULE: Cost quotes 50%+ above benchmark ──
    if (provider.cost_variance_pct > HARD_RULES.max_cost_above_benchmark_pct) {
      result.decision = 'BLOCK';
      result.blocks.push('COST_ABOVE_BENCHMARK');
      result.rationale.push(
        `Provider cost variance is ${(provider.cost_variance_pct * 100).toFixed(0)}% above regional benchmark, ` +
        `exceeding 50% hard ceiling. Manual review required before any approval.`
      );
      return result;
    }

    // ── AMBER: Default rate 5-8% ──
    if (provider.default_rate >= AMBER_THRESHOLDS.default_rate_review.min &&
        provider.default_rate <= AMBER_THRESHOLDS.default_rate_review.max) {
      result.flags.push('DEFAULT_RATE_AMBER');
      result.requires_human_review = true;
      result.rationale.push(
        `Provider default rate of ${(provider.default_rate * 100).toFixed(1)}% is between 5-8%. ` +
        `Flagged for underwriting review.`
      );
    }

    // ── AMBER: Cost variance 30-50% above benchmark ──
    if (provider.cost_variance_pct >= AMBER_THRESHOLDS.cost_variance_review.min &&
        provider.cost_variance_pct <= AMBER_THRESHOLDS.cost_variance_review.max) {
      result.flags.push('COST_VARIANCE_AMBER');
      result.requires_human_review = true;
      result.rationale.push(
        `Provider cost variance is ${(provider.cost_variance_pct * 100).toFixed(0)}% above benchmark. Flagged for review.`
      );
    }

    // ── AMBER: Volume spike > 50% MoM ──
    if (provider.month_over_month_volume_change_pct > AMBER_THRESHOLDS.volume_spike_pct) {
      result.flags.push('VOLUME_SPIKE_AMBER');
      result.requires_human_review = true;
      result.rationale.push(
        `Provider referral volume spiked ${(provider.month_over_month_volume_change_pct * 100).toFixed(0)}% month-over-month. ` +
        `Possible adverse behaviour. Flagged for review.`
      );
    }

    // ── AMBER: Satisfaction below 3.5 ──
    if (provider.avg_satisfaction_score !== null && provider.avg_satisfaction_score < AMBER_THRESHOLDS.min_satisfaction_score) {
      result.flags.push('SATISFACTION_AMBER');
      result.requires_human_review = true;
      result.rationale.push(
        `Provider satisfaction score of ${provider.avg_satisfaction_score.toFixed(1)} is below 3.5 threshold. Flagged for review.`
      );
    }

    // ── Check monthly volume cap ──
    const tierConfig = TRUST_TIERS[result.trust_tier] || TRUST_TIERS.probation;
    if (tierConfig.max_monthly_volume !== null) {
      const volumeResult = await query(
        `SELECT COUNT(*) AS loan_count
         FROM loan_risk_assessments
         WHERE provider_id = $1
           AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
        [providerId]
      );
      const currentVolume = parseInt(volumeResult.rows[0]?.loan_count || 0);
      if (currentVolume >= tierConfig.max_monthly_volume) {
        result.decision = 'BLOCK';
        result.blocks.push('MONTHLY_VOLUME_CAP');
        result.rationale.push(
          `Provider has reached monthly volume cap of ${tierConfig.max_monthly_volume} loans ` +
          `for "${result.trust_tier}" tier. Current month count: ${currentVolume}.`
        );
        return result;
      }
    }

    // ── Calculate risk score ──
    result.risk_score = this.calculateProviderRiskScore(provider);

    // If no blocks, provider passes
    if (result.blocks.length === 0) {
      result.passed = true;
      result.decision = result.requires_human_review ? 'PASS_WITH_REVIEW' : 'PASS';
      result.rationale.push(
        `Provider passes Gate 1. Trust tier: ${result.trust_tier}. ` +
        `Risk score: ${result.risk_score.composite_score.toFixed(1)}. ` +
        `Per-patient cap: R${tierConfig.per_patient_cap.toLocaleString()}.`
      );
    }

    return result;
  }

  /**
   * Calculate composite provider risk score.
   * Score 0-100 where 100 is perfect.
   */
  calculateProviderRiskScore(provider) {
    const scores = {};

    // 1. Patient Repayment Performance (40% weight)
    const pd = provider.default_rate || 0;
    if (pd <= 0.02) scores.repayment = 100;
    else if (pd <= 0.035) scores.repayment = 80;
    else if (pd <= 0.05) scores.repayment = 60;
    else if (pd <= 0.08) scores.repayment = 30;
    else scores.repayment = 0;

    // 2. Treatment Cost Variance (25% weight)
    const variance = provider.cost_variance_pct || 0;
    if (variance <= 0.10) scores.cost = 100;
    else if (variance <= 0.20) scores.cost = 80;
    else if (variance <= 0.30) scores.cost = 50;
    else scores.cost = 0;

    // 3. Patient Outcome Satisfaction (20% weight)
    const satisfaction = provider.avg_satisfaction_score || 4.0; // default to good if no data
    if (satisfaction >= 4.2) scores.outcomes = 100;
    else if (satisfaction >= 3.5) scores.outcomes = 70;
    else if (satisfaction >= 3.0) scores.outcomes = 40;
    else scores.outcomes = 0;

    // 4. Volume Trend Anomaly (15% weight)
    const volumeChange = provider.month_over_month_volume_change_pct || 0;
    if (volumeChange <= 0.20) scores.volume = 100;
    else if (volumeChange <= 0.50) scores.volume = 60;
    else scores.volume = 20;

    const composite = (
      scores.repayment * 0.40 +
      scores.cost * 0.25 +
      scores.outcomes * 0.20 +
      scores.volume * 0.15
    );

    return {
      composite_score: composite,
      component_scores: scores,
      traffic_light: composite >= 70 ? 'green' : composite >= 45 ? 'amber' : 'red',
      requires_human_review: composite < 70 || Object.values(scores).some(v => v < 50)
    };
  }

  /**
   * Persist a monthly risk score snapshot.
   */
  async saveRiskScoreSnapshot(providerId, riskScore, periodStart, periodEnd, provider) {
    await query(
      `INSERT INTO provider_risk_scores
       (provider_id, composite_score, traffic_light,
        repayment_score, cost_variance_score, outcome_satisfaction_score, volume_trend_score,
        rolling_12m_default_rate, cost_variance_from_benchmark_pct,
        avg_satisfaction, month_over_month_volume_change_pct,
        recommended_action, requires_human_review, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        providerId,
        riskScore.composite_score,
        riskScore.traffic_light,
        riskScore.component_scores.repayment,
        riskScore.component_scores.cost,
        riskScore.component_scores.outcomes,
        riskScore.component_scores.volume,
        provider.default_rate || 0,
        provider.cost_variance_pct || 0,
        provider.avg_satisfaction_score || null,
        provider.month_over_month_volume_change_pct || 0,
        this.deriveAction(riskScore),
        riskScore.requires_human_review,
        periodStart,
        periodEnd
      ]
    );
  }

  /**
   * Derive recommended action from risk score.
   */
  deriveAction(riskScore) {
    if (riskScore.composite_score >= 80) return 'No action required. Provider performing well.';
    if (riskScore.composite_score >= 70) return 'Monitor. Provider within acceptable range.';
    if (riskScore.composite_score >= 45) return 'Review required. One or more metrics in amber zone.';
    return 'Immediate review required. Provider in red zone — consider throttling or suspension.';
  }

  /**
   * Suspend a provider (automatic or manual).
   */
  async suspendProvider(providerId, reason) {
    await query(
      `UPDATE providers SET status = 'suspended', shield_flags = shield_flags || $2, updated_at = NOW()
       WHERE provider_id = $1`,
      [providerId, JSON.stringify([{ type: 'AUTO_SUSPEND', reason, timestamp: new Date().toISOString() }])]
    );
  }

  /**
   * Get current trust tier configuration for a provider.
   */
  async getProviderTierConfig(providerId) {
    const result = await query(
      `SELECT trust_tier FROM providers WHERE provider_id = $1`,
      [providerId]
    );
    if (result.rows.length === 0) return null;
    const tier = result.rows[0].trust_tier || 'probation';
    return { tier, config: TRUST_TIERS[tier] || TRUST_TIERS.probation };
  }

  /**
   * Check if a provider is eligible for tier upgrade.
   * Returns eligibility status and requirements.
   */
  async checkTierUpgradeEligibility(providerId) {
    const providerResult = await query(
      `SELECT * FROM providers WHERE provider_id = $1`,
      [providerId]
    );
    if (providerResult.rows.length === 0) return null;

    const provider = providerResult.rows[0];
    const currentTier = provider.trust_tier || 'probation';
    const tierConfig = TRUST_TIERS[currentTier];

    if (!tierConfig || !tierConfig.upgrade_criteria) {
      return { eligible: false, reason: `No upgrade path from "${currentTier}" tier.` };
    }

    const criteria = tierConfig.upgrade_criteria;
    const issues = [];

    // Check months since onboarding
    if (provider.onboarded_at) {
      const monthsSinceOnboarding = Math.floor(
        (Date.now() - new Date(provider.onboarded_at).getTime()) / (30 * 24 * 60 * 60 * 1000)
      );
      if (monthsSinceOnboarding < criteria.min_months) {
        issues.push(`Needs ${criteria.min_months} months, currently at ${monthsSinceOnboarding} months.`);
      }
    }

    // Check default rate
    if (criteria.max_default_rate !== undefined && provider.default_rate > criteria.max_default_rate) {
      issues.push(`Default rate ${(provider.default_rate * 100).toFixed(1)}% exceeds max ${(criteria.max_default_rate * 100).toFixed(1)}%.`);
    }

    // Check cost variance
    if (criteria.max_cost_variance !== undefined && provider.cost_variance_pct > criteria.max_cost_variance) {
      issues.push(`Cost variance ${(provider.cost_variance_pct * 100).toFixed(0)}% exceeds max ${(criteria.max_cost_variance * 100).toFixed(0)}%.`);
    }

    // Check completed loans
    if (criteria.min_completed_loans !== undefined && provider.total_loans_referred < criteria.min_completed_loans) {
      issues.push(`${provider.total_loans_referred} completed loans, needs ${criteria.min_completed_loans}.`);
    }

    // Check flags
    if (criteria.no_flags) {
      const flags = provider.shield_flags || [];
      if (flags.length > 0) {
        issues.push(`Provider has ${flags.length} active flag(s).`);
      }
    }

    // Check satisfaction
    if (criteria.min_satisfaction !== undefined) {
      const satPct = (provider.avg_satisfaction_score || 0) * 20; // convert 1-5 to percentage
      if (satPct < criteria.min_satisfaction) {
        issues.push(`Satisfaction score ${satPct.toFixed(0)}% below ${criteria.min_satisfaction}% threshold.`);
      }
    }

    if (criteria.invitation_only) {
      issues.push('Premium tier is by invitation only — requires Head of Credit approval.');
    }

    const nextTierMap = { probation: 'standard', standard: 'trusted', trusted: 'premium' };
    return {
      eligible: issues.length === 0 || (issues.length === 1 && criteria.invitation_only),
      current_tier: currentTier,
      next_tier: nextTierMap[currentTier] || null,
      unmet_criteria: issues,
      requires_human_approval: true // All tier upgrades require human approval
    };
  }

  /**
   * Upgrade provider tier (after human approval).
   */
  async upgradeProviderTier(providerId, newTier, approvedBy, reason) {
    const tierConfig = TRUST_TIERS[newTier];
    if (!tierConfig) throw new Error(`Invalid tier: ${newTier}`);

    return transaction(async (client) => {
      // Mark current tier as historical
      await client.query(
        `UPDATE provider_trust_tiers SET is_current = false, effective_until = NOW()
         WHERE provider_id = $1 AND is_current = true`,
        [providerId]
      );

      // Insert new tier record
      await client.query(
        `INSERT INTO provider_trust_tiers
         (provider_id, trust_tier, previous_tier, change_reason,
          per_patient_cap, payout_speed_days, holdback_pct, max_monthly_volume,
          approved_by, approved_at, is_current)
         SELECT $1, $2, trust_tier, $3, $4, $5, $6, $7, $8, NOW(), true
         FROM providers WHERE provider_id = $1`,
        [
          providerId, newTier, reason,
          tierConfig.per_patient_cap, tierConfig.payout_speed_days,
          tierConfig.holdback_pct, tierConfig.max_monthly_volume,
          approvedBy
        ]
      );

      // Update provider record
      await client.query(
        `UPDATE providers SET
          trust_tier = $2,
          per_patient_cap = $3,
          payout_speed_days = $4,
          holdback_pct = $5,
          max_monthly_volume = $6,
          updated_at = NOW()
         WHERE provider_id = $1`,
        [
          providerId, newTier,
          tierConfig.per_patient_cap, tierConfig.payout_speed_days,
          tierConfig.holdback_pct, tierConfig.max_monthly_volume
        ]
      );

      return { provider_id: providerId, new_tier: newTier, config: tierConfig };
    });
  }

  /**
   * Check a quoted cost against procedure benchmarks.
   */
  async checkCostBenchmark(procedureType, procedureSubtype, region, quotedCost) {
    const result = await query(
      `SELECT * FROM procedure_benchmarks
       WHERE procedure_type = $1 AND procedure_subtype = $2 AND region = $3`,
      [procedureType, procedureSubtype, region]
    );

    if (result.rows.length === 0) {
      return {
        benchmark_found: false,
        rationale: `No benchmark data for ${procedureType}/${procedureSubtype} in ${region}. Manual review recommended.`,
        traffic_light: 'amber'
      };
    }

    const benchmark = result.rows[0];
    const variancePct = (quotedCost - benchmark.median_cost) / benchmark.median_cost;

    let traffic_light = 'green';
    let rationale = '';

    if (quotedCost <= benchmark.p75_cost) {
      traffic_light = 'green';
      rationale = `Quoted R${quotedCost.toLocaleString()} is within p75 benchmark of R${parseFloat(benchmark.p75_cost).toLocaleString()}.`;
    } else if (quotedCost <= benchmark.p95_cost) {
      traffic_light = 'amber';
      rationale = `Quoted R${quotedCost.toLocaleString()} exceeds p75 (R${parseFloat(benchmark.p75_cost).toLocaleString()}) but within p95. Review recommended.`;
    } else {
      traffic_light = 'red';
      rationale = `Quoted R${quotedCost.toLocaleString()} exceeds p95 outlier threshold of R${parseFloat(benchmark.p95_cost).toLocaleString()}. Block until manual review.`;
    }

    return {
      benchmark_found: true,
      benchmark,
      variance_pct: variancePct,
      traffic_light,
      rationale
    };
  }

  /**
   * Create a holdback record when a loan is disbursed.
   */
  async createHoldback(providerId, loanId, loanAmount, holdbackPct) {
    if (holdbackPct <= 0) return null;

    const holdbackAmount = loanAmount * (holdbackPct / 100);
    const releaseDate = new Date();
    releaseDate.setDate(releaseDate.getDate() + 90);

    const result = await query(
      `INSERT INTO provider_holdbacks
       (provider_id, loan_id, holdback_amount, holdback_pct, loan_amount, release_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [providerId, loanId, holdbackAmount, holdbackPct, loanAmount, releaseDate]
    );

    // Update provider holdback balance
    await query(
      `UPDATE providers SET holdback_balance = holdback_balance + $2, updated_at = NOW()
       WHERE provider_id = $1`,
      [providerId, holdbackAmount]
    );

    return result.rows[0];
  }

  /**
   * Release a holdback (after 90 days if patients are current).
   */
  async releaseHoldback(holdbackId, releasedBy) {
    return transaction(async (client) => {
      const holdback = await client.query(
        `SELECT * FROM provider_holdbacks WHERE holdback_id = $1 AND status = 'held'`,
        [holdbackId]
      );

      if (holdback.rows.length === 0) return null;

      const hb = holdback.rows[0];

      await client.query(
        `UPDATE provider_holdbacks
         SET status = 'released', released_at = NOW(), released_by = $2, updated_at = NOW()
         WHERE holdback_id = $1`,
        [holdbackId, releasedBy]
      );

      await client.query(
        `UPDATE providers SET holdback_balance = holdback_balance - $2, updated_at = NOW()
         WHERE provider_id = $1`,
        [hb.provider_id, hb.holdback_amount]
      );

      return { holdback_id: holdbackId, status: 'released', amount: hb.holdback_amount };
    });
  }

  /**
   * Get all providers due for review (risk score recalculation).
   */
  async getProvidersDueForReview() {
    const result = await query(
      `SELECT * FROM providers
       WHERE status = 'active'
         AND (next_review_date IS NULL OR next_review_date <= CURRENT_DATE)`
    );
    return result.rows;
  }

  /**
   * Get provider risk score history.
   */
  async getProviderScoreHistory(providerId, months = 12) {
    const result = await query(
      `SELECT * FROM provider_risk_scores
       WHERE provider_id = $1
       ORDER BY period_end DESC
       LIMIT $2`,
      [providerId, months]
    );
    return result.rows;
  }

  /**
   * Get providers by traffic light status.
   */
  async getProvidersByStatus(trafficLight) {
    const result = await query(
      `SELECT p.*, prs.composite_score, prs.traffic_light,
              prs.repayment_score, prs.cost_variance_score,
              prs.outcome_satisfaction_score, prs.volume_trend_score
       FROM providers p
       LEFT JOIN provider_risk_scores prs ON p.provider_id = prs.provider_id
         AND prs.period_end = (SELECT MAX(period_end) FROM provider_risk_scores WHERE provider_id = p.provider_id)
       WHERE p.status = 'active'
         AND ($1 IS NULL OR prs.traffic_light = $1)
       ORDER BY prs.composite_score ASC`,
      [trafficLight]
    );
    return result.rows;
  }
}

const providerGateService = new ProviderGateService();

module.exports = { ProviderGateService, providerGateService, TRUST_TIERS, HARD_RULES };
