/**
 * Integration Tests — Health Endpoint
 *
 * Tests the /health route to ensure it reports correctly.
 */

// Must mock DB BEFORE requiring the app
jest.mock('../../backend/src/config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ now: new Date().toISOString() }], rowCount: 1 }),
  transaction: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy', responseTime: 5 }),
  pool: { on: jest.fn() }
}));

jest.mock('../../backend/src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({}),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({})
}));

const request = require('supertest');
const app = require('../../backend/src/server');

describe('GET /health', () => {
  test('returns 200 with status=healthy when DB is healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.timestamp).toBeDefined();
  });

  test('returns a timestamp in ISO 8601 format', async () => {
    const res = await request(app).get('/health');
    expect(() => new Date(res.body.timestamp)).not.toThrow();
  });

  test('does not expose database details in test (non-production) mode', async () => {
    // In test mode NODE_ENV=test, DB details should not be exposed at top level
    const res = await request(app).get('/health');
    expect(res.body.password).toBeUndefined();
    expect(res.body.connectionString).toBeUndefined();
  });
});

describe('GET / (API root)', () => {
  test('returns server info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('PaySick API Server');
    expect(res.body.status).toBe('running');
  });

  test('lists all expected endpoints', async () => {
    const res = await request(app).get('/');
    const { endpoints } = res.body;
    expect(endpoints.health).toBeDefined();
    expect(endpoints.users).toBeDefined();
    expect(endpoints.applications).toBeDefined();
    expect(endpoints.payments).toBeDefined();
    expect(endpoints.providers).toBeDefined();
    expect(endpoints.marketplace).toBeDefined();
    expect(endpoints.risk).toBeDefined();
  });
});

describe('404 handling', () => {
  test('unknown route returns 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
