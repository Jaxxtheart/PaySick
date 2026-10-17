/**
 * Shield Underwriting — context builder.
 *
 * Assembles the engine input from the database and the data-source adapters.
 * Rules under test:
 *   - a failed query or missing row yields null for that block, NEVER zeros
 *   - every external block carries its source provenance (isMock flag)
 *   - gap scheme benefit comes from scheme verification, never from a
 *     scheme-rate multiple treated as a coverage percentage
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { buildUnderwritingInput } = require('../../backend/src/shield/context-builder');
const { underwrite } = require('../../backend/src/shield/engine');
const { NOW } = require('./fixtures/shield-input');

const APPLICATION = {
  applicationId: 'app-1',
  patientId: 'pat-1',
  providerId: 'prov-1',
  segment: 'SEGMENT_2_OOP',
  procedureCode: 'DENT-IMPL-01',
  procedureType: 'dental_implants',
  procedureCategory: 'DENTISTRY',
  urgency: 'ELECTIVE',
  amountCents: 1_200_000,
  termMonths: 12,
  bookingLeadDays: 21
};

const prod = (name) => ({ name, isMock: false, retrievedAt: NOW.toISOString() });

function adapters(overrides = {}) {
  return {
    bureau: { fetchConsumerReport: async () => ({
      score: 690, thinFile: false, underDebtReview: false, sequestrationOrAdministration: false,
      judgmentsCount: 0, adverseListingsCount: 0, worstArrearsCycles12m: 0, enquiries90d: 1,
      revolvingUtilisation: 0.4, monthlyObligationsCents: 500_000, retrievedAt: NOW.toISOString(), source: prod('bureau')
    }) },
    identity: {
      verifyIdentity: async () => ({ saIdValid: true, homeAffairsVerified: true, deceased: false, source: prod('dha') }),
      checkFraudRegister: async () => ({ safpsListed: false, source: prod('safps') }),
      verifyBankAccount: async () => ({ avsVerified: true, holderMatch: true, source: prod('avs') })
    },
    scheme: { verifySchemeBenefit: async () => ({ schemeBenefitCents: 2_000_000, schemeMembershipVerified: true, dspIsOnList: true, source: prod('scheme') }) },
    ...overrides
  };
}

function fakeQuery(tables) {
  return async (sql) => {
    for (const [name, rows] of Object.entries(tables)) {
      if (new RegExp(`FROM\\s+${name}\\b`, 'i').test(sql)) {
        if (rows instanceof Error) throw rows;
        return { rows };
      }
    }
    return { rows: [] };
  };
}

const HAPPY_TABLES = {
  users: [{ user_id: 'pat-1', sa_id_number: '9001015009086' }],
  patient_income_verification: [{
    method: 'OPEN_BANKING', verified_at: NOW.toISOString(),
    months: JSON.stringify([
      { grossCents: 4_000_000, netCents: 3_000_000 },
      { grossCents: 4_000_000, netCents: 3_000_000 },
      { grossCents: 4_000_000, netCents: 3_000_000 }
    ]),
    observed_debit_orders_cents: '300000', source_name: 'open-banking', is_mock: false,
    declared_obligations_cents: '400000', declared_expenses_cents: '0'
  }],
  providers: [{
    provider_id: 'prov-1', status: 'ACTIVE', tier: 'standard',
    hpcsa_verified: true, practice_number_verified: true, bank_account_verified: true,
    verification_checked_at: NOW.toISOString()
  }],
  provider_scoring_snapshot: [{
    provider_id: 'prov-1', billing_agreement_signed: true, arrangements_90d: 40, missed_90d_rate: '0.02',
    fpd_sample: 30, fpd_rate: '0', dispute_rate: '0.01', complaints_30d: 0, cost_variance_vs_benchmark: '0.05',
    monthly_volume_count: 10, outstanding_cents: '20000000', refreshed_at: NOW.toISOString()
  }],
  portfolio_metrics: [{
    total_outstanding_cents: '1000000000', active_arrangements: 900, arrears_30_rate: '0.02',
    balance_sheet_share: '0.2', reserve_fund_cents: '10000000', monthly_fee_income_cents: '20000000',
    gap_tariff_flagged_rate: '0', procedure_type_outstanding: JSON.stringify({ dental_implants: 50_000_000 }),
    snapshot_at: NOW.toISOString()
  }],
  payments: [{ instalments_due: '0', instalments_on_time: '0', completed_arrangements: '0' }],
  procedure_benchmarks: [{ benchmark_cost_100pct: '25000.00' }]
};

describe('context builder', () => {
  test('happy path builds an input the engine approves', async () => {
    const input = await buildUnderwritingInput(APPLICATION, { query: fakeQuery(HAPPY_TABLES), adapters: adapters(), now: NOW });
    assert.equal(input.income.months.length, 3);
    assert.equal(input.income.observedDebitOrdersCents, 300_000);
    assert.equal(input.declared.obligationsCents, 400_000);
    assert.equal(input.provider.metrics.missed90dRate, 0.02);
    assert.equal(input.portfolio.procedureTypeOutstandingCents, 50_000_000);
    assert.equal(input.provider.verification.hpcsaVerified, true);
    const outcome = underwrite(input, { now: NOW });
    assert.equal(outcome.decision, 'APPROVED', JSON.stringify(outcome.reasonCodes));
  });

  test('every query failing yields null blocks and the engine never approves', async () => {
    const boom = new Error('relation does not exist');
    const tables = Object.fromEntries(Object.keys(HAPPY_TABLES).map((k) => [k, boom]));
    const input = await buildUnderwritingInput(APPLICATION, { query: fakeQuery(tables), adapters: adapters(), now: NOW });
    assert.equal(input.income, null);
    assert.equal(input.provider, null);
    assert.equal(input.portfolio, null);
    const outcome = underwrite(input, { now: NOW });
    assert.notEqual(outcome.decision, 'APPROVED');
    assert.notEqual(outcome.decision, 'APPROVED_COOLING_OFF');
  });

  test('missing portfolio row → null, not zeros', async () => {
    const input = await buildUnderwritingInput(APPLICATION, {
      query: fakeQuery({ ...HAPPY_TABLES, portfolio_metrics: [] }), adapters: adapters(), now: NOW
    });
    assert.equal(input.portfolio, null);
  });

  test('missing provider snapshot → provider.metrics null (no zero rates)', async () => {
    const input = await buildUnderwritingInput(APPLICATION, {
      query: fakeQuery({ ...HAPPY_TABLES, provider_scoring_snapshot: [] }), adapters: adapters(), now: NOW
    });
    assert.equal(input.provider.metrics, null);
  });

  test('adapter failure → that block is null', async () => {
    const input = await buildUnderwritingInput(APPLICATION, {
      query: fakeQuery(HAPPY_TABLES),
      adapters: adapters({ bureau: { fetchConsumerReport: async () => { throw new Error('bureau down'); } } }),
      now: NOW
    });
    assert.equal(input.bureau, null);
    assert.equal(underwrite(input, { now: NOW }).decision, 'REFER');
  });

  test('the shipped mock adapters are marked isMock and refused in production mode', async () => {
    const input = await buildUnderwritingInput(APPLICATION, { query: fakeQuery(HAPPY_TABLES), now: NOW });
    assert.equal(input.bureau.source.isMock, true);
    assert.equal(input.identity.source.isMock, true);
    const outcome = underwrite(input, { now: NOW });
    assert.equal(outcome.decision, 'REFER');
    assert.ok(outcome.reasonCodes.some((c) => c.startsWith('DATA_SOURCE_NOT_PRODUCTION')));
  });

  test('gap: scheme benefit comes from scheme verification', async () => {
    const input = await buildUnderwritingInput({ ...APPLICATION, segment: 'SEGMENT_1_GAP', amountCents: 3_000_000, medicalAidScheme: 'S', medicalAidPlan: 'P' },
      { query: fakeQuery(HAPPY_TABLES), adapters: adapters(), now: NOW });
    assert.equal(input.segment1.schemeBenefitCents, 2_000_000);
    assert.equal(input.segment1.benchmarkCents, 2_500_000);
    assert.equal(input.segment1.schemeMembershipVerified, true);
  });

  test('gap: scheme verification failure → null benefit (engine refers)', async () => {
    const input = await buildUnderwritingInput({ ...APPLICATION, segment: 'SEGMENT_1_GAP', amountCents: 3_000_000, medicalAidScheme: 'S', medicalAidPlan: 'P' },
      { query: fakeQuery(HAPPY_TABLES), adapters: adapters({ scheme: { verifySchemeBenefit: async () => { throw new Error('x'); } } }), now: NOW });
    assert.equal(input.segment1.schemeBenefitCents, null);
  });
});
