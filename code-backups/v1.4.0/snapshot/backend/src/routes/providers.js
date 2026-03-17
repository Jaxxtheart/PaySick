const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth.middleware');
const { encryptBankingData } = require('../services/security.service');
const { calculateProviderSettlement, PROVIDER_SERVICE_FEE_PCT } = require('../services/fee.service');

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

    res.status(201).json({
      success: true,
      provider_id: result.rows[0].provider_id,
      message: 'Application submitted. We will contact you within 2 business days.'
    });

  } catch (error) {
    console.error('Provider application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
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

    res.json({
      success: true,
      message: 'Provider approved successfully',
      provider: result.rows[0]
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
