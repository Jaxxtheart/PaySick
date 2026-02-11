/**
 * PAYSICK API SERVER
 *
 * Banking-grade security configuration for healthcare payment platform.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { healthCheck } = require('./config/database');
const { validateEnvironment } = require('./services/security.service');

// Validate security configuration on startup
try {
  validateEnvironment();
} catch (error) {
  console.error('FATAL:', error.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Import routes
const userRoutes = require('./routes/users');
const applicationRoutes = require('./routes/applications');
const paymentRoutes = require('./routes/payments');
const providerRoutes = require('./routes/providers');
const marketplaceRoutes = require('./routes/marketplace');
const riskRoutes = require('./routes/risk');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet with strict CSP for banking application
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for now
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for API
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration - STRICT in production
const getAllowedOrigins = () => {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(',').map(o => o.trim());
  }

  // In production, MUST have explicit origins
  if (process.env.NODE_ENV === 'production') {
    console.error('SECURITY WARNING: CORS_ORIGIN not set in production. Defaulting to same-origin only.');
    return false; // Disallow all cross-origin requests
  }

  // Development only - allow localhost
  return [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
  ];
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();

    // Allow requests with no origin (same-origin, mobile apps, Postman)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins === false) {
      return callback(new Error('CORS not allowed'), false);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked request from: ${origin}`);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 600, // 10 minutes
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Request logging - sanitized in production
if (process.env.NODE_ENV === 'production') {
  // Custom format that doesn't log sensitive data
  app.use(morgan(':method :url :status :response-time ms - :res[content-length]'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================
// RATE LIMITING
// ============================================

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMITED',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  }
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMITED',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', globalLimiter);
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/users/demo-login', authLimiter);

// ============================================
// SECURITY HEADERS
// ============================================

app.use((req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Remove fingerprinting headers
  res.removeHeader('X-Powered-By');

  next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  const dbHealth = await healthCheck();

  // Don't expose database details in production
  const response = {
    status: dbHealth.status,
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV !== 'production') {
    response.database = {
      status: dbHealth.status,
      responseTime: dbHealth.responseTime
    };
  }

  res.status(dbHealth.status === 'healthy' ? 200 : 503).json(response);
});

// ============================================
// API ROUTES
// ============================================

app.use('/api/users', userRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/risk', riskRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'PaySick API Server',
    version: '1.0.0',
    status: 'running',
    security: 'opaque-tokens',
    endpoints: {
      health: '/health',
      users: '/api/users',
      applications: '/api/applications',
      payments: '/api/payments',
      providers: '/api/providers',
      marketplace: '/api/marketplace',
      risk: '/api/risk'
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
    code: 'NOT_FOUND'
  });
});

// Global error handler - NEVER expose stack traces in production
app.use((err, req, res, next) => {
  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    path: req.path,
    method: req.method,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Cross-origin request blocked',
      code: 'CORS_BLOCKED'
    });
  }

  // Don't leak error details in production
  const statusCode = err.status || 500;
  const response = {
    error: statusCode === 500 ? 'Internal Server Error' : err.message,
    code: err.code || 'SERVER_ERROR'
  };

  // Only include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = err.message;
  }

  res.status(statusCode).json(response);
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, () => {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║         PaySick API Server v1.0.0                 ║
║         Banking-Grade Security Enabled            ║
║                                                   ║
║  Port: ${PORT}                                      ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(14)}              ║
║  Auth: Opaque Tokens (No JWT)                     ║
║  Encryption: AES-256-GCM                          ║
║                                                   ║
║  Security Status:                                 ║
║  ${isProduction ? '[✓] Production mode' : '[!] Development mode - NOT FOR PRODUCTION'}            ║
║  ${process.env.TOKEN_SECRET ? '[✓] Token secret configured' : '[!] Using dev token secret'}           ║
║  ${process.env.ENCRYPTION_KEY ? '[✓] Encryption key configured' : '[!] Using dev encryption key'}        ║
║  ${process.env.CORS_ORIGIN ? '[✓] CORS origins configured' : '[!] Using dev CORS origins'}          ║
║                                                   ║
║  Health: http://localhost:${PORT}/health              ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

module.exports = app;
