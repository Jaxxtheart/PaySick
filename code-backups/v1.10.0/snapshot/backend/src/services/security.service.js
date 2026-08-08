/**
 * SECURITY SERVICE
 *
 * Core security utilities for PaySick payment platform.
 * Implements:
 * - Opaque Token authentication (banking-grade, non-JWT)
 * - AES-256-GCM encryption for sensitive data
 * - Secure password hashing with bcrypt
 * - Token lifecycle management
 */

const crypto = require('crypto');
const { promisify } = require('util');
const { query } = require('../config/database');

// Promisify crypto functions
const scryptAsync = promisify(crypto.scrypt);
const randomBytesAsync = promisify(crypto.randomBytes);

// ============================================
// CONFIGURATION VALIDATION
// ============================================

// Required environment variables - application MUST fail if not set
const REQUIRED_ENV_VARS = [
  'TOKEN_SECRET',
  'ENCRYPTION_KEY',
  'NODE_ENV'
];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(
      `SECURITY FATAL: Missing required environment variables: ${missing.join(', ')}. ` +
      `Application cannot start in production without these security configurations.`
    );
  }

  // In development, use secure defaults but warn
  if (missing.length > 0) {
    console.warn(
      `[SECURITY WARNING] Missing env vars: ${missing.join(', ')}. ` +
      `Using development defaults. NEVER deploy to production like this.`
    );
  }
}

// Get secrets with validation
function getTokenSecret() {
  if (process.env.TOKEN_SECRET) {
    return process.env.TOKEN_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TOKEN_SECRET is required in production');
  }
  // Development only - 64 byte random secret
  return crypto.randomBytes(64).toString('hex');
}

function getEncryptionKey() {
  if (process.env.ENCRYPTION_KEY) {
    // Must be 32 bytes (256 bits) for AES-256
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY is required in production');
  }
  // Development only
  return crypto.randomBytes(32);
}

// ============================================
// PASSWORD HASHING (scrypt - Node.js built-in)
// ============================================

// Scrypt parameters for banking-grade security
const SCRYPT_KEYLEN = 64;       // Output key length
const SCRYPT_COST = 16384;      // CPU/memory cost (N) - 2^14
const SCRYPT_BLOCK_SIZE = 8;    // Block size (r)
const SCRYPT_PARALLELIZATION = 1; // Parallelization (p)

/**
 * Hash a password using scrypt (Node.js built-in, no external deps)
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password in format: salt:hash
 */
async function hashPassword(password) {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const salt = await randomBytesAsync(32);
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION
  });

  // Format: salt:hash (both as hex)
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a password against its hash
 * @param {string} password - Plain text password
 * @param {string} storedHash - Stored hash in format salt:hash
 * @returns {Promise<boolean>} - True if password matches
 */
async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) {
    return false;
  }

  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) {
      return false;
    }

    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');

    const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION
    });

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(hash, derivedKey);
  } catch (error) {
    console.error('Password verification error:', error.message);
    return false;
  }
}

// ============================================
// AES-256-GCM ENCRYPTION
// ============================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Encrypted data as base64 (iv:authTag:ciphertext)
 */
