/**
 * Integration Tests — Provider Dashboard Routes
 *
 * Tests: GET /api/providers/dashboard/overview,
 *        GET /api/providers/dashboard/patients,
 *        GET /api/providers/dashboard/settlements,
 *        GET /api/providers/dashboard/trust-tier,
 *        GET /api/providers/dashboard/payment-performance,
 *        GET /api/providers/dashboard/revenue-monthly
 *
 * Written BEFORE implementation (test-first workflow).
 */

const mockQuery = jest.fn();

jest.mock('../../backend/src/config/database', () => ({
  query: mockQuery,
  transaction: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
  pool: { on: jest.fn() }
}));

jest.mock('../../backend/src/services/email.service', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({})
}));

jest.mock('../../backend/src/services/security.service', () => ({
  encryptBankingData: jest.fn().mockReturnValue('encrypted'),
  decryptBankingData: jest.fn().mockReturnValue('123456789'),
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  verifyPassword: jest.fn().mockResolvedValue(true),
  sanitizeObject: jest.fn(o => o),
  validateEnvironment: jest.fn(),
  validateAccessToken: jest.fn(),
  logSecurityEvent: jest.fn(),
  isIPBlocked: jest.fn().mockResolvedValue(false)
}));

const request = require('supertest');
const app = require('../../backend/src/server');

// Helper: stub token lookup for provider auth
function mockProviderAuth(providerId = 'p-dash-1') {
  mockQuery
    // First call: validate token
    .mockResolvedValueOnce({
      rows: [{
        token_id: 'tok1', user_id: 'u-prov-1', is_valid: true,
        expires_at: new Date(Date.now() + 3600000)
      }],
      rowCount: 1
    })
    // Second call: get user (provider role)
    .mockResolvedValueOnce({
      rows: [{
        user_id: 'u-prov-1', email: 'provider@test.com', role: 'provider',
        status: 'active', provider_id: providerId
      }],
      rowCount: 1
    });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────
describe('Provider Dashboard — Access Control', () => {

  test('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/providers/dashboard/overview');
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-provider role (user)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          token_id: 'tok1', user_id: 'u1', is_valid: true,
          expires_at: new Date(Date.now() + 3600000)
        }],
        rowCount: 1
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'u1', email: 'user@test.com', role: 'user', status: 'active' }],
        rowCount: 1
      });

    const res = await request(app)
      .get('/api/providers/dashboard/overview')
      .set('Authorization', 'Bearer fake-token');
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/dashboard/overview
// ─────────────────────────────────────────────
describe('GET /api/providers/dashboard/overview', () => {

  test('returns overview stats for authenticated provider', async () => {
    mockProviderAuth();

    // Third call: overview stats query
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_patients: '15',
        total_applications: '20',
        total_revenue: '85000.00',
        active_plans: '8',
        overdue_count: '2',
        avg_risk_score: '42',
        approval_rate: '75.00'
      }],
      rowCount: 1
    });

    const res = await request(app)
      .get('/api/providers/dashboard/overview')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_patients');
    expect(res.body).toHaveProperty('total_applications');
    expect(res.body).toHaveProperty('total_revenue');
    expect(res.body).toHaveProperty('active_plans');
    expect(res.body).toHaveProperty('overdue_count');
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/dashboard/patients
// ─────────────────────────────────────────────
describe('GET /api/providers/dashboard/patients', () => {

  test('returns patient list for authenticated provider', async () => {
    mockProviderAuth();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          full_name: 'John Doe',
          treatment_type: 'consultation',
          bill_amount: '5000.00',
          plan_status: 'active',
          risk_score: 35,
          payments_made: 1,
          outstanding_balance: '3334.00',
          application_date: '2026-03-01'
        }
      ],
      rowCount: 1
    });

    const res = await request(app)
      .get('/api/providers/dashboard/patients')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.patients)).toBe(true);
    expect(res.body.patients[0]).toHaveProperty('full_name');
    expect(res.body.patients[0]).toHaveProperty('plan_status');
  });

  test('returns empty array when provider has no patients', async () => {
    mockProviderAuth();

    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .get('/api/providers/dashboard/patients')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(res.body.patients).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/dashboard/settlements
// ─────────────────────────────────────────────
describe('GET /api/providers/dashboard/settlements', () => {

  test('returns settlement list for authenticated provider', async () => {
    mockProviderAuth();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          settlement_id: 's1',
          period_start: '2026-03-01',
          period_end: '2026-03-31',
          gross_amount: '50000.00',
          commission_amount: '2500.00',
          net_amount: '47500.00',
          status: 'paid',
          line_items: '5'
        }
      ],
      rowCount: 1
    });

    const res = await request(app)
      .get('/api/providers/dashboard/settlements')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.settlements)).toBe(true);
    expect(res.body.settlements[0]).toHaveProperty('gross_amount');
    expect(res.body.settlements[0]).toHaveProperty('net_amount');
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/dashboard/trust-tier
// ─────────────────────────────────────────────
describe('GET /api/providers/dashboard/trust-tier', () => {

  test('returns trust tier info for authenticated provider', async () => {
    mockProviderAuth();

    // Provider lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{
        provider_id: 'p-dash-1',
        partnership_tier: 'standard'
      }],
      rowCount: 1
    });

    // Risk score lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{
        composite_score: 72
      }],
      rowCount: 1
    });

    const res = await request(app)
      .get('/api/providers/dashboard/trust-tier')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('current_tier');
    expect(res.body).toHaveProperty('composite_score');
    expect(res.body).toHaveProperty('holdback_pct');
    expect(res.body).toHaveProperty('payout_speed_days');
    expect(res.body).toHaveProperty('next_tier');
    expect(res.body).toHaveProperty('upgrade_criteria');
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/dashboard/payment-performance
// ─────────────────────────────────────────────
describe('GET /api/providers/dashboard/payment-performance', () => {

  test('returns payment performance metrics', async () => {
    mockProviderAuth();

    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_payments: '100',
        on_time_count: '85',
        failed_count: '10',
        in_collections_count: '5',
        avg_days_to_pay: '2.3'
      }],
      rowCount: 1
    });

    const res = await request(app)
      .get('/api/providers/dashboard/payment-performance')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_payments');
    expect(res.body).toHaveProperty('on_time_rate');
    expect(res.body).toHaveProperty('failed_rate');
    expect(res.body).toHaveProperty('collection_rate');
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/dashboard/revenue-monthly
// ─────────────────────────────────────────────
describe('GET /api/providers/dashboard/revenue-monthly', () => {

  test('returns monthly revenue breakdown', async () => {
    mockProviderAuth();

    mockQuery.mockResolvedValueOnce({
      rows: [
        { month: '2026-01', gross: '25000.00', net: '23750.00', patient_count: '5' },
        { month: '2026-02', gross: '32000.00', net: '30400.00', patient_count: '7' }
      ],
      rowCount: 2
    });

    const res = await request(app)
      .get('/api/providers/dashboard/revenue-monthly')
      .set('Authorization', 'Bearer test-provider-token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.months)).toBe(true);
    expect(res.body.months[0]).toHaveProperty('month');
    expect(res.body.months[0]).toHaveProperty('gross');
    expect(res.body.months[0]).toHaveProperty('net');
  });
});
