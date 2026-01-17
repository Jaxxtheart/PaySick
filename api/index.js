/**
 * Vercel Serverless Function Entry Point
 * This file exports the Express app as a serverless function for Vercel
 */

// Import the Express app from backend
const app = require('../backend/src/server');

// Export the app as a serverless function
module.exports = app;
