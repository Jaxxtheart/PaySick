const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// Get all providers
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

// Get single provider
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM providers WHERE provider_id = $1',
      [req.params.id]
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

// Search providers
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

// Track CTA clicks for analytics and conversion optimization
router.post('/track-cta', async (req, res) => {
  try {
    const { source, timestamp, page } = req.body;

    // Log CTA click to audit_log table for analytics
    await query(
      `INSERT INTO audit_log (
        user_id, action, table_name, record_id, details, ip_address
      ) VALUES (
        NULL, 'provider_cta_click', 'providers', NULL, $1, $2
      )`,
      [
        JSON.stringify({ source, page, timestamp }),
        req.ip || req.connection.remoteAddress
      ]
    );

    // Update provider_cta_stats table (if exists) or just return success
    // This could be used to track conversion rates and optimize messaging
    try {
      await query(
        `INSERT INTO provider_cta_stats (source, clicks, date)
         VALUES ($1, 1, CURRENT_DATE)
         ON CONFLICT (source, date)
         DO UPDATE SET clicks = provider_cta_stats.clicks + 1`,
        [source]
      );
    } catch (statsError) {
      // Table might not exist yet - that's okay, audit log captured it
      console.log('CTA stats table not available:', statsError.message);
    }

    res.json({ success: true, message: 'CTA click tracked' });
  } catch (error) {
    console.error('CTA tracking error:', error);
    // Don't fail the request if tracking fails
    res.json({ success: true, message: 'Tracking skipped' });
  }
});

// Provider Application - Submit new provider application
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
      patient_volume,
      years_operating,
      services_offered,
      terms_accepted,
      popia_consent,
      commission_agreement
    } = req.body;

    // Validation
    if (!provider_name || !provider_type || !contact_email || !contact_phone ||
        !address || !city || !province || !postal_code ||
        !bank_name || !branch_code || !account_number || !account_holder) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!terms_accepted || !popia_consent || !commission_agreement) {
      return res.status(400).json({ error: 'All consents must be accepted' });
    }

    // Encrypt account number (in production, use proper encryption)
    const account_number_encrypted = Buffer.from(account_number).toString('base64');

    // Insert provider with pending status
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
      message: 'Application submitted successfully'
    });

  } catch (error) {
    console.error('Provider application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Admin Routes

// Get all providers (admin only)
router.get('/admin/all', async (req, res) => {
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

// Approve provider application (admin only)
router.put('/admin/:id/approve', async (req, res) => {
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
router.put('/admin/:id/status', async (req, res) => {
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
router.put('/admin/:id', async (req, res) => {
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

// Delete provider (admin only)
router.delete('/admin/:id', async (req, res) => {
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

// Get provider statistics (admin only)
router.get('/admin/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total_providers,
        COUNT(*) FILTER (WHERE status = 'active') as active_providers,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_applications,
        COUNT(*) FILTER (WHERE network_partner = true) as network_partners,
        COUNT(DISTINCT province) as provinces_covered,
        COUNT(*) FILTER (WHERE provider_type = 'hospital') as hospitals,
        COUNT(*) FILTER (WHERE provider_type = 'clinic') as clinics,
        COUNT(*) FILTER (WHERE provider_type = 'gp_practice') as gp_practices,
        COUNT(*) FILTER (WHERE provider_type = 'specialist') as specialists
      FROM providers
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Provider stats error:', error);
    res.status(500).json({ error: 'Failed to fetch provider statistics' });
  }
});

module.exports = router;
