/**
 * Integration Tests — Providers Routes
 *
 * Tests: GET / (list with filters), GET /search/:term, GET /:id,
 *        POST /track-cta, POST /apply,
 *        Admin routes: GET /admin/all, GET /admin/stats,
 *          PUT /admin/:id/approve, PUT /admin/:id/status,
 *          PUT /admin/:id, DELETE /admin/:id
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

// Mock security service so encryptBankingData works without a real key env var
jest.mock('../../backend/src/services/security.service', () => ({
  encryptBankingData: jest.fn().mockReturnValue('encrypted-account-number'),
  decryptBankingData: jest.fn().mockReturnValue('123456789'),
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  verifyPassword: jest.fn().mockResolvedValue(true),
  sanitizeObject: jest.fn(o => o),
  validateEnvironment: jest.fn()
}));

const request = require('supertest');
const app = require('../../backend/src/server');

// Helper: stub token lookup for admin auth
function mockAdminAuth() {
  mockQuery.mockResolvedValueOnce({
    rows: [{
      token_id: 'tok1', user_id: 'u1', is_valid: true,
      expires_at: new Date(Date.now() + 3600000)
    }],
    rowCount: 1
  }).mockResolvedValueOnce({
    rows: [{ user_id: 'u1', email: 'admin@test.com', role: 'admin', status: 'active' }],
    rowCount: 1
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ─────────────────────────────────────────────
// GET /api/providers
// ─────────────────────────────────────────────
describe('GET /api/providers', () => {
  test('returns empty array when no providers exist', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  test('returns list of active providers', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { provider_id: 'p1', provider_name: 'City Hospital', status: 'active' },
        { provider_id: 'p2', provider_name: 'Health Clinic', status: 'active' }
      ],
      rowCount: 2
    });

    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].provider_name).toBe('City Hospital');
  });

  test('accepts network_partner filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/providers?network_partner=true');
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  test('accepts provider_type filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/providers?provider_type=hospital');
    expect(res.status).toBe(200);
  });

  test('accepts city filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/providers?city=Johannesburg');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/search/:term
// ─────────────────────────────────────────────
describe('GET /api/providers/search/:term', () => {
  test('returns matching providers', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ provider_id: 'p1', provider_name: 'Netcare Johannesburg' }],
      rowCount: 1
    });

    const res = await request(app).get('/api/providers/search/Netcare');
    expect(res.status).toBe(200);
    expect(res.body[0].provider_name).toBe('Netcare Johannesburg');
  });

  test('returns empty array when no matches', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/providers/search/xxxxxxxxxxx');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// POST /api/providers/track-cta
// ─────────────────────────────────────────────
describe('POST /api/providers/track-cta', () => {
  test('always returns success even if DB fails', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .post('/api/providers/track-cta')
      .send({ source: 'homepage', page: 'index.html', timestamp: Date.now() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns success and logs CTA click', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // audit_log insert
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // stats upsert

    const res = await request(app)
      .post('/api/providers/track-cta')
      .send({ source: 'providers-page', page: 'providers.html', timestamp: Date.now() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─────────────────────────────────────────────
// POST /api/providers/apply
// ─────────────────────────────────────────────
describe('POST /api/providers/apply', () => {
  const validApplication = {
    provider_name: 'Test Hospital',
    provider_type: 'hospital',
    provider_group: 'Test Group',
    contact_email: 'info@testhospital.co.za',
    contact_phone: '011 555 0000',
    address: '1 Main Road',
    city: 'Johannesburg',
    province: 'Gauteng',
    postal_code: '2001',
    bank_name: 'Standard Bank',
    branch_code: '051001',
    account_number: '1234567890',
    account_holder: 'Test Hospital (Pty) Ltd',
    terms_accepted: true,
    popia_consent: true,
    commission_agreement: true
  };

  test('returns 201 on successful application', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ provider_id: 'new-p-id' }],
      rowCount: 1
    });

    const res = await request(app)
      .post('/api/providers/apply')
      .send(validApplication);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.provider_id).toBe('new-p-id');
  });

  test('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/providers/apply')
      .send({ provider_name: 'Incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing required fields/i);
  });

  test('returns 400 when consents are missing', async () => {
    const res = await request(app)
      .post('/api/providers/apply')
      .send({ ...validApplication, terms_accepted: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/consents/i);
  });

  test('encrypts account number with AES not base64', async () => {
    const { encryptBankingData } = require('../../backend/src/services/security.service');
    mockQuery.mockResolvedValueOnce({ rows: [{ provider_id: 'x' }], rowCount: 1 });

    await request(app).post('/api/providers/apply').send(validApplication);

    expect(encryptBankingData).toHaveBeenCalledWith(validApplication.account_number);
  });
});

// ─────────────────────────────────────────────
// GET /api/providers/:id
// ─────────────────────────────────────────────
describe('GET /api/providers/:id', () => {
  test('returns provider when found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ provider_id: 'p1', provider_name: 'City Hospital', city: 'Cape Town' }],
      rowCount: 1
    });

    const res = await request(app).get('/api/providers/p1');
    expect(res.status).toBe(200);
    expect(res.body.provider_id).toBe('p1');
    expect(res.body.city).toBe('Cape Town');
  });

  test('returns 404 when provider not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await request(app).get('/api/providers/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Provider not found/i);
  });
});

// ─────────────────────────────────────────────
// ADMIN ROUTES — all require authentication + admin role
// ─────────────────────────────────────────────
describe('Admin provider routes — access control', () => {
  test('GET /admin/all returns 401 without auth', async () => {
    const res = await request(app).get('/api/providers/admin/all');
    expect(res.status).toBe(401);
  });

  test('GET /admin/stats returns 401 without auth', async () => {
    const res = await request(app).get('/api/providers/admin/stats');
    expect(res.status).toBe(401);
  });

  test('PUT /admin/:id/approve returns 401 without auth', async () => {
    const res = await request(app).put('/api/providers/admin/p1/approve');
    expect(res.status).toBe(401);
  });

  test('PUT /admin/:id/status returns 401 without auth', async () => {
    const res = await request(app).put('/api/providers/admin/p1/status');
    expect(res.status).toBe(401);
  });

  test('DELETE /admin/:id returns 401 without auth', async () => {
    const res = await request(app).delete('/api/providers/admin/p1');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/providers/admin/all — authenticated admin', () => {
  test('returns all providers including pending', async () => {
    mockAdminAuth();
    mockQuery.mockResolvedValueOnce({
      rows: [
        { provider_id: 'p1', status: 'active' },
        { provider_id: 'p2', status: 'pending' }
      ],
      rowCount: 2
    });

    const res = await request(app)
      .get('/api/providers/admin/all')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('PUT /api/providers/admin/:id/approve — authenticated admin', () => {
  test('approves a pending provider', async () => {
    mockAdminAuth();
    mockQuery.mockResolvedValueOnce({
      rows: [{ provider_id: 'p1', status: 'active', network_partner: true }],
      rowCount: 1
    });

    const res = await request(app)
      .put('/api/providers/admin/p1/approve')
      .set('Authorization', 'Bearer valid-token')
      .send({ network_partner: true, partnership_tier: 'gold' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('returns 404 when provider does not exist', async () => {
    mockAdminAuth();
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .put('/api/providers/admin/nonexistent/approve')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/providers/admin/:id/status — authenticated admin', () => {
  test('rejects invalid status values', async () => {
    mockAdminAuth();

    const res = await request(app)
      .put('/api/providers/admin/p1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'deleted' }); // not allowed

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid status/i);
  });

  test('updates to valid status', async () => {
    mockAdminAuth();
    mockQuery.mockResolvedValueOnce({
      rows: [{ provider_id: 'p1', status: 'suspended' }],
      rowCount: 1
    });

    const res = await request(app)
      .put('/api/providers/admin/p1/status')
      .set('Authorization', 'Bearer valid-token')
      .send({ status: 'suspended' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
