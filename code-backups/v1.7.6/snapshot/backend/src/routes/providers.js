const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { encryptBankingData } = require('../services/security.service');
const { calculateProviderSettlement, PROVIDER_SERVICE_FEE_PCT } = require('../services/fee.service');
const { ProviderMessagingService, PROVIDER_MESSAGE_TYPES } = require('../services/provider-messaging.service');

const providerMessaging = new ProviderMessagingService();

// Get all providers (public — active only, no banking details)
router.get('/', async (req, res) => {
  try {
    const { network_partner, provider_type, city } = req.query;

    let queryText = 'SELECT * FROM providers WHERE status = $1';
    const params = ['active'];
    let paramCount = 1;

    if (network_partner !== undefined) {
      paramCount++;
      queryText += ` AND network_partner = $${paramCount}`;
      params.push(network_partner === 'true');
    }

    if (provider_type) {
      paramCount++;
      queryText += ` AND provider_type = $${paramCount}`;
      params.push(provider_type);
    }

    if (city) {
      paramCount++;
      queryText += ` AND city ILIKE $${paramCount}`;
      params.push(`%${city}%`);
    }

    queryText += ' ORDER BY provider_name ASC';

    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Providers fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Search providers — must be defined BEFORE /:id so Express doesn't
// match the literal string "search" as a provider UUID.
router.get('/search/:term', async (req, res) => {
  try {
    const searchTerm = `%${req.params.term}%`;
    const result = await query(
      `SELECT * FROM providers
       WHERE status = 'active'
         AND (provider_name ILIKE $1 OR provider_group ILIKE $1 OR city ILIKE $1)
       ORDER BY network_partner DESC, provider_name ASC
       LIMIT 20`,
      [searchTerm]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Provider search error:', error);
    res.status(500).json({ error: 'Failed to search providers' });
  }
});

// Track CTA clicks for analytics (public — no auth required, never fails the caller)
router.post('/track-cta', async (req, res) => {
  try {
    const { source, timestamp, page } = req.body;

    await query(
      `INSERT INTO audit_log (
        user_id, action, table_name, record_id, details, ip_address
      ) VALUES (
        NULL, 'provider_cta_click', 'providers', NULL, $1, $2
      )`,
      [
        JSON.stringify({ source, page, timestamp }),
        req.ip || req.connection?.remoteAddress
      ]
    );

    // Best-effort stats — table may not exist yet
    try {
      await query(
        `INSERT INTO provider_cta_stats (source, clicks, date)
         VALUES ($1, 1, CURRENT_DATE)
         ON CONFLICT (source, date)
         DO UPDATE SET clicks = provider_cta_stats.clicks + 1`,
        [source]
      );
    } catch (_) {
      // Silently skip — audit_log already captured the event
    }

    res.json({ success: true });
  } catch (error) {
    console.error('CTA tracking error:', error);
    res.json({ success: true }); // Never block the caller
  }
});

// Provider application — submit new provider for review
router.post('/apply', async (req, res) => {
  try {
    const {
      provider_name,
      provider_type,
      provider_group,
      contact_email,
      contact_phone,
      address,
      city,
      province,
      postal_code,
      bank_name,
      branch_code,
      account_number,
      account_holder,
      terms_accepted,
      popia_consent,
      commission_agreement
    } = req.body;

    if (!provider_name || !provider_type || !contact_email || !contact_phone ||
        !address || !city || !province || !postal_code ||
        !bank_name || !branch_code || !account_number || !account_holder) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!terms_accepted || !popia_consent || !commission_agreement) {
      return res.status(400).json({ error: 'All consents must be accepted' });
    }

    // AES-256-GCM encryption for banking data (same key as user banking data)
    const account_number_encrypted = encryptBankingData(account_number);

    const result = await query(
      `INSERT INTO providers (
        provider_name, provider_type, provider_group,
        contact_email, contact_phone,
        address, city, province, postal_code,
        bank_name, branch_code, account_number_encrypted,
        status, network_partner
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', false)
      RETURNING provider_id`,
      [
        provider_name, provider_type, provider_group,
        contact_email, contact_phone,
        address, city, province, postal_code,
        bank_name, branch_code, account_number_encrypted
      ]
    );

    const providerId = result.rows[0].provider_id;

    // Trigger provider application received messaging (non-blocking)
    try {
      const template = providerMessaging.getTemplate(
        PROVIDER_MESSAGE_TYPES.provider_application_received,
        'email',
        { providerName: provider_name, applicationRef: providerId }
      );
      if (template) {
        await query(
          `INSERT INTO notifications (user_id, type, channel, subject, message, status, related_entity_type, related_entity_id)
           VALUES (NULL, $1, 'email', $2, $3, 'pending', 'provider', $4)`,
          ['provider_application_received', template.subject, template.body, providerId]
        ).catch(() => {}); // Best-effort
      }
    } catch (_) {
      // Never block the application on messaging failure
    }

    res.status(201).json({
      success: true,
      provider_id: providerId,
      message: 'Application submitted. We will contact you within 2 business days.'
    });

  } catch (error) {
    console.error('Provider application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// ============================================
// PROVIDER DASHBOARD ROUTES — require authentication + provider role
// ============================================

// Helper: resolve provider_id from the authenticated user
async function resolveProviderId(userId) {
  // First check provider_user_link table
  try {
    const linkResult = await query(
      'SELECT provider_id FROM provider_user_link WHERE user_id = $1 AND is_primary = true LIMIT 1',
      [userId]
    );
    if (linkResult.rows.length > 0) return linkResult.rows[0].provider_id;
  } catch (_) {
    // Table may not exist yet — fall through
  }

  // Fallback: check if user has provider_id on their user record
  const userResult = await query(
    'SELECT provider_id FROM users WHERE user_id = $1',
    [userId]
  );
  if (userResult.rows.length > 0 && userResult.rows[0].provider_id) {
    return userResult.rows[0].provider_id;
  }

  return null;
}

// Dashboard: Overview stats
router.get('/dashboard/overview', authenticateToken, requireRole('provider'), async (req, res) => {
  try {
    const providerId = req.user.provider_id || await resolveProviderId(req.user.user_id);
    if (!providerId) {
      return res.status(404).json({ error: 'No provider linked to this account' });
    }

    const result = await query(
      `SELECT
        COUNT(DISTINCT a.user_id)                                                   AS total_patients,
        COUNT(DISTINCT a.application_id)                                            AS total_applications,
        COALESCE(SUM(CASE WHEN a.status = 'approved' THEN a.approved_amount ELSE 0 END), 0)
                                                                                    AS total_revenue,
        COUNT(DISTINCT CASE WHEN pp.status = 'active' THEN pp.plan_id END)         AS active_plans,
        COUNT(DISTINCT CASE WHEN p.status IN ('overdue', 'failed') AND p.due_date < CURRENT_DATE
                             THEN p.payment_id END)                                 AS overdue_count,
        ROUND(AVG(CASE WHEN a.status = 'approved' THEN a.risk_score END), 0)       AS avg_risk_score,
        CASE WHEN COUNT(a.application_id) > 0
             THEN ROUND(
                  COUNT(CASE WHEN a.status = 'approved' THEN 1 END)::NUMERIC
                  / COUNT(a.application_id) * 100, 2)
             ELSE 0
        END                                                                         AS approval_rate
      FROM applications a
      LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
      LEFT JOIN payments p       ON pp.plan_id = p.plan_id
      WHERE a.provider_id = $1`,
      [providerId]
    );

    res.json(result.rows[0] || {
      total_patients: 0,
      total_applications: 0,
      total_revenue: 0,
      active_plans: 0,
      overdue_count: 0,
      avg_risk_score: null,
      approval_rate: 0
    });
  } catch (error) {
    console.error('Provider dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

// Dashboard: Patient list
router.get('/dashboard/patients', authenticateToken, requireRole('provider'), async (req, res) => {
  try {
    const providerId = req.user.provider_id || await resolveProviderId(req.user.user_id);
    if (!providerId) {
      return res.status(404).json({ error: 'No provider linked to this account' });
    }

    const result = await query(
      `SELECT
        u.full_name,
        a.treatment_type,
        a.bill_amount,
        COALESCE(pp.status, a.status)       AS plan_status,
        a.risk_score,
        COALESCE(pp.payments_made, 0)       AS payments_made,
        COALESCE(pp.outstanding_balance, 0) AS outstanding_balance,
        a.created_at                        AS application_date
      FROM applications a
      JOIN users u ON a.user_id = u.user_id
      LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
      WHERE a.provider_id = $1
      ORDER BY a.created_at DESC`,
      [providerId]
    );

    res.json({ patients: result.rows });
  } catch (error) {
    console.error('Provider dashboard patients error:', error);
    res.status(500).json({ error: 'Failed to fetch patient list' });
  }
});

// Dashboard: Settlements
router.get('/dashboard/settlements', authenticateToken, requireRole('provider'), async (req, res) => {
  try {
    const providerId = req.user.provider_id || await resolveProviderId(req.user.user_id);
    if (!providerId) {
      return res.status(404).json({ error: 'No provider linked to this account' });
    }

    const result = await query(
      `SELECT s.*,
              COUNT(si.item_id) AS line_items
       FROM settlements s
       LEFT JOIN settlement_items si ON s.settlement_id = si.settlement_id
       WHERE s.provider_id = $1
       GROUP BY s.settlement_id
       ORDER BY s.created_at DESC`,
      [providerId]
    );

    res.json({
      provider_id: providerId,
      service_fee_pct: 5,
      settlements: result.rows
    });
  } catch (error) {
    console.error('Provider dashboard settlements error:', error);
    res.status(500).json({ error: 'Failed to fetch settlements' });
  }
});

// Dashboard: Trust tier & score
router.get('/dashboard/trust-tier', authenticateToken, requireRole('provider'), async (req, res) => {
  try {
    const providerId = req.user.provider_id || await resolveProviderId(req.user.user_id);
    if (!providerId) {
      return res.status(404).json({ error: 'No provider linked to this account' });
    }

    // Get provider tier
    const providerResult = await query(
      'SELECT partnership_tier FROM providers WHERE provider_id = $1',
      [providerId]
    );

    const currentTier = providerResult.rows[0]?.partnership_tier || 'probation';

    // Get latest composite score (from provider_risk_scores if it exists)
    let compositeScore = null;
    try {
      const scoreResult = await query(
        `SELECT composite_score FROM provider_risk_scores
         WHERE provider_id = $1
         ORDER BY assessed_at DESC LIMIT 1`,
        [providerId]
      );
      compositeScore = scoreResult.rows[0]?.composite_score || null;
    } catch (_) {
      // Table may not exist yet
    }

    // Trust tier definitions (from provider-gate.service.js)
    const TRUST_TIERS = {
      probation: { per_patient_cap: 10000, payout_speed_days: 5, holdback_pct: 10, next: 'standard' },
      standard:  { per_patient_cap: 25000, payout_speed_days: 3, holdback_pct: 5, next: 'trusted' },
      trusted:   { per_patient_cap: 45000, payout_speed_days: 1, holdback_pct: 0, next: 'premium' },
      premium:   { per_patient_cap: 75000, payout_speed_days: 0, holdback_pct: 0, next: null }
    };

    const UPGRADE_CRITERIA = {
      probation: { min_months: 6, max_default_rate: 0.04, max_cost_variance: 0.20, min_completed_loans: 15, no_flags: true },
      standard:  { min_months: 12, max_default_rate: 0.025, min_completed_loans: 50, min_clean_months: 12, min_satisfaction: 85 },
      trusted:   { min_months: 18, invitation_only: true },
      premium:   null
    };

    const tierConfig = TRUST_TIERS[currentTier] || TRUST_TIERS.probation;

    res.json({
      current_tier: currentTier,
      composite_score: compositeScore,
      holdback_pct: tierConfig.holdback_pct,
      payout_speed_days: tierConfig.payout_speed_days,
      per_patient_cap: tierConfig.per_patient_cap,
      next_tier: tierConfig.next,
      upgrade_criteria: UPGRADE_CRITERIA[currentTier] || null
    });
  } catch (error) {
    console.error('Provider dashboard trust-tier error:', error);
    res.status(500).json({ error: 'Failed to fetch trust tier' });
  }
});

// Dashboard: Payment performance metrics
router.get('/dashboard/payment-performance', authenticateToken, requireRole('provider'), async (req, res) => {
  try {
    const providerId = req.user.provider_id || await resolveProviderId(req.user.user_id);
    if (!providerId) {
      return res.status(404).json({ error: 'No provider linked to this account' });
    }

    const result = await query(
      `SELECT
        COUNT(p.payment_id)                                                         AS total_payments,
        COUNT(CASE WHEN p.status = 'paid' THEN 1 END)                             AS on_time_count,
        COUNT(CASE WHEN p.status = 'failed' THEN 1 END)                           AS failed_count,
        COUNT(DISTINCT c.collection_id)                                             AS in_collections_count,
        ROUND(AVG(
            CASE WHEN p.status = 'paid' AND p.payment_date IS NOT NULL
                 THEN EXTRACT(EPOCH FROM (p.payment_date - p.due_date::timestamp)) / 86400
            END
        ), 1)                                                                       AS avg_days_to_pay
      FROM applications a
      JOIN payment_plans pp ON a.application_id = pp.application_id
      JOIN payments p ON pp.plan_id = p.plan_id
      LEFT JOIN collections c ON p.payment_id = c.payment_id
      WHERE a.provider_id = $1`,
      [providerId]
    );

    const row = result.rows[0] || {};
    const total = parseInt(row.total_payments) || 0;
    const onTime = parseInt(row.on_time_count) || 0;
    const failed = parseInt(row.failed_count) || 0;
    const inCollections = parseInt(row.in_collections_count) || 0;

    res.json({
      total_payments: total,
      on_time_count: onTime,
      on_time_rate: total > 0 ? parseFloat((onTime / total).toFixed(4)) : 0,
      failed_count: failed,
      failed_rate: total > 0 ? parseFloat((failed / total).toFixed(4)) : 0,
      in_collections_count: inCollections,
      collection_rate: total > 0 ? parseFloat((inCollections / total).toFixed(4)) : 0,
      avg_days_to_pay: parseFloat(row.avg_days_to_pay) || 0
    });
  } catch (error) {
    console.error('Provider dashboard payment-performance error:', error);
    res.status(500).json({ error: 'Failed to fetch payment performance' });
  }
});

// Dashboard: Monthly revenue breakdown
router.get('/dashboard/revenue-monthly', authenticateToken, requireRole('provider'), async (req, res) => {
  try {
    const providerId = req.user.provider_id || await resolveProviderId(req.user.user_id);
    if (!providerId) {
      return res.status(404).json({ error: 'No provider linked to this account' });
    }

    const result = await query(
      `SELECT
        TO_CHAR(a.created_at, 'YYYY-MM')                                           AS month,
        COALESCE(SUM(a.approved_amount), 0)                                         AS gross,
        COALESCE(SUM(a.approved_amount) * 0.95, 0)                                  AS net,
        COUNT(DISTINCT a.user_id)                                                   AS patient_count
      FROM applications a
      WHERE a.status = 'approved'
        AND a.provider_id = $1
      GROUP BY TO_CHAR(a.created_at, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12`,
      [providerId]
    );

    res.json({ months: result.rows });
  } catch (error) {
    console.error('Provider dashboard revenue-monthly error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly revenue' });
  }
});

// Get single provider (public — active only)
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM providers WHERE provider_id = $1 AND status = $2',
      [req.params.id, 'active']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Provider fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
});

// ============================================
// ADMIN ROUTES — require authentication + admin role
// ============================================

// Get all providers including pending (admin only)
router.get('/admin/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT
        provider_id, provider_name, provider_type, provider_group,
        contact_email, contact_phone, address, city, province, postal_code,
        network_partner, partnership_tier, status, created_at
      FROM providers
      ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Admin providers fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// Provider statistics (admin only)
router.get('/admin/stats', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_providers,
        COUNT(*) FILTER (WHERE status = 'active') AS active_providers,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_applications,
        COUNT(*) FILTER (WHERE network_partner = true) AS network_partners,
        COUNT(DISTINCT province) AS provinces_covered,
        COUNT(*) FILTER (WHERE provider_type = 'hospital') AS hospitals,
        COUNT(*) FILTER (WHERE provider_type = 'clinic') AS clinics,
        COUNT(*) FILTER (WHERE provider_type = 'gp_practice') AS gp_practices,
        COUNT(*) FILTER (WHERE provider_type = 'specialist') AS specialists
      FROM providers
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Provider stats error:', error);
    res.status(500).json({ error: 'Failed to fetch provider statistics' });
  }
});

// Approve provider application (admin only)
router.put('/admin/:id/approve', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { network_partner = false, partnership_tier = 'basic' } = req.body;

    const result = await query(
      `UPDATE providers
       SET status = 'active',
           network_partner = $1,
           partnership_tier = $2,
           onboarded_at = CURRENT_TIMESTAMP
       WHERE provider_id = $3
       RETURNING *`,
      [network_partner, partnership_tier, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const approvedProvider = result.rows[0];

    // Trigger provider approved messaging (non-blocking)
    try {
      const template = providerMessaging.getTemplate(
        PROVIDER_MESSAGE_TYPES.provider_application_approved,
        'email',
        {
          providerName: approvedProvider.provider_name,
          tier: partnership_tier,
          contactName: approvedProvider.provider_name
        }
      );
      if (template) {
        await query(
          `INSERT INTO notifications (user_id, type, channel, subject, message, status, related_entity_type, related_entity_id)
           VALUES (NULL, $1, 'email', $2, $3, 'pending', 'provider', $4)`,
          ['provider_application_approved', template.subject, template.body, id]
        ).catch(() => {});
      }
    } catch (_) {
      // Never block approval on messaging failure
    }

    res.json({
      success: true,
      message: 'Provider approved successfully',
      provider: approvedProvider
    });

  } catch (error) {
    console.error('Provider approval error:', error);
    res.status(500).json({ error: 'Failed to approve provider' });
  }
});

// Update provider status (admin only)
router.put('/admin/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await query(
      `UPDATE providers SET status = $1 WHERE provider_id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({
      success: true,
      message: 'Provider status updated',
      provider: result.rows[0]
    });

  } catch (error) {
    console.error('Provider status update error:', error);
    res.status(500).json({ error: 'Failed to update provider status' });
  }
});

// Update provider details (admin only)
router.put('/admin/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      provider_name,
      provider_type,
      provider_group,
      contact_email,
      contact_phone,
      address,
      city,
      province,
      postal_code,
      network_partner,
      partnership_tier,
      commission_rate
    } = req.body;

    const result = await query(
      `UPDATE providers SET
        provider_name = COALESCE($1, provider_name),
        provider_type = COALESCE($2, provider_type),
        provider_group = COALESCE($3, provider_group),
        contact_email = COALESCE($4, contact_email),
        contact_phone = COALESCE($5, contact_phone),
        address = COALESCE($6, address),
        city = COALESCE($7, city),
        province = COALESCE($8, province),
        postal_code = COALESCE($9, postal_code),
        network_partner = COALESCE($10, network_partner),
        partnership_tier = COALESCE($11, partnership_tier),
        commission_rate = COALESCE($12, commission_rate)
      WHERE provider_id = $13
      RETURNING *`,
      [
        provider_name, provider_type, provider_group,
        contact_email, contact_phone,
        address, city, province, postal_code,
        network_partner, partnership_tier, commission_rate,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({
      success: true,
      message: 'Provider updated successfully',
      provider: result.rows[0]
    });

  } catch (error) {
    console.error('Provider update error:', error);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// ============================================
// SETTLEMENT ROUTES — 5% provider service fee
// ============================================

// Get settlements for a provider (admin only)
router.get('/admin/:id/settlements', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT s.*,
              COUNT(si.item_id) AS line_items
       FROM settlements s
       LEFT JOIN settlement_items si ON s.settlement_id = si.settlement_id
       WHERE s.provider_id = $1
       GROUP BY s.settlement_id
       ORDER BY s.created_at DESC`,
      [id]
    );

    res.json({
      provider_id: id,
      service_fee_pct: PROVIDER_SERVICE_FEE_PCT * 100,
      settlements: result.rows
    });
  } catch (error) {
    console.error('Settlements fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch settlements' });
  }
});

// Create a settlement for a provider (admin only)
// Applies the 5% provider service fee: net_amount = gross_amount * 0.95
router.post('/admin/:id/settle', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { period_start, period_end, application_ids } = req.body;

    if (!period_start || !period_end || !Array.isArray(application_ids) || application_ids.length === 0) {
      return res.status(400).json({ error: 'period_start, period_end, and application_ids are required' });
    }

    // Verify provider exists and is active
    const providerResult = await query(
      `SELECT provider_id, provider_name, trust_tier FROM providers WHERE provider_id = $1 AND status = 'active'`,
      [id]
    );
    if (providerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Active provider not found' });
    }

    // Fetch the applications to settle
    const appResult = await query(
      `SELECT a.application_id, a.bill_amount, u.full_name AS patient_name, a.created_at AS treatment_date
       FROM applications a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.application_id = ANY($1::uuid[])
         AND a.provider_id = $2
         AND a.status = 'approved'`,
      [application_ids, id]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'No eligible approved applications found for this provider' });
    }

    // Sum gross amount across all line items
    const grossAmount = appResult.rows.reduce((sum, row) => sum + parseFloat(row.bill_amount), 0);
    const feeCalc = calculateProviderSettlement(grossAmount);

    const settlement = await transaction(async (client) => {
      // Create the settlement record
      const settlementResult = await client.query(
        `INSERT INTO settlements (
          provider_id, period_start, period_end,
          gross_amount, commission_amount, net_amount, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING *`,
        [
          id, period_start, period_end,
          feeCalc.gross_amount, feeCalc.service_fee_amount, feeCalc.net_amount
        ]
      );

      const settlementId = settlementResult.rows[0].settlement_id;

      // Create individual settlement line items (5% fee per item)
      for (const app of appResult.rows) {
        const itemFee = calculateProviderSettlement(parseFloat(app.bill_amount));
        await client.query(
          `INSERT INTO settlement_items (
            settlement_id, application_id, patient_name, treatment_date,
            bill_amount, commission_rate, commission_amount, net_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            settlementId,
            app.application_id,
            app.patient_name,
            app.treatment_date,
            itemFee.gross_amount,
            PROVIDER_SERVICE_FEE_PCT * 100,   // 5.00
            itemFee.service_fee_amount,
            itemFee.net_amount
          ]
        );
      }

      return settlementResult.rows[0];
    });

    res.status(201).json({
      message: 'Settlement created successfully',
      settlement: {
        ...settlement,
        service_fee_pct: PROVIDER_SERVICE_FEE_PCT * 100,
        gross_amount: feeCalc.gross_amount,
        service_fee_amount: feeCalc.service_fee_amount,
        net_amount: feeCalc.net_amount,
        line_items: appResult.rows.length
      },
      policy: `${PROVIDER_SERVICE_FEE_PCT * 100}% service fee deducted from gross settlement amount`
    });
  } catch (error) {
    console.error('Settlement creation error:', error);
    res.status(500).json({ error: 'Failed to create settlement' });
  }
});

// Delete provider (admin only)
router.delete('/admin/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM providers WHERE provider_id = $1 RETURNING provider_name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    res.json({
      success: true,
      message: `Provider "${result.rows[0].provider_name}" deleted successfully`
    });

  } catch (error) {
    console.error('Provider deletion error:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

module.exports = router;
