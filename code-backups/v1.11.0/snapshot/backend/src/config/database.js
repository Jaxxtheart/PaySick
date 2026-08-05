const { Pool } = require('pg');
require('dotenv').config();

// PostgreSQL connection pool configuration
// Supports both Vercel Postgres (connection string) and traditional connection parameters
const poolConfig = process.env.POSTGRES_URL
  ? {
      connectionString: process.env.POSTGRES_URL,
      ssl: {
        rejectUnauthorized: false // Required for Vercel Postgres
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'paysick_db',
      user: process.env.DB_USER || 'paysick_user',
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

const pool = new Pool(poolConfig);

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  // Do not call process.exit() — in a serverless environment this would kill
  // the function handler and leave subsequent requests with no JSON response.
});

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // In production, only log slow queries (>500ms) without query text
    if (process.env.NODE_ENV === 'production') {
      if (duration > 500) {
        console.warn('Slow query detected', { duration, rows: res.rowCount });
      }
    } else {
      console.log('Executed query', { duration, rows: res.rowCount });
    }

    return res;
  } catch (error) {
    // Never log query text in production (may contain sensitive data)
    if (process.env.NODE_ENV === 'production') {
      console.error('Database query error:', error.message);
    } else {
      console.error('Database query error:', error);
    }
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Health check
const healthCheck = async () => {
  const start = Date.now();
  try {
    const result = await pool.query('SELECT NOW()');
    const responseTime = Date.now() - start;
    return {
      status: 'healthy',
      timestamp: result.rows[0].now,
      responseTime
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: process.env.NODE_ENV === 'production' ? 'Database unavailable' : error.message,
      responseTime: Date.now() - start
    };
  }
};

module.exports = {
  pool,
  query,
  transaction,
  healthCheck
};
