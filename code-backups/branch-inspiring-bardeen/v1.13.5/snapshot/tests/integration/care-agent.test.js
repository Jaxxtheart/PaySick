'use strict';

/**
 * Integration Tests — Care Agent Routes
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Mirrors tests/integration/applications.test.js: auth middleware is
 * exercised for real (opaque token → DB session lookup), everything else
 * is mocked. patient-gate.service is mocked outright so these tests never
 * depend on Shield's own internal query sequence — only on the contract
 * care-agent.js has with it.
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

const mockAssessApplication = jest.fn();
jest.mock('../../backend/src/services/patient-gate.service', () => ({
  patientGateService: { assessApplication: (...args) => mockAssessApplication(...args) }
}));

const request = require('supertest');
const app = require('../../backend/src/server');
const crypto = require('crypto');

const mockUserId = 'user-uuid-1111-2222-3333-4444444444';
const otherUserId = 'user-uuid-9999-8888-7777-666666666666';
const mockToken = crypto.randomBytes(32).toString('hex');
const sessionId = 'care-session-aaaa-bbbb-cccc-111111111111';

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
});

function setupAuthMock(extraMocks = []) {
  mockQuery
    .mockResolvedValueOnce({ rows: [validSessionRow], rowCount: 1 }) // session lookup
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });               // update last_activity
  extraMocks.forEach((m) => mockQuery.mockResolvedValueOnce(m));
}

function careAgentSessionRow(overrides = {}) {
  return {
    session_id: sessionId,
    user_id: mockUserId,
    stage: 'need',
    structured_summary: {},
    confirmed: false,
    approved: false,
    selected_term_months: null,
    application_id: null,
    ...overrides
  };
}

// ─────────────────────────────────────────────
// Auth is required on every route
// ─────────────────────────────────────────────
describe('Care Agent routes require authentication', () => {
  test('POST /api/care-agent/sessions returns 401 without a token', async () => {
    const res = await request(app).post('/api/care-agent/sessions');
    expect(res.status).toBe(401);
  });

  test('POST /api/care-agent/sessions/:id/messages returns 401 without a token', async () => {
    const res = await request(app).post(`/api/care-agent/sessions/${sessionId}/messages`).send({ message: 'hi' });
    expect(res.status).toBe(401);
  });

  test('GET /api/care-agent/sessions/:id/manage returns 401 without a token', async () => {
    const res = await request(app).get(`/api/care-agent/sessions/${sessionId}/manage`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// POST /api/care-agent/sessions
// ─────────────────────────────────────────────
describe('POST /api/care-agent/sessions', () => {
  test('creates a new session and returns the opening question', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow()], rowCount: 1 }, // INSERT session
      { rows: [], rowCount: 0 }                       // INSERT audit log
    ]);

    const res = await request(app)
      .post('/api/care-agent/sessions')
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.stage).toBe('need');
    expect(res.body.missingFields).toEqual(
      expect.arrayContaining(['treatmentDescription', 'quotedAmountCents', 'schemeContributionCents'])
    );
    expect(typeof res.body.reply).toBe('string');
  });
});

// ─────────────────────────────────────────────
// POST /api/care-agent/sessions/:id/messages
// ─────────────────────────────────────────────
describe('POST /api/care-agent/sessions/:id/messages', () => {
  test('extracts fields from free text and asks the next progressive question', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow()], rowCount: 1 }, // SELECT session
      { rows: [], rowCount: 0 },                      // UPDATE session
      { rows: [], rowCount: 0 }                       // INSERT audit log
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ message: 'My dentist quoted R48,000 for two dental implants.' });

    expect(res.status).toBe(200);
    expect(res.body.summary.quotedAmountCents).toBe(4800000);
    expect(res.body.summary.treatmentDescription).toBeTruthy();
    expect(res.body.readyToConfirm).toBe(false);
    expect(res.body.reply).toMatch(/medical aid|scheme/i);
  });

  test('never invents a scheme contribution the patient did not state', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow()], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ message: 'My dentist quoted R48,000 and I think Discovery will cover some of it.' });

    expect(res.status).toBe(200);
    expect('schemeContributionCents' in res.body.summary).toBe(false);
    expect(res.body.missingFields).toContain('schemeContributionCents');
  });

  test('returns 404 when the session belongs to a different user', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({ user_id: otherUserId })], rowCount: 1 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ message: 'hello' });

    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────
// POST /api/care-agent/sessions/:id/confirm
// ─────────────────────────────────────────────
describe('POST /api/care-agent/sessions/:id/confirm', () => {
  test('rejects confirmation while required fields are still missing', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({ structured_summary: { treatmentDescription: 'dental implants' } })], rowCount: 1 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/confirm`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ summary: {} });

    expect(res.status).toBe(400);
    expect(res.body.missingFields).toContain('quotedAmountCents');
  });

  test('confirms a complete summary and returns zero-interest term options', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({
          structured_summary: {
            treatmentDescription: 'dental implants',
            quotedAmountCents: 4800000,
            schemeContributionCents: 1660000
          }
        })], rowCount: 1 },
      { rows: [], rowCount: 0 }, // UPDATE session
      { rows: [], rowCount: 0 }  // INSERT audit log
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/confirm`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ summary: {} });

    expect(res.status).toBe(200);
    expect(res.body.shortfallCents).toBe(3140000);
    expect(res.body.options).toHaveLength(3);
    expect(res.body.options[0]).toHaveProperty('termMonths');
    expect(res.body.options[0]).toHaveProperty('monthlyPaymentCents');
    expect(mockAssessApplication).not.toHaveBeenCalled();
  });

  test('runs the Shield affordability assessment when income is supplied, and never fabricates its own recommendation', async () => {
    mockAssessApplication.mockResolvedValueOnce({ decision: 'APPROVE', rationale: ['within comfort zone'] });
    setupAuthMock([
      { rows: [careAgentSessionRow({
          structured_summary: {
            treatmentDescription: 'dental implants',
            quotedAmountCents: 4800000,
            schemeContributionCents: 1660000
          }
        })], rowCount: 1 },
      { rows: [], rowCount: 0 },
      { rows: [], rowCount: 0 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/confirm`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ summary: {}, monthlyIncome: 25000, monthlyObligations: 5000 });

    expect(res.status).toBe(200);
    expect(mockAssessApplication).toHaveBeenCalledTimes(1);
    expect(res.body.shieldAssessment.decision).toBe('APPROVE');
  });
});

// ─────────────────────────────────────────────
// POST /api/care-agent/sessions/:id/approve
// ─────────────────────────────────────────────
describe('POST /api/care-agent/sessions/:id/approve', () => {
  test('refuses to approve an unconfirmed session', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({ confirmed: false })], rowCount: 1 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/approve`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ selectedTermMonths: 3, dataSharingAcknowledged: true });

    expect(res.status).toBe(400);
  });

  test('refuses to approve without explicit data-sharing consent', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({ confirmed: true })], rowCount: 1 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/approve`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ selectedTermMonths: 3, dataSharingAcknowledged: false });

    expect(res.status).toBe(400);
  });

  test('approves a confirmed session with consent and hands back the exact payload for the existing marketplace endpoint', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({
          confirmed: true,
          structured_summary: {
            treatmentDescription: 'dental implants',
            quotedAmountCents: 4800000,
            schemeContributionCents: 1660000,
            procedureTypeGuess: 'dental_implants'
          }
        })], rowCount: 1 },
      { rows: [], rowCount: 0 }, // UPDATE session
      { rows: [], rowCount: 0 }  // INSERT audit log
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/approve`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ selectedTermMonths: 3, dataSharingAcknowledged: true });

    expect(res.status).toBe(200);
    expect(res.body.readyToExecute).toBe(true);
    expect(res.body.executeEndpoint).toBe('/api/marketplace/applications');
    expect(res.body.applicationPayload.requestedTerm).toBe(3);
    expect(res.body.applicationPayload.loanAmount).toBeCloseTo(31400, 0);
  });
});

// ─────────────────────────────────────────────
// POST /api/care-agent/sessions/:id/execute
// ─────────────────────────────────────────────
describe('POST /api/care-agent/sessions/:id/execute', () => {
  test('refuses to record execution before approval', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({ approved: false })], rowCount: 1 }
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/execute`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ applicationId: 'app-123' });

    expect(res.status).toBe(400);
  });

  test('links the resulting application id once approved', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow({ approved: true })], rowCount: 1 },
      { rows: [], rowCount: 0 }, // UPDATE session
      { rows: [], rowCount: 0 }  // INSERT audit log
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/execute`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ applicationId: 'app-123' });

    expect(res.status).toBe(200);
    expect(res.body.applicationId).toBe('app-123');
    expect(res.body.stage).toBe('execute');
  });
});

// ─────────────────────────────────────────────
// GET /api/care-agent/sessions/:id/manage
// ─────────────────────────────────────────────
describe('GET /api/care-agent/sessions/:id/manage', () => {
  test('reports the next scheduled payment when one exists', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow()], rowCount: 1 },
      { rows: [{ amount: 2910, due_date: '2026-10-25' }], rowCount: 1 }
    ]);

    const res = await request(app)
      .get(`/api/care-agent/sessions/${sessionId}/manage`)
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasActiveLoan).toBe(true);
    expect(res.body.nextPayment.amount).toBe(2910);
    expect(res.body.reply).toMatch(/2910|next payment/i);
  });

  test('says plainly when there is no active plan, rather than guessing', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow()], rowCount: 1 },
      { rows: [], rowCount: 0 }
    ]);

    const res = await request(app)
      .get(`/api/care-agent/sessions/${sessionId}/manage`)
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasActiveLoan).toBe(false);
    expect(res.body.nextPayment).toBeNull();
  });
});

// ─────────────────────────────────────────────
// POST /api/care-agent/sessions/:id/manage/payment-date-change
// ─────────────────────────────────────────────
describe('POST /api/care-agent/sessions/:id/manage/payment-date-change', () => {
  test('logs a human-review request rather than changing the date itself', async () => {
    setupAuthMock([
      { rows: [careAgentSessionRow()], rowCount: 1 },
      { rows: [{ request_id: 'review-1' }], rowCount: 1 }, // INSERT care_agent_manage_requests
      { rows: [], rowCount: 0 }                            // INSERT audit log
    ]);

    const res = await request(app)
      .post(`/api/care-agent/sessions/${sessionId}/manage/payment-date-change`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ reason: 'pay day moved to the 27th' });

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('review-1');
    expect(res.body.reply).toMatch(/human|team|review/i);
  });
});
