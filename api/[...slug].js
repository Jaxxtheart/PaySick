// Vercel Serverless Function — Catch-all for /api/*
// Handles all sub-paths: /api/users/login, /api/users/forgot-password, etc.

const app = require('../backend/src/server');

module.exports = app;
