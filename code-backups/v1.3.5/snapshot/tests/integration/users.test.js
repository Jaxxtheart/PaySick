/**
 * Integration Tests — Users Routes
 *
 * Covers: register, verify-email, resend-verification, login, demo-login,
 *         logout, profile (GET/PUT), banking (GET/POST), change-password, dashboard.
 *
 * The database and email service are fully mocked.
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

// Helper: build a valid Bearer header using the security service directly
const crypto = require('crypto');

// Shared valid session token for authenticated tests
let validAccessToken;
let mockUserId;

beforeAll(async () => {
  // We can't create a real session without a DB, so we'll simulate auth by
  // directly calling createSession with a mocked DB.

  // For authenticated tests, mock the DB to return a valid session row
  // when the auth middleware queries for the token.
  mockUserId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  // Generate a random token that looks like what the service produces
  validAccessToken = crypto.randomBytes(32).toString('hex');
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default DB mock: empty rows
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockTransaction.mockImplementation(async (cb) => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release: jest.fn() };
    return cb(client);
  });
});

// ─────────────────────────────────────────────
// POST /api/users/register
// ─────────────────────────────────────────────
describe('POST /api/users/register', () => {
  const validPayload = {
    full_name: 'Test User',
    email: 'test@example.co.za',
    password: 'SecurePass1',
    cell_number: '0821234567',
    sa_id_number: '9001015009087',
    postal_code: '2000',
    date_of_birth: '1990-01-01',
    terms_accepted: true,
    popia_consent: true
  };

  test('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ email: 'test@example.com', password: 'pass' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for weak password (no uppercase)', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ ...validPayload, password: 'lowercase1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WEAK_PASSWORD');
  });

  test('returns 400 for invalid SA ID number (12 digits)', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ ...validPayload, sa_id_number: '900101500908' });
    expect(res.status).toBe(400);
  });

  test('returns 400 when terms_accepted is false', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ ...validPayload, terms_accepted: false });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({ ...validPayload, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  test('returns 409 when email already exists', async () => {
    // existingUser check returns a row
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // IP block check
      .mockResolvedValueOnce({ rows: [{ user_id: 'existing-id' }], rowCount: 1 }); // duplicate check

    const res = await request(app)
      .post('/api/users/register')
      .send(validPayload);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('USER_EXISTS');
  });

  test('returns 201 on successful registration', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // IP block check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // duplicate check
      .mockResolvedValueOnce({ // INSERT user
        rows: [{
          user_id: mockUserId,
          full_name: 'Test User',
          email: 'test@example.co.za',
          cell_number: '0821234567',
          status: 'pending',
          role: 'user',
          created_at: new Date()
        }],
        rowCount: 1
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // logSecurityEvent

    const res = await request(app)
      .post('/api/users/register')
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.requiresEmailVerification).toBe(true);
    expect(res.body.email).toBe('test@example.co.za');
  });
});

// ─────────────────────────────────────────────
// POST /api/users/login
// ─────────────────────────────────────────────
describe('POST /api/users/login', () => {
  test('returns 400 when email and password are missing', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 when user does not exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // IP block check
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // user lookup → not found
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // recordFailedLogin

    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'nobody@example.com', password: 'SomePass1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  test('returns 403 when account status is pending (email unverified)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // IP block check
      .mockResolvedValueOnce({
        rows: [{
          user_id: mockUserId,
          email: 'user@example.com',
          password_hash: 'somehash',
          status: 'pending',
          role: 'user',
          failed_login_attempts: 0,
          locked_until: null
        }],
        rowCount: 1
      });

    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'user@example.com', password: 'SomePass1' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_UNVERIFIED');
  });

  test('returns 403 for suspended account', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [{
          user_id: mockUserId,
          status: 'suspended',
          password_hash: 'x',
          failed_login_attempts: 0,
          locked_until: null
        }],
        rowCount: 1
      });

    const res = await request(app)
      .post('/api/users/login')
      .send({ email: 'user@example.com', password: 'SomePass1' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });
});

// ─────────────────────────────────────────────
// POST /api/users/demo-login
// ─────────────────────────────────────────────
describe('POST /api/users/demo-login', () => {
  test('returns 401 for invalid demo email', async () => {
    const res = await request(app)
      .post('/api/users/demo-login')
      .send({ email: 'notademo@example.com' });
    expect(res.status).toBe(401);
  });

  test('returns 200 for valid demo user (user@paysick.com)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: mockUserId }], rowCount: 1 }) // user exists
      // createSession internals: INSERT session
      .mockResolvedValueOnce({ rows: [{ session_id: 'sess-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // logSecurityEvent

    const res = await request(app)
      .post('/api/users/demo-login')
      .send({ email: 'user@paysick.com' });

    expect(res.status).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.accessToken).toBeDefined();
  });

  test('creates the demo user if not found', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // user doesn't exist
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT ... ON CONFLICT DO NOTHING
      .mockResolvedValueOnce({ rows: [{ user_id: mockUserId }], rowCount: 1 }) // re-fetch
      // createSession
      .mockResolvedValueOnce({ rows: [{ session_id: 'sess-2' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // logSecurityEvent

    const res = await request(app)
      .post('/api/users/demo-login')
      .send({ email: 'admin@paysick.com' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});

// ─────────────────────────────────────────────
// POST /api/users/verify-email
// ─────────────────────────────────────────────
describe('POST /api/users/verify-email', () => {
  test('returns 400 for a token that is not 64 chars', async () => {
    const res = await request(app)
      .post('/api/users/verify-email')
      .send({ token: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  test('returns 400 when token is not in DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const fakeToken = 'a'.repeat(64);
    const res = await request(app)
      .post('/api/users/verify-email')
      .send({ token: fakeToken });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  test('returns 400 for expired token', async () => {
    const expiredTime = new Date(Date.now() - 1000).toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [{
        user_id: mockUserId,
        full_name: 'Test',
        email: 'test@example.com',
        role: 'user',
        email_verification_expires: expiredTime
      }],
      rowCount: 1
    });

    const fakeToken = 'b'.repeat(64);
    const res = await request(app)
      .post('/api/users/verify-email')
      .send({ token: fakeToken });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

// ─────────────────────────────────────────────
// POST /api/users/resend-verification
// ─────────────────────────────────────────────
describe('POST /api/users/resend-verification', () => {
  test('returns 400 when email is not provided', async () => {
    const res = await request(app)
      .post('/api/users/resend-verification')
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns generic 200 when email is not in DB (anti-enumeration)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/users/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If this email');
  });
});

// ─────────────────────────────────────────────
// Token refresh
// ─────────────────────────────────────────────
describe('POST /api/users/refresh-token', () => {
  test('returns 400 when refreshToken is not provided', async () => {
    const res = await request(app)
      .post('/api/users/refresh-token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  test('returns 401 for an invalid/expired refresh token', async () => {
    // refreshAccessToken will query DB and find nothing
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post('/api/users/refresh-token')
      .send({ refreshToken: 'invalid-token-value' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

// ─────────────────────────────────────────────
// Authenticated routes (no valid token = 401)
// ─────────────────────────────────────────────
describe('Authenticated routes without token', () => {
  const authRoutes = [
    ['GET', '/api/users/profile'],
    ['PUT', '/api/users/profile'],
    ['GET', '/api/users/banking'],
    ['POST', '/api/users/banking'],
    ['POST', '/api/users/change-password'],
    ['POST', '/api/users/logout'],
    ['GET', '/api/users/dashboard']
  ];

  test.each(authRoutes)('%s %s returns 401 without Authorization header', async (method, path) => {
    const res = await request(app)[method.toLowerCase()](path);
    expect(res.status).toBe(401);
  });
});
