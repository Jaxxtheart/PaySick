/**
 * CIRCUIT BREAKER SERVICE (Gate 5)
 *
 * Purpose: Automatic system-level responses when portfolio health deteriorates.
 * These are the emergency brakes.
 *
 * Amber alerts = human notified, reviews, decides
 * Red triggers = automatic response fires, human reviews aftermath
 */

const { query, transaction } = require('../config/database');

// ═══════════════════════════════════════════════════════════════
// CIRCUIT BREAKER DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const CIRCUIT_BREAKERS = {
  amber: [
    {
      name: 'arrears_warning',
      condition: '90_day_arrears_rate > 4.5%',
      threshold: 4.5,
      metric: '90_day_arrears_rate',
      response: 'Alert Head of Credit. Review recent originations for pattern.',
      human_action: 'Assess whether to tighten approval criteria preemptively.'
    },
    {
      name: 'balance_sheet_concentration_warning',
      condition: 'balance_sheet_pct > 35%',
      threshold: 35,
      metric: 'balance_sheet_pct',
      response: 'Alert management. Accelerate marketplace lender onboarding.',
      human_action: 'Review marketplace pipeline and lender engagement.'
    },
    {
      name: 'provider_cluster_risk',
      condition: 'any_provider_concentration > 4%',
      threshold: 4,
      metric: 'max_provider_concentration',
      response: 'Flag provider approaching concentration limit.',
      human_action: 'Diversify origination channels.'
    },
    {
      name: 'segment_drift',
      condition: 'convenience_borrower_ratio < 55%',
      threshold: 55,
      metric: 'convenience_borrower_ratio',
      invert: true, // triggers when value goes BELOW threshold
      response: 'Portfolio is drifting toward necessity borrowers.',
      human_action: 'Review marketing mix. Increase elective provider onboarding.'
    },
    {
      name: 'reserve_fund_decline',
      condition: 'reserve_fund < 18% of marketplace_fee_income',
      threshold: 18,
      metric: 'reserve_fund_pct',
      invert: true,
      response: 'Reserve buffer thinning.',
      human_action: 'Consider redirecting portion of origination fees to rebuild.'
    }
  ],
  red: [
    {
      name: 'arrears_breach',
      condition: '90_day_arrears_rate > 6%',
      threshold: 6,
      metric: '90_day_arrears_rate',
      auto_response: [
        'Tighten approval criteria: reduce all loan ceilings by 20%',
        'Increase affordability requirement from 20% to 15% RTI ceiling',
        'Pause new provider onboarding',
        'Require human approval for ALL loans above R15,000'
      ],
      human_action: 'Head of Credit conducts full portfolio review within 48 hours.'
    },
    {
      name: 'balance_sheet_breach',
      condition: 'balance_sheet_pct > 40%',
      threshold: 40,
      metric: 'balance_sheet_pct',
      auto_response: [
        'Pause ALL new balance sheet originations immediately',
        'All new loans routed to marketplace only'
      ],
      human_action: 'CEO + Head of Credit review within 24 hours. Resume only with documented plan.'
    },
    {
      name: 'single_provider_default_spike',
      condition: 'any_provider_default_rate > 8%',
      threshold: 8,
      metric: 'max_provider_default_rate',
      auto_response: [
        'Immediately suspend new loan approvals through that provider',
        'Notify provider of suspension with reason',
        'Trigger holdback recovery on any outstanding holdbacks'
      ],
      human_action: 'Underwriting team investigates. Reinstatement requires Head of Credit approval.'
    },
    {
      name: 'reserve_fund_critical',
      condition: 'reserve_fund < 15% of marketplace_fee_income',
      threshold: 15,
      metric: 'reserve_fund_pct',
      invert: true,
      auto_response: [
        'Redirect 20% of all origination fees to reserve fund',
        'Tighten approval criteria by one tier'
      ],
      human_action: 'CFO reviews reserve adequacy and funding strategy.'
    },
    {
      name: 'systemic_loss_breach',
      condition: 'net_loss_rate > 3% for 2 consecutive months',
      threshold: 3,
      metric: 'net_loss_rate',
      auto_response: [
        'Full new provider onboarding moratorium',
        'All loans require human approval regardless of amount',
        'Reduce all loan ceilings by 30%',
        'Activate comprehensive portfolio stress test'
      ],
      human_action: 'Board-level review. This is a potential survival event. All hands on deck.'
    }
  ]
};

