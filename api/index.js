// Vercel serverless function entry point
// This file exports the Express app for Vercel to handle as a serverless function

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import database health check
const { healthCheck } = require('../backend/src/config/database');

// Import routes
const userRoutes = require('../backend/src/routes/users');
const applicationRoutes = require('../backend/src/routes/applications');
const paymentRoutes = require('../backend/src/routes/payments');
const providerRoutes = require('../backend/src/routes/providers');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Request logging (simplified for serverless)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await healthCheck();
  res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
    status: dbHealth.status,
    timestamp: new Date().toISOString(),
    database: dbHealth.database,
    message: dbHealth.message
  });
});

// API routes
app.use('/api/users', userRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/providers', providerRoutes);

// Root endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'PaySick API - Heal Now, Pay Later',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      users: '/api/users',
      applications: '/api/applications',
      payments: '/api/payments',
      providers: '/api/providers'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      status: 404,
      path: req.path
    }
  });
});

// Export the Express app for Vercel
module.exports = app;
