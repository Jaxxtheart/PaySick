/**
 * Integration Tests — Providers Routes
 *
 * Tests: GET / (list with filters), GET /search/:term, GET /:id
 * Providers routes are public (no auth required).
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
    // Verify query was called (filtering happens in SQL)
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
