/**
 * Integration Tests — Applications Routes
 *
 * Tests POST / (create), GET / (list), GET /:id (detail).
 * Auth middleware is by-passed by mocking the DB to return a valid session.
 */

const mockQuery = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../../backend/src/config/database', () => ({
  query: mockQuery,
  transaction: mockTransaction,
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
  pool: { on: jest.fn() }
}));

jest.mock('../../backend/src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({}),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({})
}));

const request = require('supertest');
const app = require('../../backend/src/server');
const crypto = require('crypto');

const mockUserId = 'user-uuid-1111-2222-3333-4444444444';
const mockToken = crypto.randomBytes(32).toString('hex');
const mockTokenHash = crypto.createHash('sha256').update(mockToken).digest('hex');

// Mock a valid session row returned by auth middleware
const validSessionRow = {
  user_id: mockUserId,
  role: 'user',
  email: 'user@paysick.com',
  revoked: false,
  access_expires_at: new Date(Date.now() + 3600000).toISOString()
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockTransaction.mockImplementation(async (cb) => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ plan_id: 'plan-1' }], rowCount: 1 }),
      release: jest.fn()
    };
    return cb(client);
  });
});

// Helper to set up auth mock (2 calls: token lookup + last_activity update)
function setupAuthMock(extraMocks = []) {
  mockQuery
    .mockResolvedValueOnce({ rows: [validSessionRow], rowCount: 1 }) // session lookup
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });               // update last_activity
  extraMocks.forEach(m => mockQuery.mockResolvedValueOnce(m));
}

// ─────────────────────────────────────────────
// GET /api/applications
// ─────────────────────────────────────────────
describe('GET /api/applications', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/applications');
    expect(res.status).toBe(401);
  });

  test('returns empty array when user has no applications', async () => {
    setupAuthMock([
      { rows: [], rowCount: 0 } // applications query
    ]);

    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns applications list', async () => {
    const app1 = { application_id: 'app-1', bill_amount: 1500, status: 'approved' };
    setupAuthMock([
      { rows: [app1], rowCount: 1 }
    ]);

    const res = await request(app)
      .get('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].application_id).toBe('app-1');
  });
});

// ─────────────────────────────────────────────
// GET /api/applications/:id
// ─────────────────────────────────────────────
describe('GET /api/applications/:id', () => {
  test('returns 404 when application not found', async () => {
    setupAuthMock([
      { rows: [], rowCount: 0 } // not found
    ]);

    const res = await request(app)
      .get('/api/applications/nonexistent-id')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(404);
  });

  test('returns application with no payments when no plan', async () => {
    const appRow = { application_id: 'app-1', bill_amount: 2000, plan_id: null };
    setupAuthMock([
      { rows: [appRow], rowCount: 1 }
    ]);

    const res = await request(app)
      .get('/api/applications/app-1')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body.application_id).toBe('app-1');
  });
});

// ─────────────────────────────────────────────
// POST /api/applications — validation
// ─────────────────────────────────────────────
describe('POST /api/applications — validation', () => {
  test('returns 400 when required fields are missing', async () => {
    setupAuthMock();

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ bill_amount: 1000 }); // missing treatment_type and provider_name

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Required fields missing/i);
  });

  test('returns 400 when bill_amount is below R500', async () => {
    setupAuthMock();

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        bill_amount: 100,
        treatment_type: 'consultation',
        provider_name: 'Test Clinic'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/R500/);
  });

  test('returns 400 when bill_amount exceeds R500,000', async () => {
    setupAuthMock();

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        bill_amount: 600000,
        treatment_type: 'consultation',
        provider_name: 'Test Clinic'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/R500,000/);
  });

  test('returns 404 when user record not found in DB', async () => {
    setupAuthMock([
      { rows: [], rowCount: 0 } // userCheck → not found
    ]);

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        bill_amount: 2000,
        treatment_type: 'consultation',
        provider_name: 'Test Clinic'
      });

    expect(res.status).toBe(404);
  });

  test('returns 403 when user account is not active', async () => {
    setupAuthMock([
      { rows: [{ credit_limit: 850, status: 'pending' }], rowCount: 1 } // userCheck
    ]);

    const res = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        bill_amount: 2000,
        treatment_type: 'consultation',
        provider_name: 'Test Clinic'
      });

    expect(res.status).toBe(403);
  });
});
