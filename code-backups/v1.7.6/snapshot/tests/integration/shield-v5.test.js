/**
 * Integration Tests — Shield Framework v5.0 Controls
 *
 * Tests for five Segment 1 tariff billing risk controls:
 *   Control 1 — DSP Status Check
 *   Control 2 — Tariff-Anchored Facilitation Ceiling
 *   Control 3 — Provider Billing Agreement Gate
 *   Control 4 — Tariff Disclosure Screen
 *   Control 5 — Post-Procedure EOB/Payout Reconciliation
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

const mockToken = crypto.randomBytes(32).toString('hex');
const mockUserId = 'user-uuid-1111-2222-3333-444444444444';
const mockAdminId = 'admin-uuid-1111-2222-3333-444444444444';
const mockApplicationId = 'app-uuid-1111-2222-3333-444444444444';
const mockProviderId = 'prov-uuid-1111-2222-3333-444444444444';

const userSessionRow = {
  user_id: mockUserId,
  role: 'user',
  email: 'patient@test.com',
  revoked: false,
  access_expires_at: new Date(Date.now() + 3600000).toISOString()
};

const adminSessionRow = {
  user_id: mockAdminId,
  role: 'admin',
  email: 'admin@paysick.com',
  revoked: false,
  access_expires_at: new Date(Date.now() + 3600000).toISOString()
};

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

function userAuthMock(...extras) {
  mockQuery
    .mockResolvedValueOnce({ rows: [userSessionRow], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });
  extras.forEach(e => mockQuery.mockResolvedValueOnce(e));
}

function adminAuthMock(...extras) {
  mockQuery
    .mockResolvedValueOnce({ rows: [adminSessionRow], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });
  extras.forEach(e => mockQuery.mockResolvedValueOnce(e));
}

// ─────────────────────────────────────────────
// CONTROL 1 — DSP STATUS CHECK
// ─────────────────────────────────────────────
describe('Control 1 — DSP Status Check', () => {

  // TC-DSP-01: DSP status → standard gap, no upfront increase
  test('TC-DSP-01: DSP provider → standard gap, no upfront increase', async () => {
    userAuthMock(
      // DSP registry lookup → found
      { rows: [{ provider_hpcsa_number: 'MP123456', scheme_code: 'DIS', dsp_effective_from: '2024-01-01', dsp_effective_to: null }], rowCount: 1 },
      // Update application
      { rows: [{ application_id: mockApplicationId, dsp_status: 'DSP' }], rowCount: 1 },
      // Audit log insert
      { rows: [{ id: 1 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/underwriting/dsp-check')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        provider_hpcsa_number: 'MP123456',
        patient_scheme_code: 'DIS',
        patient_plan_code: 'CLASSIC'
      });

    expect(res.status).toBe(200);
    expect(res.body.dsp_status).toBe('DSP');
    expect(res.body.conservative_gap_applied).toBe(false);
    expect(res.body.upfront_percent_increase).toBe(0);
    expect(res.body.disclosure_required).toBe(false);
  });

  // TC-DSP-02: NON_DSP status → conservative gap, 10% increase, disclosure required
  test('TC-DSP-02: NON_DSP provider → conservative gap, 10% upfront increase, disclosure required', async () => {
    userAuthMock(
      // DSP registry lookup → not found (NON_DSP)
      { rows: [], rowCount: 0 },
      // Update application
      { rows: [{ application_id: mockApplicationId, dsp_status: 'NON_DSP' }], rowCount: 1 },
      // Audit log insert
      { rows: [{ id: 2 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/underwriting/dsp-check')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        provider_hpcsa_number: 'MP999999',
        patient_scheme_code: 'DIS',
        patient_plan_code: 'CLASSIC'
      });

    expect(res.status).toBe(200);
    expect(res.body.dsp_status).toBe('NON_DSP');
    expect(res.body.conservative_gap_applied).toBe(true);
    expect(res.body.upfront_percent_increase).toBe(10);
    expect(res.body.disclosure_required).toBe(true);
  });

  // TC-DSP-03: UNKNOWN status → 5% increase, routes to manual review
  test('TC-DSP-03: UNKNOWN DSP status → 5% increase, routed to manual review', async () => {
    userAuthMock(
      // DSP registry lookup → error/unknown
      { rows: [], rowCount: 0 },
      // Update application (UNKNOWN)
      { rows: [{ application_id: mockApplicationId, dsp_status: 'UNKNOWN' }], rowCount: 1 },
      // Manual review queue insert
      { rows: [{ id: 10 }], rowCount: 1 },
      // Audit log insert
      { rows: [{ id: 3 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/underwriting/dsp-check')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        provider_hpcsa_number: 'MP000000',
        patient_scheme_code: 'UNKNOWN_SCHEME',
        patient_plan_code: 'UNKNOWN_PLAN'
      });

    expect(res.status).toBe(200);
    expect(res.body.dsp_status).toBe('UNKNOWN');
    expect(res.body.upfront_percent_increase).toBe(5);
    expect(res.body.manual_review_required).toBe(true);
  });

  // TC-DSP-04: Missing required fields → 400
  test('TC-DSP-04: Missing required fields → 400', async () => {
    userAuthMock();

    const res = await request(app)
      .post('/api/v1/underwriting/dsp-check')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId
        // missing provider_hpcsa_number, patient_scheme_code, patient_plan_code
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // TC-DSP-05: Unauthenticated → 401
  test('TC-DSP-05: Unauthenticated request → 401', async () => {
    const res = await request(app)
      .post('/api/v1/underwriting/dsp-check')
      .send({
        application_id: mockApplicationId,
        provider_hpcsa_number: 'MP123456',
        patient_scheme_code: 'DIS',
        patient_plan_code: 'CLASSIC'
      });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// CONTROL 2 — FACILITATION CEILING CALCULATION
// ─────────────────────────────────────────────
describe('Control 2 — Tariff-Anchored Facilitation Ceiling', () => {

  // TC-CEIL-01: Invoice within 30% of benchmark → approved, ceiling applied
  test('TC-CEIL-01: Invoice within 30% of benchmark → approved, ceiling applied', async () => {
    userAuthMock(
      // procedure benchmark lookup
      { rows: [{ benchmark_cost_100pct: '10000.00', procedure_name: 'Appendectomy' }], rowCount: 1 },
      // insert facilitation_ceiling_calculations
      { rows: [{ id: 5, calculated_ceiling: 7000.00 }], rowCount: 1 },
      // update application
      { rows: [{ application_id: mockApplicationId }], rowCount: 1 },
      // audit log
      { rows: [{ id: 4 }], rowCount: 1 }
    );

    // benchmark=10000, coverage_multiplier=0.7 → ceiling=7000
    // submitted=10500 → variance=(10500-10000)/10000=5% → within 30%
    const res = await request(app)
      .post('/api/v1/underwriting/calculate-ceiling')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        procedure_code: 'APP001',
        metro_region: 'GAUTENG',
        coverage_multiplier: 0.7,
        provider_submitted_amount: 10500
      });

    expect(res.status).toBe(200);
    expect(res.body.calculated_ceiling).toBeDefined();
    expect(res.body.above_30pct_threshold).toBe(false);
    expect(res.body.manual_hold_triggered).toBe(false);
    expect(res.body.decision).toBe('APPROVED');
  });

  // TC-CEIL-02: Invoice 31%+ above benchmark → manual hold triggered
  test('TC-CEIL-02: Invoice 31%+ above benchmark → manual hold triggered', async () => {
    userAuthMock(
      // procedure benchmark lookup
      { rows: [{ benchmark_cost_100pct: '10000.00', procedure_name: 'Appendectomy' }], rowCount: 1 },
      // insert facilitation_ceiling_calculations
      { rows: [{ id: 6, calculated_ceiling: 7000.00 }], rowCount: 1 },
      // update application — on_manual_hold
      { rows: [{ application_id: mockApplicationId }], rowCount: 1 },
      // manual review queue insert
      { rows: [{ id: 11 }], rowCount: 1 },
      // audit log
      { rows: [{ id: 5 }], rowCount: 1 }
    );

    // submitted=13500, benchmark=10000 → variance=35% → triggers hold
    const res = await request(app)
      .post('/api/v1/underwriting/calculate-ceiling')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        procedure_code: 'APP001',
        metro_region: 'GAUTENG',
        coverage_multiplier: 0.7,
        provider_submitted_amount: 13500
      });

    expect(res.status).toBe(200);
    expect(res.body.above_30pct_threshold).toBe(true);
    expect(res.body.manual_hold_triggered).toBe(true);
    expect(res.body.decision).toBe('MANUAL_HOLD');
  });

  // TC-CEIL-03: coverage_multiplier = 1.0 → ceiling = 0, application rejected
  test('TC-CEIL-03: coverage_multiplier=1.0 → ceiling=0, application rejected', async () => {
    userAuthMock(
      // procedure benchmark lookup
      { rows: [{ benchmark_cost_100pct: '10000.00', procedure_name: 'Appendectomy' }], rowCount: 1 },
      // insert facilitation_ceiling_calculations
      { rows: [{ id: 7, calculated_ceiling: 0 }], rowCount: 1 },
      // update application
      { rows: [{ application_id: mockApplicationId }], rowCount: 1 },
      // audit log
      { rows: [{ id: 6 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/underwriting/calculate-ceiling')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        procedure_code: 'APP001',
        metro_region: 'GAUTENG',
        coverage_multiplier: 1.0,
        provider_submitted_amount: 5000
      });

    expect(res.status).toBe(200);
    expect(res.body.calculated_ceiling).toBe(0);
    expect(res.body.decision).toBe('REJECTED');
    expect(res.body.rejection_reason).toBeDefined();
  });

  // TC-CEIL-04: No benchmark for procedure → manual review with NO_BENCHMARK
  test('TC-CEIL-04: No benchmark for procedure → manual review with NO_BENCHMARK', async () => {
    userAuthMock(
      // procedure benchmark lookup → not found
      { rows: [], rowCount: 0 },
      // manual review queue insert
      { rows: [{ id: 12 }], rowCount: 1 },
      // audit log
      { rows: [{ id: 7 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/underwriting/calculate-ceiling')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        procedure_code: 'UNKNOWN_PROC',
        metro_region: 'GAUTENG',
        coverage_multiplier: 0.7,
        provider_submitted_amount: 5000
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('MANUAL_REVIEW');
    expect(res.body.reason).toBe('NO_BENCHMARK');
  });

  // TC-CEIL-05: Unauthenticated → 401
  test('TC-CEIL-05: Unauthenticated → 401', async () => {
    const res = await request(app)
      .post('/api/v1/underwriting/calculate-ceiling')
      .send({
        application_id: mockApplicationId,
        procedure_code: 'APP001',
        metro_region: 'GAUTENG',
        coverage_multiplier: 0.7,
        provider_submitted_amount: 5000
      });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// CONTROL 3 — BILLING AGREEMENT GATE
// ─────────────────────────────────────────────
describe('Control 3 — Provider Billing Agreement Gate', () => {

  // TC-BILL-01: Provider with ACTIVE agreement → gap financing allowed
  test('TC-BILL-01: Provider with ACTIVE agreement → gap financing allowed', async () => {
    userAuthMock(
      // billing agreement lookup → ACTIVE
      { rows: [{ id: 1, status: 'ACTIVE', agreement_version: 'v2.0', signed_at: '2024-01-01' }], rowCount: 1 },
      // audit log
      { rows: [{ id: 8 }], rowCount: 1 }
    );

    const res = await request(app)
      .get(`/api/v1/providers/${mockProviderId}/billing-agreement-status`)
      .set('Authorization', `Bearer ${mockToken}`)
      .query({ segment: 'SEGMENT_1' });

    expect(res.status).toBe(200);
    expect(res.body.gap_financing_eligible).toBe(true);
    expect(res.body.agreement_status).toBe('ACTIVE');
  });

  // TC-BILL-02: Provider without agreement → blocked, correct message
  test('TC-BILL-02: Provider without agreement → blocked with correct message', async () => {
    userAuthMock(
      // billing agreement lookup → not found
      { rows: [], rowCount: 0 },
      // audit log
      { rows: [{ id: 9 }], rowCount: 1 }
    );

    const res = await request(app)
      .get(`/api/v1/providers/${mockProviderId}/billing-agreement-status`)
      .set('Authorization', `Bearer ${mockToken}`)
      .query({ segment: 'SEGMENT_1' });

    expect(res.status).toBe(200);
    expect(res.body.gap_financing_eligible).toBe(false);
    expect(res.body.block_reason).toBeDefined();
  });

  // TC-BILL-03: Provider with SUSPENDED agreement → blocked, suspension logged
  test('TC-BILL-03: Provider with SUSPENDED agreement → blocked, suspension logged', async () => {
    userAuthMock(
      // billing agreement lookup → SUSPENDED
      { rows: [{ id: 2, status: 'SUSPENDED', suspension_reason: 'Billing irregularities', suspended_at: '2024-06-01' }], rowCount: 1 },
      // audit log
      { rows: [{ id: 10 }], rowCount: 1 }
    );

    const res = await request(app)
      .get(`/api/v1/providers/${mockProviderId}/billing-agreement-status`)
      .set('Authorization', `Bearer ${mockToken}`)
      .query({ segment: 'SEGMENT_1' });

    expect(res.status).toBe(200);
    expect(res.body.gap_financing_eligible).toBe(false);
    expect(res.body.agreement_status).toBe('SUSPENDED');
    expect(res.body.suspension_reason).toBeDefined();
  });

  // TC-BILL-04: Segment 2 provider without agreement → proceeds (not blocked)
  test('TC-BILL-04: Segment 2 provider without agreement → proceeds (not blocked)', async () => {
    userAuthMock(
      // billing agreement lookup → not found (but segment 2 bypasses)
      { rows: [], rowCount: 0 },
      // audit log
      { rows: [{ id: 11 }], rowCount: 1 }
    );

    const res = await request(app)
      .get(`/api/v1/providers/${mockProviderId}/billing-agreement-status`)
      .set('Authorization', `Bearer ${mockToken}`)
      .query({ segment: 'SEGMENT_2' });

    expect(res.status).toBe(200);
    expect(res.body.gap_financing_eligible).toBe(true);
    expect(res.body.segment_bypass).toBe(true);
  });

  // TC-BILL-05: Unauthenticated → 401
  test('TC-BILL-05: Unauthenticated → 401', async () => {
    const res = await request(app)
      .get(`/api/v1/providers/${mockProviderId}/billing-agreement-status`);

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// CONTROL 4 — TARIFF DISCLOSURE
// ─────────────────────────────────────────────
describe('Control 4 — Tariff Disclosure Screen', () => {

  // TC-DISC-01: Create disclosure record → success with disclosure_id
  test('TC-DISC-01: Create disclosure record → success with disclosure_id', async () => {
    userAuthMock(
      // insert tariff_disclosures
      { rows: [{ id: 100, application_id: mockApplicationId, acknowledged: false }], rowCount: 1 },
      // audit log
      { rows: [{ id: 12 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/underwriting/disclosure/create')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        patient_id: mockUserId,
        dsp_status: 'NON_DSP',
        estimated_gap: 3000,
        provider_amount: 13000,
        benchmark: 10000
      });

    expect(res.status).toBe(201);
    expect(res.body.disclosure_id).toBeDefined();
    expect(res.body.acknowledged).toBe(false);
  });

  // TC-DISC-02: Acknowledge disclosure → success, application can proceed
  test('TC-DISC-02: Acknowledge disclosure → success, application can proceed', async () => {
    const disclosureId = 100;
    userAuthMock(
      // update tariff_disclosures → acknowledged
      { rows: [{ id: disclosureId, application_id: mockApplicationId, acknowledged: true, acknowledged_at: new Date().toISOString() }], rowCount: 1 },
      // update application disclosure_acknowledged flag
      { rows: [{ application_id: mockApplicationId, disclosure_acknowledged: true }], rowCount: 1 },
      // audit log
      { rows: [{ id: 13 }], rowCount: 1 }
    );

    const res = await request(app)
      .post(`/api/v1/underwriting/disclosure/${disclosureId}/acknowledge`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId,
        patient_id: mockUserId,
        method: 'CHECKBOX',
        ip_address: '127.0.0.1',
        user_agent: 'Mozilla/5.0',
        session_id: 'sess-abc-123'
      });

    expect(res.status).toBe(200);
    expect(res.body.acknowledged).toBe(true);
    expect(res.body.application_can_proceed).toBe(true);
  });

  // TC-DISC-03: Acknowledge with missing fields → 400
  test('TC-DISC-03: Acknowledge with missing fields → 400', async () => {
    userAuthMock();

    const disclosureId = 100;
    const res = await request(app)
      .post(`/api/v1/underwriting/disclosure/${disclosureId}/acknowledge`)
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        // missing application_id, patient_id, method
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // TC-DISC-04: Application without disclosure cannot transition to APPROVED
  test('TC-DISC-04: Application without disclosure cannot transition to APPROVED', async () => {
    adminAuthMock(
      // check disclosure gate → no acknowledged disclosure
      { rows: [{ disclosure_acknowledged: false, tariff_disclosure_id: null }], rowCount: 1 }
    );

    const res = await request(app)
      .get(`/api/v1/underwriting/disclosure/gate-check/${mockApplicationId}`)
      .set('Authorization', `Bearer ${mockToken}`);

    expect(res.status).toBe(200);
    expect(res.body.can_proceed_to_approval).toBe(false);
    expect(res.body.reason).toBeDefined();
  });

  // TC-DISC-05: Unauthenticated → 401
  test('TC-DISC-05: Unauthenticated → 401', async () => {
    const res = await request(app)
      .post('/api/v1/underwriting/disclosure/create')
      .send({
        application_id: mockApplicationId,
        patient_id: mockUserId,
        dsp_status: 'NON_DSP',
        estimated_gap: 3000,
        provider_amount: 13000,
        benchmark: 10000
      });

    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────
// CONTROL 5 — EOB / PAYOUT RECONCILIATION
// ─────────────────────────────────────────────
describe('Control 5 — EOB Submission & Payout Reconciliation', () => {

  // TC-EOB-01: Trigger provisional payout → 80% of ceiling created
  test('TC-EOB-01: Trigger provisional payout → 80% of facilitation ceiling', async () => {
    userAuthMock(
      // fetch application (ceiling set)
      { rows: [{ application_id: mockApplicationId, facilitation_ceiling: '10000.00', provider_id: mockProviderId, disclosure_acknowledged: true }], rowCount: 1 },
      // insert payout_stages
      { rows: [{ id: 50, stage: 'PROVISIONAL', scheduled_amount: '8000.00', status: 'PENDING' }], rowCount: 1 },
      // update application provisional_payout_id
      { rows: [{ application_id: mockApplicationId }], rowCount: 1 },
      // audit log
      { rows: [{ id: 14 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/payouts/trigger-provisional')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ application_id: mockApplicationId });

    expect(res.status).toBe(201);
    expect(res.body.payout_stage).toBe('PROVISIONAL');
    expect(res.body.scheduled_amount).toBe(8000);
    expect(res.body.percent_of_ceiling).toBe(80);
  });

  // TC-EOB-02: Final payout = MIN(remaining_approved, scheme_residual)
  test('TC-EOB-02: Final payout = MIN(remaining facilitation amount, scheme residual)', async () => {
    adminAuthMock(
      // fetch application
      { rows: [{ application_id: mockApplicationId, facilitation_ceiling: '10000.00', provider_id: mockProviderId }], rowCount: 1 },
      // fetch eob submission
      { rows: [{ id: 1, scheme_residual_amount: '1500.00', provider_invoice_amount: '10500.00', reconciliation_status: 'PENDING' }], rowCount: 1 },
      // fetch provisional payout
      { rows: [{ id: 50, actual_amount_paid: '8000.00', scheduled_amount: '8000.00' }], rowCount: 1 },
      // insert final payout_stage
      { rows: [{ id: 51, stage: 'FINAL', scheduled_amount: '1500.00' }], rowCount: 1 },
      // update eob reconciliation status
      { rows: [{ id: 1, reconciliation_status: 'RECONCILED' }], rowCount: 1 },
      // update application final_payout_id
      { rows: [{ application_id: mockApplicationId }], rowCount: 1 },
      // notification log insert
      { rows: [{ id: 1 }], rowCount: 1 },
      // audit log
      { rows: [{ id: 15 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/payouts/reconcile')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ application_id: mockApplicationId });

    expect(res.status).toBe(200);
    expect(res.body.final_payout_amount).toBeDefined();
    // remaining_approved = 10000 - 8000 = 2000; scheme_residual = 1500 → MIN = 1500
    expect(res.body.final_payout_amount).toBe(1500);
    expect(res.body.reconciliation_status).toBe('RECONCILED');
  });

  // TC-EOB-03: Provider invoice > ceiling → excess withheld, notification created
  test('TC-EOB-03: Provider invoice > ceiling → excess withheld, notification sent', async () => {
    adminAuthMock(
      // fetch application
      { rows: [{ application_id: mockApplicationId, facilitation_ceiling: '10000.00', provider_id: mockProviderId }], rowCount: 1 },
      // fetch eob submission (invoice > ceiling)
      { rows: [{ id: 2, scheme_residual_amount: '2500.00', provider_invoice_amount: '13000.00', reconciliation_status: 'PENDING' }], rowCount: 1 },
      // fetch provisional payout
      { rows: [{ id: 50, actual_amount_paid: '8000.00', scheduled_amount: '8000.00' }], rowCount: 1 },
      // insert final payout_stage
      { rows: [{ id: 52, stage: 'FINAL', scheduled_amount: '2000.00' }], rowCount: 1 },
      // update eob reconciliation status
      { rows: [{ id: 2, reconciliation_status: 'RECONCILED' }], rowCount: 1 },
      // update application
      { rows: [{ application_id: mockApplicationId }], rowCount: 1 },
      // notification log insert (excess withheld notification)
      { rows: [{ id: 2 }], rowCount: 1 },
      // audit log
      { rows: [{ id: 16 }], rowCount: 1 }
    );

    const res = await request(app)
      .post('/api/v1/payouts/reconcile')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({ application_id: mockApplicationId });

    expect(res.status).toBe(200);
    expect(res.body.excess_withheld).toBeDefined();
    expect(res.body.excess_withheld).toBeGreaterThan(0);
    expect(res.body.notification_sent).toBe(true);
  });

  // TC-EOB-04: EOB submit missing files → 400
  test('TC-EOB-04: EOB submission missing required files → 400', async () => {
    userAuthMock();

    const res = await request(app)
      .post('/api/v1/payouts/submit-eob')
      .set('Authorization', `Bearer ${mockToken}`)
      .send({
        application_id: mockApplicationId
        // missing provider_id, invoice_amount, eob_amount
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // TC-EOB-05: Unauthenticated → 401
  test('TC-EOB-05: Unauthenticated → 401', async () => {
    const res = await request(app)
      .post('/api/v1/payouts/submit-eob')
      .send({
        application_id: mockApplicationId,
        provider_id: mockProviderId,
        invoice_amount: 10500,
        eob_amount: 8000
      });

    expect(res.status).toBe(401);
  });
});
