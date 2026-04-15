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

const fs = require('fs');
const path = require('path');
const { query, healthCheck } = require('./config/database');
const { validateEnvironment } = require('./services/security.service');

// Validate security configuration on startup
// NOTE: Do NOT call process.exit() here — in a Vercel serverless environment,
// exiting the process causes the function to die before it can return a JSON
// error response. Vercel then serves an HTML error page, which the frontend
// cannot parse. Instead, let the app start; routes that require TOKEN_SECRET
// or ENCRYPTION_KEY will throw inside their own try/catch blocks and return
// a proper JSON 500 to the client.
try {
  validateEnvironment();
} catch (error) {
  console.error('FATAL:', error.message);
}

// Run pending migrations on startup (all use IF NOT EXISTS so safe to re-run)
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    try {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await query(sql);
      console.log(`Migration applied: ${file}`);
    } catch (err) {
      console.error(`Migration failed (${file}):`, err.message);
    }
  }
}
runMigrations().catch(err => console.error('Migration runner error:', err.message));

// Import routes
const userRoutes = require('./routes/users');
const applicationRoutes = require('./routes/applications');
const paymentRoutes = require('./routes/payments');
const providerRoutes = require('./routes/providers');
const marketplaceRoutes = require('./routes/marketplace');
const riskRoutes = require('./routes/risk');
const shieldRoutes = require('./routes/shield');
const notificationRoutes = require('./routes/notifications');
const underwritingRoutes = require('./routes/underwriting');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Vercel's reverse proxy so express-rate-limit reads X-Forwarded-For correctly
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet with relaxed CSP for API
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API server
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration - Allow same-origin and configured origins
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, Postman, mobile apps)
    if (!origin) {
      return callback(null, true);
    }

    // Allow configured origins
    if (process.env.CORS_ORIGIN) {
      const allowedOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
    }

    // Allow Vercel preview deployments (only if explicitly enabled or non-production)
    if (process.env.ALLOW_VERCEL_PREVIEWS === 'true' || process.env.NODE_ENV !== 'production') {
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
    }

    // Allow production domain
    if (origin === 'https://paysick.co.za' || origin === 'https://www.paysick.co.za') {
      return callback(null, true);
    }

    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      return callback(null, true);
    }

    console.warn(`CORS blocked: ${origin}`);
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
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

  // Bot crawling prevention (CLAUDE.md requirement)
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');

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
app.use('/api/notifications', notificationRoutes);

// Shield Underwriting Framework (v2 endpoints)
app.use('/v2/shield', shieldRoutes);

// Shield Framework v5.0 — Segment 1 Underwriting Controls
app.use('/api', underwritingRoutes);

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
      providerDashboard: '/api/providers/dashboard',
      marketplace: '/api/marketplace',
      risk: '/api/risk',
      notifications: '/api/notifications',
      shield: '/v2/shield'
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  const response = {
    error: 'Not Found',
    code: 'NOT_FOUND'
  };

  // Only expose route details in non-production
  if (process.env.NODE_ENV !== 'production') {
    response.message = `Route ${req.method} ${req.url} not found`;
  }

  res.status(404).json(response);
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

// Guard: don't start HTTP server when running as Vercel serverless function
if (process.env.VERCEL !== '1') {
  const server = app.listen(PORT, () => {
    const isProduction = process.env.NODE_ENV === 'production';

    console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║         PaySick API Server v1.3.0                 ║
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

  // Graceful shutdown — drains DB pool before exit
  function gracefulShutdown(signal) {
    console.log(`${signal} received: starting graceful shutdown`);
    server.close(async () => {
      console.log('HTTP server closed');
      try {
        const { pool } = require('./config/database');
        await pool.end();
        console.log('Database pool closed');
      } catch (err) {
        console.error('Error closing database pool:', err.message);
      }
      process.exit(0);
    });
    setTimeout(() => { console.error('Forced shutdown after timeout'); process.exit(1); }, 30000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Export for Vercel serverless
module.exports = app;