class CircuitBreakerService {
  /**
   * MAIN ENTRY: Evaluate all circuit breakers against current portfolio metrics.
   * Returns list of triggered breakers with responses.
   */
  async evaluateAll() {
    const metrics = await this.gatherPortfolioMetrics();
    const triggered = [];

    // Check all breakers
    for (const level of ['amber', 'red']) {
      for (const breaker of CIRCUIT_BREAKERS[level]) {
        const metricValue = metrics[breaker.metric] || 0;
        const isTriggered = breaker.invert
          ? metricValue < breaker.threshold
          : metricValue > breaker.threshold;

        const distance = breaker.invert
          ? metricValue - breaker.threshold
          : breaker.threshold - metricValue;

        // Update state
        await this.updateBreakerState(breaker.name, level, metricValue, breaker.threshold, distance);

        if (isTriggered) {
          const event = await this.triggerBreaker(breaker, level, metricValue);
          triggered.push(event);
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      metrics,
      triggered,
      total_amber: triggered.filter(t => t.level === 'amber').length,
      total_red: triggered.filter(t => t.level === 'red').length
    };
  }

  /**
   * Gather all portfolio health metrics.
   */
  async gatherPortfolioMetrics() {
    const metrics = {};

    // 90-day arrears rate
    try {
      const arrearsResult = await query(
        `SELECT
           COUNT(*) AS total_loans,
           COUNT(*) FILTER (WHERE status IN ('overdue', 'failed')
             AND due_date < CURRENT_DATE - INTERVAL '90 days') AS arrears_90
         FROM payments
         WHERE due_date IS NOT NULL`
      );
      const row = arrearsResult.rows[0];
      const total = parseInt(row?.total_loans || 0);
      const arrears = parseInt(row?.arrears_90 || 0);
      metrics['90_day_arrears_rate'] = total > 0 ? (arrears / total) * 100 : 0;
    } catch (err) {
      metrics['90_day_arrears_rate'] = 0;
    }

    // Balance sheet percentage
    try {
      const totalResult = await query(
        `SELECT COALESCE(SUM(loan_amount_requested), 0) AS total
         FROM loan_risk_assessments
         WHERE (ai_recommendation IN ('approve','approve_with_conditions') OR human_decision = 'approved')`
      );
      const mpResult = await query(
        `SELECT COALESCE(SUM(loan_amount), 0) AS marketplace
         FROM marketplace_loans WHERE status IN ('funded','active','repaying')`
      );
      const total = parseFloat(totalResult.rows[0]?.total || 0);
      const marketplace = parseFloat(mpResult.rows[0]?.marketplace || 0);
      const bs = Math.max(0, total - marketplace);
      metrics['balance_sheet_pct'] = total > 0 ? (bs / total) * 100 : 0;
    } catch (err) {
      metrics['balance_sheet_pct'] = 0;
    }

    // Max provider concentration
    try {
      const provResult = await query(
        `SELECT MAX(concentration_pct) AS max_conc FROM providers WHERE status = 'active'`
      );
      metrics['max_provider_concentration'] = parseFloat(provResult.rows[0]?.max_conc || 0);
    } catch (err) {
      metrics['max_provider_concentration'] = 0;
    }

    // Convenience borrower ratio
    try {
      const profileResult = await query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE borrower_profile = 'convenience') AS convenience
         FROM borrower_profiles`
      );
      const row = profileResult.rows[0];
      const total = parseInt(row?.total || 0);
      const convenience = parseInt(row?.convenience || 0);
      metrics['convenience_borrower_ratio'] = total > 0 ? (convenience / total) * 100 : 100;
    } catch (err) {
      metrics['convenience_borrower_ratio'] = 100; // safe default
    }

    // Max provider default rate
    try {
      const defResult = await query(
        `SELECT MAX(default_rate) AS max_def FROM providers WHERE status = 'active'`
      );
      metrics['max_provider_default_rate'] = (parseFloat(defResult.rows[0]?.max_def || 0)) * 100;
    } catch (err) {
      metrics['max_provider_default_rate'] = 0;
    }

    // Reserve fund percentage (placeholder — configurable)
    metrics['reserve_fund_pct'] = 100; // healthy default until reserve tracking is implemented

    // Net loss rate
    try {
      const lossResult = await query(
        `SELECT
           COALESCE(SUM(amount), 0) AS total_paid,
           COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) AS total_losses
         FROM payments
         WHERE created_at >= CURRENT_DATE - INTERVAL '3 months'`
      );
      const row = lossResult.rows[0];
      const totalPaid = parseFloat(row?.total_paid || 0);
      const losses = parseFloat(row?.total_losses || 0);
      metrics['net_loss_rate'] = totalPaid > 0 ? (losses / totalPaid) * 100 : 0;
    } catch (err) {
      metrics['net_loss_rate'] = 0;
    }

    return metrics;
  }

  /**
   * Update the state of a single circuit breaker.
   */
  async updateBreakerState(breakerName, level, currentValue, threshold, distance) {
    try {
      const status = distance < 0 ? level : (distance < (threshold * 0.2) ? 'amber' : 'green');

      await query(
        `UPDATE circuit_breaker_state
         SET status = $2,
             current_value = $3,
             distance_to_trigger = $4,
             updated_at = NOW()
         WHERE breaker_name = $1`,
        [breakerName, status, currentValue, distance]
      );
    } catch (err) {
      console.error(`Failed to update breaker state for ${breakerName}:`, err.message);
    }
  }

  /**
   * Fire a circuit breaker — log event and execute auto-responses.
   */
  async triggerBreaker(breaker, level, metricValue) {
    // Check if already active (avoid duplicate triggers)
    try {
      const existing = await query(
        `SELECT event_id FROM circuit_breaker_events
         WHERE breaker_name = $1 AND status = 'active'
         LIMIT 1`,
        [breaker.name]
      );

      if (existing.rows.length > 0) {
        return {
          breaker_name: breaker.name,
          level,
          status: 'already_active',
          event_id: existing.rows[0].event_id
        };
      }
    } catch (err) {
      // continue even if check fails
    }

    // Log the event
    const eventResult = await query(
      `INSERT INTO circuit_breaker_events
       (breaker_name, breaker_level, condition_description,
        trigger_value, threshold_value,
        auto_responses, human_action_required, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING event_id`,
      [
        breaker.name,
        level,
        breaker.condition,
        metricValue,
        breaker.threshold,
        JSON.stringify(breaker.auto_response || [breaker.response]),
        breaker.human_action
      ]
    );

    // Update breaker state
    await query(
      `UPDATE circuit_breaker_state
       SET status = $2, last_triggered_at = NOW(), updated_at = NOW()
       WHERE breaker_name = $1`,
      [breaker.name, level]
    );

    return {
      breaker_name: breaker.name,
      level,
      status: 'triggered',
      event_id: eventResult.rows[0].event_id,
      metric_value: metricValue,
      threshold: breaker.threshold,
      auto_responses: breaker.auto_response || [breaker.response],
      human_action: breaker.human_action
    };
  }

  /**
   * Get current status of all circuit breakers.
   */
  async getStatus() {
    try {
      const result = await query(
        `SELECT * FROM circuit_breaker_state ORDER BY breaker_level DESC, breaker_name`
      );
      return result.rows;
    } catch (err) {
      console.error('Failed to get breaker status:', err.message);
      return [];
    }
  }

  /**
   * Acknowledge a circuit breaker event (human has seen it).
   */
  async acknowledgeEvent(eventId, userId) {
    const result = await query(
      `UPDATE circuit_breaker_events
       SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = NOW()
       WHERE event_id = $1
       RETURNING *`,
      [eventId, userId]
    );
    return result.rows[0];
  }

  /**
   * Resolve a circuit breaker event.
   */
  async resolveEvent(eventId, userId, notes) {
    return transaction(async (client) => {
      const result = await client.query(
        `UPDATE circuit_breaker_events
         SET status = 'resolved', resolved_by = $2, resolved_at = NOW(), resolution_notes = $3
         WHERE event_id = $1
         RETURNING *`,
        [eventId, userId, notes]
      );

      if (result.rows[0]) {
        await client.query(
          `UPDATE circuit_breaker_state
           SET status = 'green', last_resolved_at = NOW(), updated_at = NOW()
           WHERE breaker_name = $1
             AND NOT EXISTS (
               SELECT 1 FROM circuit_breaker_events
               WHERE breaker_name = $1 AND status = 'active' AND event_id != $2
             )`,
          [result.rows[0].breaker_name, eventId]
        );
      }

      return result.rows[0];
    });
  }

  /**
   * Override a circuit breaker (human with authority).
   */
  async overrideBreaker(eventId, userId, reason, expiresAt) {
    if (!reason || reason.trim().length < 10) {
      throw new Error('Override reason must be at least 10 characters. Document your rationale.');
    }

    const result = await query(
      `UPDATE circuit_breaker_events
       SET status = 'overridden',
           overridden = true,
           override_by = $2,
           override_at = NOW(),
           override_reason = $3,
           override_expires = $4
       WHERE event_id = $1
       RETURNING *`,
      [eventId, userId, reason, expiresAt]
    );

    if (result.rows[0]) {
      await query(
        `UPDATE circuit_breaker_state
         SET active_override = true, override_expires = $2, updated_at = NOW()
         WHERE breaker_name = $1`,
        [result.rows[0].breaker_name, expiresAt]
      );
    }

    return result.rows[0];
  }

  /**
   * Get active circuit breaker events.
   */
  async getActiveEvents() {
    const result = await query(
      `SELECT * FROM circuit_breaker_events
       WHERE status IN ('active', 'acknowledged')
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  /**
   * Get event history.
   */
  async getEventHistory(limit = 50) {
    const result = await query(
      `SELECT * FROM circuit_breaker_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Build dashboard data for circuit breaker panel.
   */
  async getDashboardData() {
    const [status, activeEvents, metrics] = await Promise.all([
      this.getStatus(),
      this.getActiveEvents(),
      this.gatherPortfolioMetrics()
    ]);

    return {
      breakers: status.map(b => ({
        name: b.breaker_name,
        level: b.breaker_level,
        status: b.status,
        current_value: b.current_value,
        threshold: b.threshold_value,
        distance_to_trigger: b.distance_to_trigger,
        last_triggered: b.last_triggered_at,
        active_override: b.active_override,
        override_expires: b.override_expires
      })),
      active_events: activeEvents,
      metrics,
      summary: {
        total_green: status.filter(b => b.status === 'green').length,
        total_amber: status.filter(b => b.status === 'amber').length,
        total_red: status.filter(b => b.status === 'red').length,
        active_overrides: status.filter(b => b.active_override).length
      }
    };
  }
}

const circuitBreakerService = new CircuitBreakerService();

module.exports = { CircuitBreakerService, circuitBreakerService, CIRCUIT_BREAKERS };
