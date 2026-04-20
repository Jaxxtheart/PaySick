/**
 * UNDERWRITING ROUTES — Shield Framework v5.0
 *
 * All endpoints enforce:
 *   - Authentication (authenticateToken)
 *   - Admin role where required (requireAdmin)
 *   - X-Robots-Tag header (anti-crawling)
 *   - Input validation (400 for missing/invalid fields)
 *
 * Language rules: no "loan", "credit", "lend", "borrow", "interest rate", "principal".
 */

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth.middleware');
const underwritingService = require('../services/underwriting.service');

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-CRAWLING MIDDLEWARE — applies to all routes in this router
// ─────────────────────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 1 — DSP STATUS CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/underwriting/dsp-check
 * Verify provider DSP status against the registry and update application.
 */
router.post('/v1/underwriting/dsp-check', authenticateToken, async (req, res) => {
  try {
    const { application_id, provider_hpcsa_number, patient_scheme_code, patient_plan_code } = req.body;

    if (!application_id || !provider_hpcsa_number || !patient_scheme_code || !patient_plan_code) {
      return res.status(400).json({
        error: 'Missing required fields: application_id, provider_hpcsa_number, patient_scheme_code, patient_plan_code'
      });
    }

    const result = await underwritingService.dspCheck(
      application_id,
      provider_hpcsa_number,
      patient_scheme_code,
      patient_plan_code
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error('DSP check error:', err.message);
    return res.status(500).json({ error: 'DSP status check failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 2 — FACILITATION CEILING CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/underwriting/calculate-ceiling
 * Calculate tariff-anchored facilitation ceiling for a procedure.
 */
router.post('/v1/underwriting/calculate-ceiling', authenticateToken, async (req, res) => {
  try {
    const { application_id, procedure_code, metro_region, coverage_multiplier, provider_submitted_amount } = req.body;

    if (!application_id || !procedure_code || !metro_region ||
        coverage_multiplier === undefined || coverage_multiplier === null ||
        provider_submitted_amount === undefined || provider_submitted_amount === null) {
      return res.status(400).json({
        error: 'Missing required fields: application_id, procedure_code, metro_region, coverage_multiplier, provider_submitted_amount'
      });
    }

    const result = await underwritingService.calculateCeiling(
      application_id,
      procedure_code,
      metro_region,
      parseFloat(coverage_multiplier),
      parseFloat(provider_submitted_amount)
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error('Ceiling calculation error:', err.message);
    return res.status(500).json({ error: 'Facilitation ceiling calculation failed. Please try again.' });
  }
});

/**
 * GET /api/v1/underwriting/procedure-benchmark
 * Look up benchmark cost for a procedure code and region.
 */
router.get('/v1/underwriting/procedure-benchmark', authenticateToken, async (req, res) => {
  try {
    const { procedure_code, metro_region } = req.query;

    if (!procedure_code) {
      return res.status(400).json({ error: 'Missing required query param: procedure_code' });
    }

    const result = await query(
      `SELECT id, procedure_code, procedure_name, specialty, metro_region,
              benchmark_cost_100pct, benchmark_source, effective_from, last_updated_at
       FROM procedure_benchmarks
       WHERE procedure_code = $1
         AND ($2::TEXT IS NULL OR metro_region = $2)
         AND effective_to IS NULL
       ORDER BY metro_region NULLS LAST
       LIMIT 10`,
      [procedure_code, metro_region || null]
    );

    return res.status(200).json({ benchmarks: result.rows });
  } catch (err) {
    console.error('Benchmark lookup error:', err.message);
    return res.status(500).json({ error: 'Benchmark lookup failed. Please try again.' });
  }
});

/**
 * POST /api/admin/procedure-benchmarks
 * Create or update a procedure benchmark (admin only).
 */
router.post('/admin/procedure-benchmarks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      procedure_code, procedure_name, specialty, metro_region,
      benchmark_cost_100pct, benchmark_source, effective_from
    } = req.body;

    if (!procedure_code || !procedure_name || !benchmark_cost_100pct || !effective_from) {
      return res.status(400).json({
        error: 'Missing required fields: procedure_code, procedure_name, benchmark_cost_100pct, effective_from'
      });
    }

    const result = await query(
      `INSERT INTO procedure_benchmarks
         (procedure_code, procedure_name, specialty, metro_region,
          benchmark_cost_100pct, benchmark_source, effective_from, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (procedure_code, metro_region, effective_from)
       DO UPDATE SET
         procedure_name = EXCLUDED.procedure_name,
         benchmark_cost_100pct = EXCLUDED.benchmark_cost_100pct,
         benchmark_source = EXCLUDED.benchmark_source,
         last_updated_at = NOW(),
         updated_by = EXCLUDED.updated_by
       RETURNING *`,
      [procedure_code, procedure_name, specialty, metro_region,
       benchmark_cost_100pct, benchmark_source, effective_from, req.user.email || 'admin']
    );

    return res.status(201).json({ benchmark: result.rows[0] });
  } catch (err) {
    console.error('Benchmark upsert error:', err.message);
    return res.status(500).json({ error: 'Failed to save benchmark. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 3 — PROVIDER BILLING AGREEMENT GATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/providers/:providerId/billing-agreement-status
 * Check provider billing agreement status and gap financing eligibility.
 */
router.get('/v1/providers/:providerId/billing-agreement-status', authenticateToken, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { segment } = req.query;

    const result = await underwritingService.checkBillingAgreement(
      providerId,
      segment || 'SEGMENT_1'
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error('Billing agreement check error:', err.message);
    return res.status(500).json({ error: 'Billing agreement status check failed. Please try again.' });
  }
});

/**
 * POST /api/admin/providers/:providerId/billing-agreement
 * Create a new billing agreement for a provider (admin only).
 */
router.post('/admin/providers/:providerId/billing-agreement', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { agreement_version, signed_by_name, signed_by_role, effective_from, billing_cap_multiplier } = req.body;

    if (!agreement_version || !effective_from) {
      return res.status(400).json({
        error: 'Missing required fields: agreement_version, effective_from'
      });
    }

    const result = await query(
      `INSERT INTO provider_billing_agreements
         (provider_id, agreement_version, status, billing_cap_multiplier,
          signed_at, signed_by_name, signed_by_role, effective_from)
       VALUES ($1, $2, 'ACTIVE', $3, NOW(), $4, $5, $6)
       RETURNING *`,
      [providerId, agreement_version, billing_cap_multiplier || 3.00,
       signed_by_name, signed_by_role, effective_from]
    );

    // Update provider record
    await query(
      `UPDATE providers
       SET gap_financing_enabled = TRUE, billing_agreement_id = $1, billing_agreement_checked_at = NOW()
       WHERE provider_id = $2`,
      [result.rows[0].id, providerId]
    );

    return res.status(201).json({ agreement: result.rows[0] });
  } catch (err) {
    console.error('Billing agreement create error:', err.message);
    return res.status(500).json({ error: 'Failed to create billing agreement. Please try again.' });
  }
});

/**
 * POST /api/admin/providers/:providerId/billing-agreement/suspend
 * Suspend a provider's billing agreement (admin only).
 */
router.post('/admin/providers/:providerId/billing-agreement/suspend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { providerId } = req.params;
    const { suspension_reason } = req.body;

    if (!suspension_reason) {
      return res.status(400).json({ error: 'Missing required field: suspension_reason' });
    }

    const result = await query(
      `UPDATE provider_billing_agreements
       SET status = 'SUSPENDED',
           suspension_reason = $1,
           suspended_at = NOW(),
           suspended_by = $2
       WHERE provider_id = $3
         AND status = 'ACTIVE'
       RETURNING *`,
      [suspension_reason, req.user.email || 'admin', providerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active billing agreement found for this provider.' });
    }

    return res.status(200).json({ agreement: result.rows[0], status: 'SUSPENDED' });
  } catch (err) {
    console.error('Billing agreement suspend error:', err.message);
    return res.status(500).json({ error: 'Failed to suspend billing agreement. Please try again.' });
  }
});

/**
 * POST /api/admin/providers/:providerId/billing-agreement/reinstate
 * Reinstate a suspended billing agreement (admin only).
 */
router.post('/admin/providers/:providerId/billing-agreement/reinstate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { providerId } = req.params;

    const result = await query(
      `UPDATE provider_billing_agreements
       SET status = 'ACTIVE',
           suspension_reason = NULL,
           suspended_at = NULL,
           suspended_by = NULL
       WHERE provider_id = $1
         AND status = 'SUSPENDED'
       RETURNING *`,
      [providerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No suspended billing agreement found for this provider.' });
    }

    return res.status(200).json({ agreement: result.rows[0], status: 'ACTIVE' });
  } catch (err) {
    console.error('Billing agreement reinstate error:', err.message);
    return res.status(500).json({ error: 'Failed to reinstate billing agreement. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 4 — TARIFF DISCLOSURE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/underwriting/disclosure/create
 * Create a tariff disclosure record for patient acknowledgement.
 */
router.post('/v1/underwriting/disclosure/create', authenticateToken, async (req, res) => {
  try {
    const { application_id, patient_id, dsp_status, estimated_gap, provider_amount, benchmark } = req.body;

    if (!application_id || !patient_id || !dsp_status ||
        estimated_gap === undefined || provider_amount === undefined || benchmark === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: application_id, patient_id, dsp_status, estimated_gap, provider_amount, benchmark'
      });
    }

    const result = await underwritingService.createDisclosure(
      application_id,
      patient_id,
      dsp_status,
      parseFloat(estimated_gap),
      parseFloat(provider_amount),
      parseFloat(benchmark)
    );

    return res.status(201).json(result);
  } catch (err) {
    console.error('Disclosure create error:', err.message);
    return res.status(500).json({ error: 'Failed to create tariff disclosure. Please try again.' });
  }
});

/**
 * POST /api/v1/underwriting/disclosure/:disclosureId/acknowledge
 * Patient acknowledges the tariff disclosure.
 */
router.post('/v1/underwriting/disclosure/:disclosureId/acknowledge', authenticateToken, async (req, res) => {
  try {
    const { disclosureId } = req.params;
    const { application_id, patient_id, method, ip_address, user_agent, session_id } = req.body;

    if (!application_id || !patient_id || !method) {
      return res.status(400).json({
        error: 'Missing required fields: application_id, patient_id, method'
      });
    }

    const result = await underwritingService.acknowledgeDisclosure(
      parseInt(disclosureId),
      application_id,
      patient_id,
      method,
      ip_address || req.ip,
      user_agent || req.get('User-Agent'),
      session_id
    );

    return res.status(200).json(result);
  } catch (err) {
    console.error('Disclosure acknowledge error:', err.message);
    return res.status(500).json({ error: 'Failed to acknowledge disclosure. Please try again.' });
  }
});

/**
 * GET /api/v1/underwriting/disclosure/gate-check/:applicationId
 * Check if application has acknowledged disclosure (gate for APPROVED transition).
 */
router.get('/v1/underwriting/disclosure/gate-check/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const result = await underwritingService.checkDisclosureGate(applicationId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Disclosure gate check error:', err.message);
    return res.status(500).json({ error: 'Disclosure gate check failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 5 — EOB SUBMISSION & PAYOUT RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/payouts/trigger-provisional
 * Trigger the provisional payout (80% of facilitation ceiling) to the provider.
 */
router.post('/v1/payouts/trigger-provisional', authenticateToken, async (req, res) => {
  try {
    const { application_id } = req.body;

    if (!application_id) {
      return res.status(400).json({ error: 'Missing required field: application_id' });
    }

    const result = await underwritingService.triggerProvisionalPayout(application_id);
    return res.status(201).json(result);
  } catch (err) {
    console.error('Provisional payout error:', err.message);
    return res.status(500).json({ error: 'Failed to trigger provisional payout. Please try again.' });
  }
});

/**
 * POST /api/v1/payouts/submit-eob
 * Provider submits EOB documentation for reconciliation.
 */
router.post('/v1/payouts/submit-eob', authenticateToken, async (req, res) => {
  try {
    const { application_id, provider_id, invoice_amount, eob_amount, invoice_url, eob_url, submitted_by } = req.body;

    if (!application_id || !provider_id || invoice_amount === undefined || invoice_amount === null ||
        eob_amount === undefined || eob_amount === null) {
      return res.status(400).json({
        error: 'Missing required fields: application_id, provider_id, invoice_amount, eob_amount'
      });
    }

    const result = await underwritingService.submitEob(
      application_id,
      provider_id,
      parseFloat(invoice_amount),
      parseFloat(eob_amount),
      invoice_url,
      eob_url,
      submitted_by || req.user.email
    );

    return res.status(201).json(result);
  } catch (err) {
    console.error('EOB submit error:', err.message);
    return res.status(500).json({ error: 'Failed to submit EOB documentation. Please try again.' });
  }
});

/**
 * POST /api/v1/payouts/reconcile
 * Reconcile EOB and trigger final payout (admin only).
 */
router.post('/v1/payouts/reconcile', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { application_id } = req.body;

    if (!application_id) {
      return res.status(400).json({ error: 'Missing required field: application_id' });
    }

    const result = await underwritingService.reconcileEob(application_id);
    return res.status(200).json(result);
  } catch (err) {
    console.error('EOB reconciliation error:', err.message);
    return res.status(500).json({ error: 'EOB reconciliation failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — REVIEW QUEUE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/underwriting/review-queue
 * Get the manual underwriting review queue (admin only).
 */
router.get('/admin/underwriting/review-queue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, priority, review_type, limit: limitParam, offset: offsetParam } = req.query;
    const limit = Math.min(parseInt(limitParam) || 50, 200);
    const offset = parseInt(offsetParam) || 0;

    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    } else {
      conditions.push(`status IN ('OPEN', 'IN_PROGRESS')`);
    }

    if (priority) {
      params.push(priority);
      conditions.push(`priority = $${params.length}`);
    }

    if (review_type) {
      params.push(review_type);
      conditions.push(`review_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const result = await query(
      `SELECT id, application_id, provider_id, review_type, priority, sla_hours,
              status, assigned_to, opened_at, sla_deadline, resolved_at, resolution_decision
       FROM manual_review_queue
       ${whereClause}
       ORDER BY
         CASE priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'STANDARD' THEN 3 ELSE 4 END,
         sla_deadline ASC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM manual_review_queue ${whereClause}`,
      params.slice(0, params.length - 2)
    );

    return res.status(200).json({
      queue: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit,
      offset
    });
  } catch (err) {
    console.error('Review queue fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch review queue. Please try again.' });
  }
});

/**
 * POST /api/admin/underwriting/review-queue/:id/resolve
 * Resolve a manual review queue item (admin only).
 */
router.post('/admin/underwriting/review-queue/:id/resolve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_decision, resolution_notes } = req.body;

    if (!resolution_decision) {
      return res.status(400).json({ error: 'Missing required field: resolution_decision' });
    }

    const result = await query(
      `UPDATE manual_review_queue
       SET status = 'RESOLVED',
           resolved_at = NOW(),
           resolved_by = $1,
           resolution_decision = $2,
           resolution_notes = $3
       WHERE id = $4
       RETURNING *`,
      [req.user.email || 'admin', resolution_decision, resolution_notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Review queue item not found.' });
    }

    return res.status(200).json({ item: result.rows[0] });
  } catch (err) {
    console.error('Review queue resolve error:', err.message);
    return res.status(500).json({ error: 'Failed to resolve review queue item. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — EOB RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/eob-reconciliation
 * Get pending EOB submissions awaiting reconciliation (admin only).
 */
router.get('/admin/eob-reconciliation', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, limit: limitParam, offset: offsetParam } = req.query;
    const limit = Math.min(parseInt(limitParam) || 50, 200);
    const offset = parseInt(offsetParam) || 0;

    const eobStatus = status || 'PENDING';

    const result = await query(
      `SELECT e.id, e.application_id, e.provider_id, e.submitted_at, e.submitted_by,
              e.provider_invoice_amount, e.scheme_eob_amount, e.scheme_residual_amount,
              e.reconciliation_status, e.final_payout_amount, e.variance_from_approved,
              a.facilitation_ceiling
       FROM eob_submissions e
       JOIN applications a ON e.application_id = a.application_id
       WHERE e.reconciliation_status = $1
       ORDER BY e.submitted_at ASC
       LIMIT $2 OFFSET $3`,
      [eobStatus, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM eob_submissions WHERE reconciliation_status = $1`,
      [eobStatus]
    );

    return res.status(200).json({
      submissions: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit,
      offset
    });
  } catch (err) {
    console.error('EOB reconciliation list error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch EOB submissions. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — BENCHMARKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/benchmarks
 * List all procedure benchmarks (admin only).
 */
router.get('/admin/benchmarks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { procedure_code, metro_region, limit: limitParam, offset: offsetParam } = req.query;
    const limit = Math.min(parseInt(limitParam) || 100, 500);
    const offset = parseInt(offsetParam) || 0;

    const conditions = [];
    const params = [];

    if (procedure_code) {
      params.push(procedure_code);
      conditions.push(`procedure_code = $${params.length}`);
    }

    if (metro_region) {
      params.push(metro_region);
      conditions.push(`metro_region = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const result = await query(
      `SELECT id, procedure_code, procedure_name, specialty, metro_region,
              benchmark_cost_100pct, benchmark_source, effective_from, effective_to, last_updated_at, updated_by
       FROM procedure_benchmarks
       ${whereClause}
       ORDER BY procedure_code, metro_region, effective_from DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM procedure_benchmarks ${whereClause}`,
      params.slice(0, params.length - 2)
    );

    return res.status(200).json({
      benchmarks: result.rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      limit,
      offset
    });
  } catch (err) {
    console.error('Benchmark list error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch benchmarks. Please try again.' });
  }
});

module.exports = router;
