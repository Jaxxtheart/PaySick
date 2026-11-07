/**
 * Integration Tests — Payments Routes
 *
 * Tests: GET /plans, GET /plans/:id, GET /upcoming, GET /history,
 *        POST /:payment_id/pay, GET /:payment_id/transactions
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
  sendVerificationEmail: jest.fn().mockResolvedValue({})
}));

const request = require('supertest');
const app = require('../../backend/src/server');
const crypto = require('crypto');

const mockUserId = 'user-pay-1111-2222-3333-444444444444';
const mockToken = crypto.randomBytes(32).toString('hex');

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
      query: jest.fn().mockResolvedValue({ rows: [{ transaction_id: 'txn-1', amount: 500 }], rowCount: 1 }),
      release: jest.fn()
    };
    return cb(client);
  });
});

function authMock(...extras) {
  mockQuery
    .mockResolvedValueOnce({ rows: [validSessionRow], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });
  extras.forEach(e => mockQuery.mockResolvedValueOnce(e));
}

// ─────────────────────────────────────────────
// GET /api/payments/plans
// ─────────────────────────────────────────────
describe('GET /api/payments/plans', () => {
  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/payments/plans');
    expect(res.status).toBe(401);
  });

  test('returns empty array when no plans', async () => {
    authMock({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/api/payments/plans')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('returns plans list', async () => {
    authMock({
      rows: [{ plan_id: 'plan-1', total_amount: 3000, status: 'active' }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/api/payments/plans')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].plan_id).toBe('plan-1');
  });
});

// ─────────────────────────────────────────────
// GET /api/payments/plans/:id
// ─────────────────────────────────────────────
describe('GET /api/payments/plans/:id', () => {
  test('returns 404 when plan not found', async () => {
    authMock({ rows: [], rowCount: 0 });
    const res = await request(app)
      .get('/api/payments/plans/nonexistent')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(404);
  });

  test('returns plan with payments', async () => {
    authMock(
      { rows: [{ plan_id: 'plan-1', total_amount: 3000 }], rowCount: 1 }, // plan
      { rows: [{ payment_id: 'pmt-1', amount: 1000, status: 'scheduled' }], rowCount: 1 } // payments
    );
    const res = await request(app)
      .get('/api/payments/plans/plan-1')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe('plan-1');
    expect(Array.isArray(res.body.payments)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// GET /api/payments/upcoming
// ─────────────────────────────────────────────
describe('GET /api/payments/upcoming', () => {
  test('returns upcoming payments', async () => {
    authMock({
      rows: [{ payment_id: 'pmt-2', due_date: '2026-04-01', status: 'scheduled' }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/api/payments/upcoming')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// GET /api/payments/history
// ─────────────────────────────────────────────
describe('GET /api/payments/history', () => {
  test('returns payment history', async () => {
    authMock({
      rows: [{ payment_id: 'pmt-3', status: 'paid', payment_date: new Date() }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/api/payments/history')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ─────────────────────────────────────────────
// POST /api/payments/:payment_id/pay
// ─────────────────────────────────────────────
describe('POST /api/payments/:payment_id/pay', () => {
  test('returns 404 when payment not found', async () => {
    authMock({ rows: [], rowCount: 0 }); // payment not found
    const res = await request(app)
      .post('/api/payments/nonexistent/pay')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ amount: 1000, payment_method: 'eft' });
    expect(res.status).toBe(404);
  });

  test('returns 400 when payment is already paid', async () => {
    authMock({
      rows: [{ payment_id: 'pmt-1', status: 'paid', amount: 1000, plan_id: 'plan-1' }],
      rowCount: 1
    });
    const res = await request(app)
      .post('/api/payments/pmt-1/pay')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ payment_method: 'eft' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already completed/i);
  });

  test('returns 200 and transaction on successful payment', async () => {
    authMock({
      rows: [{
        payment_id: 'pmt-1',
        status: 'scheduled',
        amount: 1000,
        plan_id: 'plan-1',
        payment_number: 1,
        total_paid: 0,
        payments_made: 0
      }],
      rowCount: 1
    });

    const res = await request(app)
      .post('/api/payments/pmt-1/pay')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ payment_method: 'eft' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/processed successfully/i);
    expect(res.body.transaction).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// GET /api/payments/:payment_id/transactions
// ─────────────────────────────────────────────
describe('GET /api/payments/:payment_id/transactions', () => {
  test('returns transactions list', async () => {
    authMock({
      rows: [{ transaction_id: 'txn-1', amount: 1000 }],
      rowCount: 1
    });
    const res = await request(app)
      .get('/api/payments/pmt-1/transactions')
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
