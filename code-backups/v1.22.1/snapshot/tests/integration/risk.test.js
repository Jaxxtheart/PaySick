/**
 * Integration Tests — Risk Routes
 *
 * All risk routes require admin role.
 * Tests: portfolio-summary, distribution, health-score-distribution.
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

const request = require('supertest');
const app = require('../../backend/src/server');
const crypto = require('crypto');

const mockAdminId = 'admin-uuid-1111-2222-3333-4444444444';
const mockToken = crypto.randomBytes(32).toString('hex');

const adminSessionRow = {
  user_id: mockAdminId,
  role: 'admin',
  email: 'admin@paysick.com',
  revoked: false,
  access_expires_at: new Date(Date.now() + 3600000).toISOString()
};

const userSessionRow = {
  user_id: 'regular-user-id',
  role: 'user',
  email: 'user@paysick.com',
  revoked: false,
  access_expires_at: new Date(Date.now() + 3600000).toISOString()
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

function adminAuthMock(...extras) {
  mockQuery
    .mockResolvedValueOnce({ rows: [adminSessionRow], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });
  extras.forEach(e => mockQuery.mockResolvedValueOnce(e));
}

function userAuthMock(...extras) {
  mockQuery
    .mockResolvedValueOnce({ rows: [userSessionRow], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });
  extras.forEach(e => mockQuery.mockResolvedValueOnce(e));
}

// ─────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────
describe('Risk routes — access control', () => {
  const adminRoutes = [
    '/api/risk/portfolio-summary',
    '/api/risk/distribution',
    '/api/risk/health-score-distribution'
  ];

  test.each(adminRoutes)('%s returns 401 without auth', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
  });

  test.each(adminRoutes)('%s returns 403 for non-admin user', async (path) => {
    userAuthMock();
    const res = await request(app)
      .get(path)
      .set('Authorization', `Bearer ${mockToken}`);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────
// GET /api/risk/portfolio-summary
// ─────────────────────────────────────────────
describe('GET /api/risk/portfolio-summary', () => {
  test('returns portfolio summary for admin', async () => {
    adminAuthMock({
      rows: [{
        total_assessments: '100',
        avg_pd: '0.03',
        avg_lgd: '0.42',
        avg_expected_loss_rate: '0.013',
        total_exposure: '250000',
        total_expected_loss: '3250',
        approved_count: '80',
        declined_count: '12',
        review_count: '8'
      }],
      rowCount: 1
    });

    const res = await request(app)
      .get('/api/risk/portfolio-summary')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.targets).toBeDefined();
    expect(res.body.performance_vs_target).toBeDefined();
    expect(res.body.targets.target_pd).toBe(0.032);
  });
});

// ─────────────────────────────────────────────
// GET /api/risk/distribution
// ─────────────────────────────────────────────
describe('GET /api/risk/distribution', () => {
  test('returns risk band distribution for admin', async () => {
    adminAuthMock({
      rows: [
        { pd_band: 'A', count: '30', avg_pd: '0.01', avg_el_rate: '0.005', total_exposure: '50000' },
        { pd_band: 'B', count: '50', avg_pd: '0.03', avg_el_rate: '0.013', total_exposure: '100000' }
      ],
      rowCount: 2
    });

    const res = await request(app)
      .get('/api/risk/distribution')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.distribution)).toBe(true);
    expect(res.body.distribution[0].pd_band).toBe('A');
  });
});
