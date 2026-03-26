/**
 * AUTHENTICATION MIDDLEWARE
 *
 * Banking-grade authentication using opaque tokens.
 * No JWT - tokens are validated against database on every request.
 */

const {
  validateAccessToken,
  logSecurityEvent,
  isIPBlocked
} = require('../services/security.service');

/**
 * Extract token from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return null;

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return authHeader;
}

/**
 * Get client IP address (handles proxies)
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
}

/**
 * Authenticate user via opaque token
 * Attaches user object to req.user if valid
 */
async function authenticateToken(req, res, next) {
  const token = extractToken(req);
  const ipAddress = getClientIP(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_TOKEN'
    });
  }

  try {
    // Check if IP is blocked due to failed attempts
    if (await isIPBlocked(ipAddress)) {
      await logSecurityEvent('BLOCKED_REQUEST', null, ipAddress, req.get('User-Agent'), {
        reason: 'Too many failed attempts'
      });

      return res.status(429).json({
        error: 'Too many failed attempts. Please try again later.',
        code: 'IP_BLOCKED',
        retryAfter: 900 // 15 minutes
      });
    }

    const user = await validateAccessToken(token);

    if (!user) {
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    req.clientIP = ipAddress;

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);

    // Don't leak error details
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Require admin role
 * Must be used AFTER authenticateToken
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (req.user.role !== 'admin') {
    logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', req.user.userId, req.clientIP, req.get('User-Agent'), {
      attemptedRoute: req.originalUrl
    });

    return res.status(403).json({
      error: 'Admin access required',
      code: 'FORBIDDEN'
    });
  }

  next();
}

/**
 * Require lender role
 * Must be used AFTER authenticateToken
 */
function requireLender(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (req.user.role !== 'lender' && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Lender access required',
      code: 'FORBIDDEN'
    });
  }

  next();
}

/**
 * Require provider role
 * Must be used AFTER authenticateToken
 */
function requireProvider(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  if (req.user.role !== 'provider' && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Provider access required',
      code: 'FORBIDDEN'
    });
  }

  next();
}

/**
 * Require a specific role (factory function)
 * Returns middleware that requires the given role (or admin)
 * Must be used AFTER authenticateToken
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      logSecurityEvent('UNAUTHORIZED_ACCESS', req.user.userId, req.clientIP, req.get('User-Agent'), {
        requiredRole: role,
        userRole: req.user.role,
        attemptedRoute: req.originalUrl
      });

      return res.status(403).json({
        error: `${role} access required`,
        code: 'FORBIDDEN'
      });
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token
 * Attaches user if valid token present
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (token) {
    try {
      const user = await validateAccessToken(token);
      if (user) {
        req.user = user;
        req.token = token;
      }
    } catch (error) {
      // Ignore errors for optional auth
    }
  }

  req.clientIP = getClientIP(req);
  next();
}

/**
 * Rate limit by user ID (for sensitive operations)
 */
function createUserRateLimit(options = {}) {
  const {
    windowMs = 60000, // 1 minute
    maxRequests = 10,
    message = 'Too many requests'
  } = options;

  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.userId;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request history
    let requests = userRequests.get(userId) || [];

    // Filter to current window
    requests = requests.filter(time => time > windowStart);

    if (requests.length >= maxRequests) {
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((requests[0] + windowMs - now) / 1000)
      });
    }

    requests.push(now);
    userRequests.set(userId, requests);

    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      for (const [key, reqs] of userRequests.entries()) {
        const filtered = reqs.filter(time => time > windowStart);
        if (filtered.length === 0) {
          userRequests.delete(key);
        } else {
          userRequests.set(key, filtered);
        }
      }
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireRole,
  requireLender,
  requireProvider,
  optionalAuth,
  createUserRateLimit,
  extractToken,
  getClientIP
};
