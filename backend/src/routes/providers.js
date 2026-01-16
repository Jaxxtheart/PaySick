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

module.exports = router;
