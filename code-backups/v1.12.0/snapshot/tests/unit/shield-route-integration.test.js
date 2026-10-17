/**
 * Shield underwriting — route integration bugs (test-first reproduction).
 *
 * Reproduces the fail-open behaviours found in the Shield underwriting review
 * before any fix is attempted (CLAUDE.md bug workflow):
 *
 *  M. POST /api/marketplace/applications
 *     - Shield Gate 2 runs only `if (monthlyIncome)` — omit income and the
 *       application goes straight to funding partners.
 *     - Self-declared income is labelled 'manual_verified' and can approve.
 *     - Assessment errors are swallowed and the application proceeds.
 *     - REFER_TO_HUMAN outcomes still go to funding partners.
 *  V. POST /api/v1/decisions/:applicationId
 *     - Context queries read tables/columns that do not exist; failures are
 *       swallowed and COALESCEd to 0, so concentration, provider and
 *       portfolio breakers silently pass and the application is APPROVED.
 *  L1. Legacy patient gate exempts gap financing from the 55% DTI ceiling.
 *  L2. Legacy healthcare risk score uses Math.random(), scheme brand and
 *      chronic-medication status, and penalises time-of-day / device type.
 *  E. POST /api/applications defaults missing income to R15,000 and can
 *     approve and create a payment plan on it.
 *
 * Fix contract: both decision routes run the Shield Underwriting Module
 * (backend/src/shield) — buildUnderwritingInput() then underwrite() — record
 * every decision in shield_decisions, and only APPROVED / APPROVED_COOLING_OFF
 * outcomes may reach funding partners or be marked APPROVED.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const harness = require('./helpers/route-harness');
const { luhnCheckDigit } = require('../../backend/src/utils/sa-id');

const VALID_ID = (() => { const b = '850615500908'; return b + luhnCheckDigit(b); })();
const NOW_ISO = new Date().toISOString();
const MONTHS = JSON.stringify([
  { grossCents: 4_000_000, netCents: 3_000_000 },
  { grossCents: 4_000_000, netCents: 3_000_000 },
  { grossCents: 4_000_000, netCents: 3_000_000 }
]);

const VERIFIED_TABLES = {
  users: [{ user_id: 'pat-1', sa_id_number: VALID_ID, status: 'active', credit_limit: 50000 }],
  patient_income_verification: [{
    method: 'OPEN_BANKING', verified_at: NOW_ISO, months: MONTHS,
    observed_debit_orders_cents: '200000', declared_obligations_cents: '200000', declared_expenses_cents: '0',
    source_name: 'open-banking', is_mock: false
  }],
  providers: [{
    provider_id: 'prov-1', status: 'ACTIVE', tier: 'standard',
    hpcsa_verified: true, practice_number_verified: true, bank_account_verified: true,
    verification_checked_at: NOW_ISO
  }],
  provider_scoring_snapshot: [{
    provider_id: 'prov-1', billing_agreement_signed: true, arrangements_90d: 40, missed_90d_rate: '0.02',
    fpd_sample: 30, fpd_rate: '0', dispute_rate: '0.01', complaints_30d: 0, monthly_volume_count: 5,
    outstanding_cents: '10000000', refreshed_at: NOW_ISO
  }],
  portfolio_metrics: [{
    total_outstanding_cents: '500000000', active_arrangements: 400, arrears_30_rate: '0.01',
    balance_sheet_share: '0.2', reserve_fund_cents: '10000000', monthly_fee_income_cents: '20000000',
    gap_tariff_flagged_rate: '0', procedure_type_outstanding: '{}', snapshot_at: NOW_ISO
  }],
  payments: [{ instalments_due: '0', instalments_on_time: '0', completed_arrangements: '0' }]
};

const MARKETPLACE_BODY = {
  providerId: 'prov-1',
  procedureType: 'dental_implants',
  procedureCode: 'DENT-IMPL-01',
  procedureDescription: 'Single implant',
  loanAmount: 12000,
  requestedTerm: 12,
  urgencyClassification: 'planned'
};

const ENV_KEYS = ['SHIELD_ALLOW_MOCK_SOURCES', 'NODE_ENV'];
let savedEnv;
beforeEach(() => {
  harness.reset();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
});

const reachedFundingPartners = () => harness.sql(/FROM\s+lenders\b/i).length > 0;
const recordedDecision = () => harness.sql(/INSERT\s+INTO\s+shield_decisions/i).length > 0;

// ─────────────────────────────────────────────────────────────────────────
describe('M — marketplace application gate', () => {
  const router = harness.loadRouter('routes/marketplace');
  const apply = (body) => harness.invoke(router, 'post', '/applications', { body });

  test('M1: omitting income never reaches funding partners', async () => {
    harness.db = harness.tables({});
    const res = await apply({ ...MARKETPLACE_BODY });
    assert.equal(reachedFundingPartners(), false, 'application reached the lender pool without Shield');
    assert.ok(res.body && (res.body.shield_declined || res.body.shield_referred), JSON.stringify(res.body));
  });

  test('M2: self-declared income alone never reaches funding partners', async () => {
    harness.db = harness.tables({});
    await apply({ ...MARKETPLACE_BODY, monthlyIncome: 30000, monthlyObligations: 2000 });
    assert.equal(reachedFundingPartners(), false);
  });

  test('M3: every marketplace decision is recorded in shield_decisions', async () => {
    harness.db = harness.tables({});
    await apply({ ...MARKETPLACE_BODY, monthlyIncome: 30000 });
    assert.equal(recordedDecision(), true);
  });

  test('M4: a failing database never lets an application through', async () => {
    harness.db = async () => { throw new Error('db down'); };
    const res = await apply({ ...MARKETPLACE_BODY, monthlyIncome: 30000 });
    assert.equal(reachedFundingPartners(), false);
    assert.notEqual(res.body?.success, true);
  });

  test('M5: a fully verified, approvable application still proceeds to the marketplace', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SHIELD_ALLOW_MOCK_SOURCES = 'true';
    harness.db = harness.tables(VERIFIED_TABLES);
    const res = await apply({ ...MARKETPLACE_BODY });
    assert.equal(reachedFundingPartners(), true, JSON.stringify(res.body));
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('V — v1 decision route', () => {
  const router = harness.loadRouter('routes/v1');
  const decide = () => harness.invoke(router, 'post', '/decisions/:applicationId', { params: { applicationId: 'app-1' } });

  const V1_APP = [{
    application_id: 'app-1', patient_id: 'pat-1', provider_id: 'prov-1', procedure_code: 'DENT-IMPL-01',
    procedure_type: 'dental_implants', procedure_urgency: 'ELECTIVE', segment: 'SEGMENT_2_OOP',
    provider_invoice_amount_cents: '1200000', term_months: 12
  }];

  test('V1: failing portfolio and provider-snapshot queries never produce APPROVED', async () => {
    harness.db = harness.tables({
      v1_applications: V1_APP,
      providers: VERIFIED_TABLES.providers,
      patient_income_verification: [{ verified_monthly_income_cents: '5000000', method: 'STITCH_OPEN_BANKING', verified_at: NOW_ISO, months: MONTHS, source_name: 'x', is_mock: false }],
      provider_scoring_snapshot: new Error('column "book_share_percent" does not exist'),
      portfolio_metrics: new Error('relation "portfolio_metrics" does not exist')
    });
    const res = await decide();
    assert.notEqual(res.body?.decision, 'APPROVED', JSON.stringify(res.body?.reasonCodes || res.body));
    const statusUpdate = harness.sql(/UPDATE\s+v1_applications/i).pop();
    assert.ok(statusUpdate, 'decision not persisted to v1_applications');
    assert.ok(!statusUpdate[1].includes('APPROVED'));
  });

  test('V2: response reports the three outcome sections and the outcome map', async () => {
    harness.db = harness.tables({ v1_applications: V1_APP, ...VERIFIED_TABLES });
    const res = await decide();
    for (const k of ['patientAffordability', 'providerRisk', 'medicalRiskScore', 'outcomeMap', 'policyVersion', 'modelId']) {
      assert.ok(res.body && k in res.body, `missing ${k}: ${JSON.stringify(res.body)}`);
    }
  });

  test('V3: every v1 decision is recorded in shield_decisions', async () => {
    harness.db = harness.tables({ v1_applications: V1_APP, ...VERIFIED_TABLES });
    await decide();
    assert.equal(recordedDecision(), true);
  });

  test('V4: REFER is persisted as MANUAL_REVIEW', async () => {
    // Production mode: mock bureau/identity adapters are refused → REFER.
    process.env.NODE_ENV = 'production';
    harness.db = harness.tables({ v1_applications: V1_APP, ...VERIFIED_TABLES });
    const res = await decide();
    assert.equal(res.body?.decision, 'REFER', JSON.stringify(res.body?.reasonCodes || res.body));
    const statusUpdate = harness.sql(/UPDATE\s+v1_applications/i).pop();
    assert.ok(statusUpdate[1].includes('MANUAL_REVIEW'));
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('L — legacy services', () => {
  test('L1: legacy patient gate applies the 55% DTI ceiling to gap financing', async () => {
    const { patientGateService } = require('../../backend/src/services/patient-gate.service');
    const r = await patientGateService.assessApplication({
      patient_id: 'pat-1', procedure_type: 'specialist_gap', quoted_amount: 15000, medical_aid_covered: 5000,
      loan_amount_requested: 10000, loan_term_months: 12, urgency_classification: 'planned',
      monthly_income_verified: 20000, monthly_obligations: 11500,
      income_verification: 'api_verified', segment: 'gap_financing'
    });
    assert.equal(r.decision, 'DECLINE', JSON.stringify(r.rationale));
  });

  test('L2: legacy health score is deterministic and ignores scheme brand and chronic status', async () => {
    harness.db = harness.tables({ payments: [{ total_payments: '0', paid_on_time: '0', late_payments: '0', avg_days_early_late: '0' }] });
    const { healthcareRiskService } = require('../../backend/src/services/healthcare-risk.service');
    const a = await healthcareRiskService.fetchHealthDataSources('u1', { medicalAidScheme: 'Discovery', hasChronicConditions: true });
    const b = await healthcareRiskService.fetchHealthDataSources('u1', { medicalAidScheme: 'Discovery', hasChronicConditions: true });
    const c = await healthcareRiskService.fetchHealthDataSources('u1', { medicalAidScheme: 'Other', hasChronicConditions: false });
    assert.deepEqual(a, b, 'non-deterministic');
    assert.deepEqual(a, c, 'scheme brand or chronic status changes the score');
  });

  test('L3: legacy behavioural score does not penalise time of day or device type', () => {
    const { healthcareRiskService } = require('../../backend/src/services/healthcare-risk.service');
    const night = healthcareRiskService.analyzeBehavioralSignals({ applicationHour: 3, deviceType: 'desktop' });
    const day = healthcareRiskService.analyzeBehavioralSignals({ applicationHour: 12, deviceType: 'mobile' });
    assert.equal(night, day);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('E — legacy applications route', () => {
  test('E1: missing income is never defaulted — no approval and no payment plan', async () => {
    const router = harness.loadRouter('routes/applications');
    harness.db = harness.tables({
      users: [{ user_id: 'pat-1', status: 'active', credit_limit: 50000 }],
      applications: [{ application_id: 'a-1', status: 'pending' }],
      // Realistic seeded data: a good health-payment history and a low-risk
      // procedure weight. With income absent, the route must still not approve.
      patient_health_scores: [{
        user_id: 'pat-1', health_payment_score: 90, medical_aid_score: 90, medication_adherence_score: 90,
        provider_payment_score: 90
      }],
      procedure_risk_weights: [{ procedure_name: 'dental implants', base_pd_risk: 10, base_lgd_risk: 20, success_rate: 98, status: 'active' }],
      healthcare_risk_assessments: [{ assessment_id: 'r-1' }],
      payment_plans: [{ plan_id: 'plan-1' }],
      payments: [{ total_payments: '0', paid_on_time: '0', late_payments: '0', avg_days_early_late: '0' }]
    });
    for (let i = 0; i < 5; i++) {
      harness.calls = [];
      await harness.invoke(router, 'post', '/', { body: { bill_amount: 4000, treatment_type: 'dental_implants', provider_name: 'Clinic' } });
      const update = harness.sql(/UPDATE\s+applications\s+SET/i).pop();
      if (update) assert.notEqual(update[1][1], 'approved', 'approved on a defaulted income');
      assert.equal(harness.sql(/INSERT\s+INTO\s+payment_plans/i).length, 0, 'payment plan created on a defaulted income');
    }
  });
});
