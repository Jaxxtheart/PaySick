// Vercel Serverless Function — Catch-all for /api/*
// Handles all sub-paths: /api/users/login, /api/users/forgot-password, etc.
// Wraps module load in try/catch so a startup crash returns JSON (not Vercel HTML 500).

let app;
let loadError;

try {
  app = require('../backend/src/server');
} catch (err) {
  loadError = err;
  console.error('[PaySick] FATAL: server failed to load:', err.message, err.stack);
}

module.exports = (req, res) => {
  if (loadError) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 500;
    res.end(JSON.stringify({
      error: 'Server failed to start',
      code: 'SERVER_LOAD_ERROR',
      detail: process.env.NODE_ENV !== 'production' ? loadError.message : undefined
    }));
    return;
  }
  return app(req, res);
};
