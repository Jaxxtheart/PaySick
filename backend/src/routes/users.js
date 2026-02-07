const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const jwt = require('jsonwebtoken');
// Note: In production, add bcrypt for password hashing: npm install bcrypt

// Default JWT secret for development (should be set in production)
const JWT_SECRET = process.env.JWT_SECRET || 'paysick-dev-secret-change-in-production';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Register new user
router.post('/register', async (req, res) => {
  try {
    const {
      full_name,
      email,
      cell_number,
      sa_id_number,
      postal_code,
      date_of_birth,
      terms_accepted,
      popia_consent
    } = req.body;

    // Validation
    if (!full_name || !email || !cell_number || !sa_id_number || !postal_code || !date_of_birth) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    if (!terms_accepted || !popia_consent) {
      return res.status(400).json({ error: 'Terms and POPIA consent must be accepted' });
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT user_id FROM users WHERE email = $1 OR sa_id_number = $2',
      [email, sa_id_number]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email or ID number already exists' });
    }

    // Insert new user
    const result = await query(
      `INSERT INTO users (
        full_name, email, cell_number, sa_id_number, postal_code,
        date_of_birth, terms_accepted, popia_consent, popia_consent_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 'active')
      RETURNING user_id, full_name, email, cell_number, status, created_at`,
      [full_name, email, cell_number, sa_id_number, postal_code, date_of_birth, terms_accepted, popia_consent]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [user.user_id]);

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Invalid data format. Please check your inputs.' });
    }
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, sa_id_number } = req.body;

    if (!email && !sa_id_number) {
      return res.status(400).json({ error: 'Email or ID number required' });
    }

    // Find user
    const result = await query(
      `SELECT user_id, full_name, email, cell_number, status, credit_limit, risk_tier
       FROM users
       WHERE email = $1 OR sa_id_number = $2`,
      [email || '', sa_id_number || '']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }

    if (user.status === 'closed') {
      return res.status(403).json({ error: 'Account closed. Please contact support.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login
    await query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1', [user.user_id]);

    res.json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        cell_number: user.cell_number,
        status: user.status,
        credit_limit: user.credit_limit,
        risk_tier: user.risk_tier
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT user_id, full_name, email, cell_number, postal_code, date_of_birth,
              status, risk_tier, credit_limit, created_at, last_login
       FROM users WHERE user_id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, email, cell_number, postal_code } = req.body;

    const result = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           cell_number = COALESCE($3, cell_number),
           postal_code = COALESCE($4, postal_code)
       WHERE user_id = $5
       RETURNING user_id, full_name, email, cell_number, postal_code`,
      [full_name, email, cell_number, postal_code, req.user.userId]
    );

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Add banking details
router.post('/banking', authenticateToken, async (req, res) => {
  try {
    const {
      bank_name,
      account_type,
      account_number,
      branch_code,
      account_holder_name,
      debit_order_day
    } = req.body;

    // Validation
    if (!bank_name || !account_type || !account_number || !branch_code || !account_holder_name || !debit_order_day) {
      return res.status(400).json({ error: 'All banking fields are required' });
    }

    // In production, encrypt the account number
    // For now, we'll store it as-is (this should be encrypted!)
    const account_number_encrypted = account_number; // TODO: Implement encryption

    const result = await query(
      `INSERT INTO banking_details (
        user_id, bank_name, account_type, account_number_encrypted,
        branch_code, account_holder_name, debit_order_day, is_primary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING banking_id, bank_name, account_type, branch_code, debit_order_day, verification_status`,
      [req.user.userId, bank_name, account_type, account_number_encrypted, branch_code, account_holder_name, debit_order_day]
    );

    res.status(201).json({
      message: 'Banking details added successfully',
      banking: result.rows[0]
    });
  } catch (error) {
    console.error('Banking details error:', error);
    if (error.code === '23514') {
      return res.status(400).json({ error: 'Invalid banking data format' });
    }
    res.status(500).json({ error: 'Failed to add banking details' });
  }
});

// Get banking details
router.get('/banking', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT banking_id, bank_name, account_type, branch_code, account_holder_name,
              debit_order_day, debit_order_active, verification_status, is_primary
       FROM banking_details WHERE user_id = $1 AND is_primary = true`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No banking details found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Banking fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch banking details' });
  }
});

// Get user dashboard summary
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    // Get active payment plans
    const plans = await query(
      `SELECT COUNT(*) as active_plans,
              COALESCE(SUM(outstanding_balance), 0) as total_balance,
              COALESCE(SUM(total_paid), 0) as total_paid
       FROM payment_plans
       WHERE user_id = $1 AND status = 'active'`,
      [req.user.userId]
    );

    // Get next payment
    const nextPayment = await query(
      `SELECT amount, due_date
       FROM payments
       WHERE user_id = $1 AND status = 'scheduled'
       ORDER BY due_date ASC
       LIMIT 1`,
      [req.user.userId]
    );

    // Get payment history
    const paymentHistory = await query(
      `SELECT COUNT(*) as completed_payments,
              COALESCE(SUM(amount), 0) as total_paid_this_year
       FROM payments
       WHERE user_id = $1 AND status = 'paid'
         AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [req.user.userId]
    );

    res.json({
      active_plans: parseInt(plans.rows[0].active_plans),
      total_balance: parseFloat(plans.rows[0].total_balance),
      total_paid: parseFloat(plans.rows[0].total_paid),
      next_payment: nextPayment.rows[0] || null,
      payment_history: {
        completed_payments: parseInt(paymentHistory.rows[0].completed_payments),
        total_paid_this_year: parseFloat(paymentHistory.rows[0].total_paid_this_year)
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
