/**
 * USER ROUTES
 *
 * Banking-grade authentication and user management.
 * Uses opaque tokens instead of JWT for enhanced security.
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const {
  hashPassword,
  verifyPassword,
  createSession,
  revokeSession,
  refreshAccessToken,
  encryptBankingData,
  decryptBankingData,
  logSecurityEvent,
  sanitizeObject,
  isIPBlocked,
  recordFailedLogin
} = require('../services/security.service');
const { sendVerificationEmail } = require('../services/email.service');
const {
  authenticateToken,
  requireAdmin,
  createUserRateLimit,
  getClientIP
} = require('../middleware/auth.middleware');

// ============================================
// RATE LIMITERS
// ============================================

const loginRateLimit = createUserRateLimit({
  windowMs: 900000, // 15 minutes
  maxRequests: 5,
  message: 'Too many login attempts. Please wait 15 minutes.'
});

const registrationRateLimit = createUserRateLimit({
  windowMs: 3600000, // 1 hour
  maxRequests: 3,
  message: 'Too many registration attempts. Please wait 1 hour.'
});

// ============================================
// REGISTRATION
// ============================================

/**
 * POST /api/users/register
 * Register a new user with password
 */
router.post('/register', async (req, res) => {
  const ipAddress = getClientIP(req);

  try {
    // Check IP block first
    if (await isIPBlocked(ipAddress)) {
      return res.status(429).json({
        error: 'Too many attempts. Please try again later.',
        code: 'IP_BLOCKED'
      });
    }

    const {
      full_name,
      email,
      password,
      cell_number,
      sa_id_number,
      postal_code,
      date_of_birth,
      terms_accepted,
      popia_consent
    } = req.body;

    // Validation
    if (!full_name || !email || !password || !cell_number || !sa_id_number || !postal_code || !date_of_birth) {
      return res.status(400).json({
        error: 'All required fields must be provided',
        required: ['full_name', 'email', 'password', 'cell_number', 'sa_id_number', 'postal_code', 'date_of_birth']
      });
    }

    // Password requirements
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        error: 'Password must contain uppercase, lowercase, and numeric characters',
        code: 'WEAK_PASSWORD'
      });
    }

    if (!terms_accepted || !popia_consent) {
      return res.status(400).json({
        error: 'Terms and POPIA consent must be accepted'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    // Validate SA ID number (basic check)
    if (!/^\d{13}$/.test(sa_id_number)) {
      return res.status(400).json({
        error: 'Invalid SA ID number format'
      });
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT user_id FROM users WHERE email = $1 OR sa_id_number = $2',
      [email.toLowerCase(), sa_id_number]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'User with this email or ID number already exists',
        code: 'USER_EXISTS'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate email verification token (raw sent by email; hash stored in DB)
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Insert new user (status='pending' until email is verified)
    const result = await query(
      `INSERT INTO users (
        full_name, email, password_hash, cell_number, sa_id_number, postal_code,
        date_of_birth, terms_accepted, popia_consent, popia_consent_date,
        status, role,
        email_verified, email_verification_token, email_verification_expires
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP,
                'pending', 'user',
                false, $10, $11)
      RETURNING user_id, full_name, email, cell_number, status, role, created_at`,
      [
        sanitizeObject({ full_name }).full_name,
        email.toLowerCase(),
        passwordHash,
        cell_number,
        sa_id_number,
        postal_code,
        date_of_birth,
        terms_accepted,
        popia_consent,
        tokenHash,
        tokenExpires
      ]
    );

    const user = result.rows[0];

    await logSecurityEvent('REGISTRATION', user.user_id, ipAddress, req.get('User-Agent'), {
      email: user.email
    });

    // Send verification email (non-blocking — a delivery failure doesn't fail registration)
    try {
      await sendVerificationEmail(user.email, user.full_name, rawToken);
    } catch (emailErr) {
      console.error('Verification email send failed (non-fatal):', emailErr.message);
    }

    res.status(201).json({
      message: 'Account created. Please check your email to verify your address.',
      requiresEmailVerification: true,
      email: user.email
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === '23514') {
      return res.status(400).json({
        error: 'Invalid data format. Please check your inputs.'
      });
    }

    res.status(500).json({ error: 'Failed to register user' });
  }
});

// ============================================
// EMAIL VERIFICATION
// ============================================

/**
 * POST /api/users/verify-email
 * Verify a user's email using the token from the verification link.
 * On success, activates the account and issues a session.
 */
router.post('/verify-email', async (req, res) => {
  const ipAddress = getClientIP(req);
  const { token } = req.body;

  if (!token || typeof token !== 'string' || token.length !== 64) {
    return res.status(400).json({
      error: 'Invalid verification token.',
      code: 'INVALID_TOKEN'
    });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await query(
      `SELECT user_id, full_name, email, role, email_verification_expires
       FROM users
       WHERE email_verification_token = $1
         AND email_verified = false`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Verification link is invalid or has already been used.',
        code: 'INVALID_TOKEN'
      });
    }

    const user = result.rows[0];

    if (new Date(user.email_verification_expires) < new Date()) {
      return res.status(400).json({
        error: 'Verification link has expired. Please request a new one.',
        code: 'TOKEN_EXPIRED',
        email: user.email
      });
    }

    // Activate account
    await query(
      `UPDATE users
       SET email_verified             = true,
           email_verification_token   = NULL,
           email_verification_expires = NULL,
           status                     = 'active',
           last_login                 = NOW()
       WHERE user_id = $1`,
      [user.user_id]
    );

    // Issue session now that the email is confirmed
    const session = await createSession(
      { user_id: user.user_id, email: user.email, role: user.role },
      ipAddress,
      req.get('User-Agent')
    );

    await logSecurityEvent('EMAIL_VERIFIED', user.user_id, ipAddress, req.get('User-Agent'), {
      email: user.email
    });

    res.json({
      message: 'Email verified. Welcome to PaySick!',
      user: {
        user_id:   user.user_id,
        full_name: user.full_name,
        email:     user.email,
        role:      user.role
      },
      accessToken:  session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn:    session.expiresIn
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email.' });
  }
});

/**
 * POST /api/users/resend-verification
 * Resend the verification email for an unverified account.
 * Always returns a generic message to avoid user enumeration.
 */
router.post('/resend-verification', async (req, res) => {
  const ipAddress = getClientIP(req);
  const { email } = req.body;

  // Generic response — don't reveal whether an account exists
  const ok = { message: 'If this email is registered and unverified, a new verification link has been sent.' };

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email address required.' });
  }

  try {
    const result = await query(
      `SELECT user_id, full_name, email FROM users
       WHERE email = $1 AND email_verified = false`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.json(ok);
    }

    const user = result.rows[0];

    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expires   = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await query(
      `UPDATE users
       SET email_verification_token   = $1,
           email_verification_expires = $2
       WHERE user_id = $3`,
      [tokenHash, expires, user.user_id]
    );

    try {
      await sendVerificationEmail(user.email, user.full_name, rawToken);
    } catch (emailErr) {
      console.error('Resend verification email failed:', emailErr.message);
    }

    await logSecurityEvent('VERIFICATION_RESENT', user.user_id, ipAddress, req.get('User-Agent'), {
      email: user.email
    });

    res.json(ok);
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email.' });
  }
});

// ============================================
// LOGIN
// ============================================

/**
 * POST /api/users/login
 * Authenticate user with email/ID and password
 */
router.post('/login', async (req, res) => {
  const ipAddress = getClientIP(req);

  try {
    // Check IP block first
    if (await isIPBlocked(ipAddress)) {
      return res.status(429).json({
        error: 'Too many failed attempts. Please try again in 15 minutes.',
        code: 'IP_BLOCKED',
        retryAfter: 900
      });
    }

    const { email, sa_id_number, password } = req.body;

    if ((!email && !sa_id_number) || !password) {
      return res.status(400).json({
        error: 'Email/ID number and password required'
      });
    }

    // Find user
    const result = await query(
      `SELECT user_id, full_name, email, password_hash, cell_number, status,
              credit_limit, risk_tier, role, failed_login_attempts, locked_until
       FROM users
       WHERE email = $1 OR sa_id_number = $2`,
      [email?.toLowerCase() || '', sa_id_number || '']
    );

    if (result.rows.length === 0) {
      await recordFailedLogin(ipAddress, email || sa_id_number);
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = result.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(403).json({
        error: 'Account temporarily locked due to too many failed attempts',
        code: 'ACCOUNT_LOCKED',
        lockedUntil: user.locked_until
      });
    }

    // Check account status
    if (user.status === 'pending') {
      return res.status(403).json({
        error: 'Please verify your email address before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_UNVERIFIED',
        email: user.email
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'Account suspended. Please contact support.',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    if (user.status === 'closed') {
      return res.status(403).json({
        error: 'Account closed. Please contact support.',
        code: 'ACCOUNT_CLOSED'
      });
    }

    // Verify password
    if (!user.password_hash) {
      // User registered before password requirement - prompt to set password
      return res.status(403).json({
        error: 'Please reset your password to continue',
        code: 'PASSWORD_REQUIRED'
      });
    }

    const passwordValid = await verifyPassword(password, user.password_hash);

    if (!passwordValid) {
      // Increment failed attempts
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      let lockUntil = null;

      // Lock account after 5 failed attempts
      if (newAttempts >= 5) {
        lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }

      await query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE user_id = $3',
        [newAttempts, lockUntil, user.user_id]
      );

      await recordFailedLogin(ipAddress, email || sa_id_number);

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        attemptsRemaining: Math.max(0, 5 - newAttempts)
      });
    }

    // Reset failed attempts on successful login
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE user_id = $1',
      [user.user_id]
    );

    // Create session
    const session = await createSession(
      { user_id: user.user_id, email: user.email, role: user.role },
      ipAddress,
      req.get('User-Agent')
    );

    res.json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        cell_number: user.cell_number,
        status: user.status,
        credit_limit: user.credit_limit,
        risk_tier: user.risk_tier,
        role: user.role
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// ============================================
// DEMO LOGIN (Development Only)
// ============================================

/**
 * POST /api/users/demo-login
 * Demo login for development/testing
 * Can be enabled in production via ALLOW_DEMO_LOGIN=true
 */
router.post('/demo-login', async (req, res) => {
  // Allow demo login if explicitly enabled or not in production
  const allowDemo = process.env.ALLOW_DEMO_LOGIN === 'true' || process.env.NODE_ENV !== 'production';

  if (!allowDemo) {
    return res.status(403).json({
      error: 'Demo login is disabled in production',
      code: 'DEMO_DISABLED'
    });
  }

  const ipAddress = getClientIP(req);

  try {
    const { email, role } = req.body;

    // Only allow specific demo accounts
    const demoAccounts = {
      'user@paysick.com': {
        user_id: 'demo-user-001',
        full_name: 'John Doe',
        email: 'user@paysick.com',
        cell_number: '0821234567',
        status: 'active',
        credit_limit: 50000,
        risk_tier: 'standard',
        role: 'user'
      },
      'provider@paysick.com': {
        user_id: 'demo-provider-001',
        full_name: 'Dr. Sarah Smith',
        email: 'provider@paysick.com',
        cell_number: '0823456789',
        status: 'active',
        credit_limit: 0,
        risk_tier: 'low',
        role: 'provider',
        practice_name: 'Smith Medical Centre'
      },
      'lender@paysick.com': {
        user_id: 'demo-lender-001',
        full_name: 'Capital Finance',
        email: 'lender@paysick.com',
        cell_number: '0824567890',
        status: 'active',
        credit_limit: 0,
        risk_tier: 'low',
        role: 'lender',
        company_name: 'Capital Finance SA'
      },
      'admin@paysick.com': {
        user_id: 'demo-admin-001',
        full_name: 'Admin User',
        email: 'admin@paysick.com',
        cell_number: '0829876543',
        status: 'active',
        credit_limit: 100000,
        risk_tier: 'low',
        role: 'admin'
      }
    };

    const demoUser = demoAccounts[email];
    if (!demoUser) {
      return res.status(401).json({ error: 'Invalid demo credentials' });
    }

    // Create session
    const session = await createSession(
      { user_id: demoUser.user_id, email: demoUser.email, role: role || demoUser.role },
      ipAddress,
      req.get('User-Agent')
    );

    await logSecurityEvent('DEMO_LOGIN', demoUser.user_id, ipAddress, req.get('User-Agent'), {
      email: demoUser.email,
      role: role || demoUser.role
    });

    res.json({
      message: 'Demo login successful',
      demo: true,
      user: {
        ...demoUser,
        role: role || demoUser.role
      },
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: 'Failed to process demo login' });
  }
});

// ============================================
// TOKEN REFRESH
// ============================================

/**
 * POST /api/users/refresh-token
 * Get new access token using refresh token
 */
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        code: 'NO_TOKEN'
      });
    }

    const newTokens = await refreshAccessToken(
      refreshToken,
      getClientIP(req),
      req.get('User-Agent')
    );

    if (!newTokens) {
      return res.status(401).json({
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    res.json({
      accessToken: newTokens.accessToken,
      expiresIn: newTokens.expiresIn
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// ============================================
// LOGOUT
// ============================================

/**
 * POST /api/users/logout
 * Revoke current session
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await revokeSession(req.token, req.clientIP);

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// ============================================
// PROFILE
// ============================================

/**
 * GET /api/users/profile
 * Get current user's profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT user_id, full_name, email, cell_number, postal_code, date_of_birth,
              status, risk_tier, credit_limit, role, created_at, last_login
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

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, cell_number, postal_code } = req.body;

    // Sanitize inputs
    const sanitized = sanitizeObject({ full_name, cell_number, postal_code });

    const result = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           cell_number = COALESCE($2, cell_number),
           postal_code = COALESCE($3, postal_code)
       WHERE user_id = $4
       RETURNING user_id, full_name, email, cell_number, postal_code`,
      [sanitized.full_name, sanitized.cell_number, sanitized.postal_code, req.user.userId]
    );

    await logSecurityEvent('PROFILE_UPDATED', req.user.userId, req.clientIP, req.get('User-Agent'), {
      fields: Object.keys(req.body)
    });

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================
// BANKING DETAILS (Encrypted)
// ============================================

/**
 * POST /api/users/banking
 * Add encrypted banking details
 */
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

    // Validate account number format (South African banks typically use 10-11 digits)
    if (!/^\d{10,11}$/.test(account_number)) {
      return res.status(400).json({ error: 'Invalid account number format' });
    }

    // Encrypt sensitive banking data
    const encryptedData = encryptBankingData({
      account_number,
      branch_code,
      account_holder_name
    });

    // Store last 4 digits for display
    const lastFourDigits = account_number.slice(-4);

    const result = await query(
      `INSERT INTO encrypted_banking_details (
        user_id, encrypted_data, bank_name, account_type, last_four_digits,
        is_primary, created_at
      ) VALUES ($1, $2, $3, $4, $5, true, NOW())
      ON CONFLICT (user_id) WHERE is_primary = true
      DO UPDATE SET
        encrypted_data = EXCLUDED.encrypted_data,
        bank_name = EXCLUDED.bank_name,
        account_type = EXCLUDED.account_type,
        last_four_digits = EXCLUDED.last_four_digits,
        updated_at = NOW()
      RETURNING banking_id, bank_name, account_type, last_four_digits, is_primary`,
      [req.user.userId, encryptedData, bank_name, account_type, lastFourDigits]
    );

    // Also store debit order day preference
    await query(
      `UPDATE users SET debit_order_day = $1 WHERE user_id = $2`,
      [debit_order_day, req.user.userId]
    );

    await logSecurityEvent('BANKING_ADDED', req.user.userId, req.clientIP, req.get('User-Agent'), {
      bank_name,
      account_type
    });

    res.status(201).json({
      message: 'Banking details added successfully',
      banking: {
        ...result.rows[0],
        debit_order_day
      }
    });
  } catch (error) {
    console.error('Banking details error:', error);
    res.status(500).json({ error: 'Failed to add banking details' });
  }
});

/**
 * GET /api/users/banking
 * Get banking details (masked)
 */
router.get('/banking', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT banking_id, bank_name, account_type, last_four_digits, is_primary, verified, verified_at
       FROM encrypted_banking_details WHERE user_id = $1 AND is_primary = true`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No banking details found' });
    }

    // Get debit order day
    const userResult = await query(
      'SELECT debit_order_day FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    res.json({
      ...result.rows[0],
      debit_order_day: userResult.rows[0]?.debit_order_day,
      account_number_masked: `****${result.rows[0].last_four_digits}`
    });
  } catch (error) {
    console.error('Banking fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch banking details' });
  }
});

// ============================================
// PASSWORD CHANGE
// ============================================

/**
 * POST /api/users/change-password
 * Change user's password
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current and new password required'
      });
    }

    // Password requirements
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters',
        code: 'WEAK_PASSWORD'
      });
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({
        error: 'Password must contain uppercase, lowercase, and numeric characters',
        code: 'WEAK_PASSWORD'
      });
    }

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const currentValid = await verifyPassword(currentPassword, result.rows[0].password_hash);

    if (!currentValid) {
      return res.status(401).json({
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD'
      });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE user_id = $2',
      [newPasswordHash, req.user.userId]
    );

    await logSecurityEvent('PASSWORD_CHANGED', req.user.userId, req.clientIP, req.get('User-Agent'), {});

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ============================================
// DASHBOARD
// ============================================

/**
 * GET /api/users/dashboard
 * Get user dashboard summary
 */
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