function encrypt(plaintext) {
  if (!plaintext) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt data encrypted with encrypt()
 * @param {string} encryptedData - Encrypted data from encrypt()
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedData) {
  if (!encryptedData) return null;

  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt banking details (account numbers, etc.)
 */
function encryptBankingData(data) {
  return encrypt(JSON.stringify(data));
}

/**
 * Decrypt banking details
 */
function decryptBankingData(encryptedData) {
  const decrypted = decrypt(encryptedData);
  return decrypted ? JSON.parse(decrypted) : null;
}

// ============================================
// OPAQUE TOKEN MANAGEMENT
// ============================================

const TOKEN_LENGTH = 64; // 512 bits of entropy
const TOKEN_EXPIRY_HOURS = 24;
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REMEMBER_ME_ACCESS_HOURS = 7 * 24;     // 7 days
const REMEMBER_ME_REFRESH_DAYS = 90;          // 90 days

/**
 * Generate a cryptographically secure opaque token
 * @returns {string} - Random token (hex encoded)
 */
function generateOpaqueToken() {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Hash a token for storage (we never store raw tokens)
 * @param {string} token - Raw token
 * @returns {string} - SHA-256 hash of token
 */
function hashToken(token) {
  return crypto
    .createHmac('sha256', getTokenSecret())
    .update(token)
    .digest('hex');
}

/**
 * Create a new session with opaque tokens
 * @param {Object} user - User object with user_id, email, role
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - Client user agent
 * @param {Object} [options] - Session options
 * @param {boolean} [options.rememberMe] - Extend session lifetime
 * @returns {Promise<Object>} - { accessToken, refreshToken, expiresAt }
 */
async function createSession(user, ipAddress, userAgent, options = {}) {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();

  const accessTokenHash = hashToken(accessToken);
  const refreshTokenHash = hashToken(refreshToken);

  const accessHours = options.rememberMe ? REMEMBER_ME_ACCESS_HOURS : TOKEN_EXPIRY_HOURS;
  const refreshDays = options.rememberMe ? REMEMBER_ME_REFRESH_DAYS : REFRESH_TOKEN_EXPIRY_DAYS;

  const accessExpiresAt = new Date(Date.now() + accessHours * 60 * 60 * 1000);
  const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  try {
    // Store session in database
    await query(
      `INSERT INTO user_sessions (
        user_id,
        access_token_hash,
        refresh_token_hash,
        access_expires_at,
        refresh_expires_at,
        ip_address,
        user_agent,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        user.user_id,
        accessTokenHash,
        refreshTokenHash,
        accessExpiresAt,
        refreshExpiresAt,
        ipAddress,
        userAgent
      ]
    );

    // Log authentication event
    await logSecurityEvent('LOGIN', user.user_id, ipAddress, userAgent, { success: true });
  } catch (error) {
    // If session table doesn't exist, throw a clear error
    if (error.message.includes('does not exist')) {
      throw new Error('Database not initialized. Please run: npm run db:setup');
    }
    throw error;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: accessExpiresAt,
    expiresIn: accessHours * 60 * 60 // seconds
  };
}

/**
 * Validate an access token and return user data
 * @param {string} token - Access token from client
 * @returns {Promise<Object|null>} - User object or null if invalid
 */
async function validateAccessToken(token) {
  if (!token) return null;

  try {
    const tokenHash = hashToken(token);

    const result = await query(
      `SELECT
        s.session_id,
        s.user_id,
        s.access_expires_at,
        s.revoked,
        u.email,
        u.full_name,
        u.role
      FROM user_sessions s
      JOIN users u ON s.user_id = u.user_id
      WHERE s.access_token_hash = $1
      LIMIT 1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];

    // Check if revoked
    if (session.revoked) {
      return null;
    }

    // Check if expired
    if (new Date(session.access_expires_at) < new Date()) {
      return null;
    }

    return {
      userId: session.user_id,
      email: session.email,
      fullName: session.full_name,
      role: session.role,
      sessionId: session.session_id
    };
  } catch (error) {
    // If tables don't exist, return null (invalid token)
    if (error.message.includes('does not exist')) {
      console.warn('Security tables not initialized. Run database setup.');
      return null;
    }
    throw error;
  }
}

/**
 * Refresh an access token using a refresh token
 * @param {string} refreshToken - Refresh token
 * @param {string} ipAddress - Client IP
 * @param {string} userAgent - Client user agent
 * @returns {Promise<Object|null>} - New tokens or null if invalid
 */
async function refreshAccessToken(refreshToken, ipAddress, userAgent) {
  if (!refreshToken) return null;

  const tokenHash = hashToken(refreshToken);

  const result = await query(
    `SELECT
      s.session_id,
      s.user_id,
      s.refresh_expires_at,
      s.revoked,
      u.email,
      u.role
    FROM user_sessions s
    JOIN users u ON s.user_id = u.user_id
    WHERE s.refresh_token_hash = $1
    LIMIT 1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const session = result.rows[0];

  // Check if revoked or expired
  if (session.revoked || new Date(session.refresh_expires_at) < new Date()) {
    return null;
  }

  // Generate new access token
  const newAccessToken = generateOpaqueToken();
  const newAccessTokenHash = hashToken(newAccessToken);
  const newExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Update session with new access token
  await query(
    `UPDATE user_sessions
    SET access_token_hash = $1, access_expires_at = $2, last_activity = NOW()
    WHERE session_id = $3`,
    [newAccessTokenHash, newExpiresAt, session.session_id]
  );

  await logSecurityEvent('TOKEN_REFRESH', session.user_id, ipAddress, userAgent, { success: true });

  return {
    accessToken: newAccessToken,
    expiresAt: newExpiresAt,
    expiresIn: TOKEN_EXPIRY_HOURS * 60 * 60
  };
}

/**
 * Revoke a session (logout)
 * @param {string} token - Access token to revoke
 * @param {string} ipAddress - Client IP
 */
async function revokeSession(token, ipAddress) {
  if (!token) return;

  const tokenHash = hashToken(token);

  const result = await query(
    `UPDATE user_sessions
    SET revoked = true, revoked_at = NOW()
    WHERE access_token_hash = $1
    RETURNING user_id`,
    [tokenHash]
  );

  if (result.rows.length > 0) {
    await logSecurityEvent('LOGOUT', result.rows[0].user_id, ipAddress, null, { success: true });
  }
}

/**
 * Revoke all sessions for a user (security measure)
 * @param {string} userId - User ID
 * @param {string} reason - Reason for revocation
 */
async function revokeAllUserSessions(userId, reason) {
  await query(
    `UPDATE user_sessions
    SET revoked = true, revoked_at = NOW(), revoke_reason = $2
    WHERE user_id = $1 AND revoked = false`,
    [userId, reason]
  );

  await logSecurityEvent('SESSIONS_REVOKED', userId, null, null, { reason });
}

// ============================================
// SECURITY EVENT LOGGING
// ============================================

/**
 * Log a security event for audit trail
 */
async function logSecurityEvent(eventType, userId, ipAddress, userAgent, details = {}) {
  try {
    await query(
      `INSERT INTO security_audit_log (
        event_type,
        user_id,
        ip_address,
        user_agent,
        details,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [eventType, userId, ipAddress, userAgent, JSON.stringify(details)]
    );
  } catch (error) {
    // Don't let logging failures break the application
    console.error('Failed to log security event:', error.message);
  }
}

// ============================================
// INPUT SANITIZATION
// ============================================

/**
 * Sanitize string input to prevent XSS
 * @param {string} input - User input
 * @returns {string} - Sanitized string
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize an object's string properties
 * @param {Object} obj - Object to sanitize
 * @returns {Object} - Sanitized object
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ============================================
// RATE LIMITING HELPERS
// ============================================

/**
 * Check if an IP has too many failed login attempts
 * @param {string} ipAddress - Client IP
 * @returns {Promise<boolean>} - True if should be blocked
 */
async function isIPBlocked(ipAddress) {
  try {
    const result = await query(
      `SELECT COUNT(*) as attempts
      FROM security_audit_log
      WHERE ip_address = $1
      AND event_type = 'LOGIN_FAILED'
      AND created_at > NOW() - INTERVAL '15 minutes'`,
      [ipAddress]
    );

    return parseInt(result.rows[0].attempts) >= 5;
  } catch (error) {
    // If table doesn't exist yet, don't block
    if (error.message.includes('does not exist')) {
      return false;
    }
    throw error;
  }
}

/**
 * Record a failed login attempt
 */
async function recordFailedLogin(ipAddress, email) {
  try {
    await logSecurityEvent('LOGIN_FAILED', null, ipAddress, null, { email });
  } catch (error) {
    // Don't let logging failures break login flow
    console.warn('Failed to record login attempt:', error.message);
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Environment
  validateEnvironment,

  // Password
  hashPassword,
  verifyPassword,

  // Encryption
  encrypt,
  decrypt,
  encryptBankingData,
  decryptBankingData,

  // Tokens
  generateOpaqueToken,
  createSession,
  validateAccessToken,
  refreshAccessToken,
  revokeSession,
  revokeAllUserSessions,

  // Logging
  logSecurityEvent,

  // Sanitization
  sanitizeInput,
  sanitizeObject,

  // Rate limiting
  isIPBlocked,
  recordFailedLogin
};
