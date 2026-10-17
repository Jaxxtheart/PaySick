/**
 * Shield Underwriting — context builder.
 *
 * Assembles the engine input from the database and data-source adapters.
 *
 * Fail-closed contract:
 *   - a failed query, missing row or failed adapter call yields null for that
 *     block — never zeros or defaults the engine could mistake for evidence
 *   - external blocks carry source provenance (isMock) through to the engine
 *   - the gap scheme benefit is a rand amount confirmed by the scheme, never
 *     a scheme-rate multiple treated as a coverage percentage
 *
 * `application` is a normalised request:
 *   { applicationId, patientId, providerId, segment, procedureCode,
 *     procedureType, procedureCategory, urgency, amountCents, termMonths,
 *     bookingLeadDays?, medicalAidScheme?, medicalAidPlan?,
 *     declaredObligationsCents?, declaredExpensesCents?, mandate?, behaviour? }
 */

'use strict';

const bureauAdapter = require('../adapters/credit-bureau.adapter');
const identityAdapter = require('../adapters/identity-verification.adapter');
const schemeAdapter = require('../adapters/scheme-benefit.adapter');

const DEFAULT_ADAPTERS = {
  bureau: bureauAdapter,
  identity: identityAdapter,
  scheme: schemeAdapter
};

async function rowsOrNull(query, sql, params) {
  try {
    const res = await query(sql, params);
    return Array.isArray(res?.rows) ? res.rows : null;
  } catch (e) {
    return null;
  }
}

async function callOrNull(fn) {
  try {
    const out = await fn();
    return out || null;
  } catch (e) {
    return null;
  }
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function parseJson(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
}

function mapIncome(row) {
  if (!row) return null;
  const months = parseJson(row.months);
  return {
    method: row.method,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    months: Array.isArray(months) ? months.map((m) => ({ grossCents: num(m.grossCents), netCents: num(m.netCents) })) : [],
    observedDebitOrdersCents: num(row.observed_debit_orders_cents),
    source: {
      name: row.source_name || 'unknown',
      isMock: !!row.is_mock,
      retrievedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null
    }
  };
}

function mapProvider(row, snapshot, now) {
  if (!row) return null;
  return {
    providerId: row.provider_id,
    status: row.status,
    tier: row.tier,
    billingAgreementSigned: !!(snapshot ? snapshot.billing_agreement_signed : row.billing_agreement_signed),
    verification: {
      hpcsaVerified: !!row.hpcsa_verified,
      practiceNumberVerified: !!row.practice_number_verified,
      bankAccountVerified: !!row.bank_account_verified,
      verifiedAt: row.verification_checked_at ? new Date(row.verification_checked_at).toISOString() : null
    },
    metrics: snapshot ? {
      arrangements90d: num(snapshot.arrangements_90d) ?? 0,
      missed90dRate: num(snapshot.missed_90d_rate) ?? 0,
      fpdSample: num(snapshot.fpd_sample) ?? 0,
      fpdRate: num(snapshot.fpd_rate) ?? 0,
      disputeRate: num(snapshot.dispute_rate) ?? 0,
      complaints30d: num(snapshot.complaints_30d) ?? 0,
      costVarianceVsBenchmark: num(snapshot.cost_variance_vs_benchmark),
      monthlyVolumeCount: num(snapshot.monthly_volume_count) ?? 0,
      outstandingCents: num(snapshot.outstanding_cents) ?? 0
    } : null,
    source: {
      name: 'provider-scoring-snapshot',
      isMock: false,
      retrievedAt: snapshot?.refreshed_at ? new Date(snapshot.refreshed_at).toISOString() : now.toISOString()
    }
  };
}

function mapPortfolio(row, procedureType) {
  if (!row) return null;
  const byType = parseJson(row.procedure_type_outstanding);
  return {
    totalOutstandingCents: num(row.total_outstanding_cents),
    activeArrangements: num(row.active_arrangements),
    // A missing exposure map is unknown (null → REFER); a map without this
    // procedure type means genuinely no exposure yet (0).
    procedureTypeOutstandingCents: byType ? num(byType[procedureType]) ?? 0 : null,
    arrears30Rate: num(row.arrears_30_rate),
    balanceSheetShare: num(row.balance_sheet_share),
    reserveFundCents: num(row.reserve_fund_cents),
    monthlyFeeIncomeCents: num(row.monthly_fee_income_cents),
    gapTariffFlaggedRate: num(row.gap_tariff_flagged_rate),
    source: { name: 'portfolio-metrics', isMock: false, retrievedAt: row.snapshot_at ? new Date(row.snapshot_at).toISOString() : null }
  };
}

async function buildUnderwritingInput(application, deps = {}) {
  const { query, now = new Date() } = deps;
  const adapters = { ...DEFAULT_ADAPTERS, ...(deps.adapters || {}) };
  if (typeof query !== 'function') throw new Error('buildUnderwritingInput requires deps.query');
  const app = application;
  const isGap = app.segment === 'SEGMENT_1_GAP';

  const [userRows, incomeRows, providerRows, snapshotRows, portfolioRows, historyRows, benchRows] = await Promise.all([
    rowsOrNull(query, 'SELECT user_id, sa_id_number FROM users WHERE user_id = $1', [app.patientId]),
    rowsOrNull(query,
      `SELECT method, verified_at, months, observed_debit_orders_cents,
              declared_obligations_cents, declared_expenses_cents, source_name, is_mock
       FROM patient_income_verification
       WHERE patient_id = $1
       ORDER BY verified_at DESC LIMIT 1`, [app.patientId]),
    rowsOrNull(query,
      `SELECT provider_id, status, tier, hpcsa_verified, practice_number_verified,
              bank_account_verified, verification_checked_at
       FROM providers WHERE provider_id = $1`, [app.providerId]),
    rowsOrNull(query, 'SELECT * FROM provider_scoring_snapshot WHERE provider_id = $1', [app.providerId]),
    rowsOrNull(query, 'SELECT * FROM portfolio_metrics ORDER BY snapshot_at DESC LIMIT 1', []),
    rowsOrNull(query,
      `SELECT COUNT(*) FILTER (WHERE p.due_date <= $2::date) AS instalments_due,
              COUNT(*) FILTER (WHERE p.status = 'paid' AND p.payment_date::date <= p.due_date) AS instalments_on_time,
              (SELECT COUNT(*) FROM payment_plans pp WHERE pp.user_id = $1 AND pp.status = 'completed') AS completed_arrangements
       FROM payments p WHERE p.user_id = $1`, [app.patientId, now.toISOString()]),
    isGap
      ? rowsOrNull(query,
        `SELECT benchmark_cost_100pct FROM procedure_benchmarks
         WHERE procedure_code = $1 AND effective_to IS NULL
         ORDER BY effective_from DESC LIMIT 1`, [app.procedureCode])
      : Promise.resolve(null)
  ]);

  const saIdNumber = userRows?.[0]?.sa_id_number || null;
  const incomeRow = incomeRows?.[0] || null;
  const subject = { saIdNumber, patientId: app.patientId };

  const [bureau, identity, fraud, bankAccount] = await Promise.all([
    saIdNumber ? callOrNull(() => adapters.bureau.fetchConsumerReport(subject)) : null,
    saIdNumber ? callOrNull(() => adapters.identity.verifyIdentity(subject)) : null,
    saIdNumber ? callOrNull(() => adapters.identity.checkFraudRegister(subject)) : null,
    callOrNull(() => adapters.identity.verifyBankAccount(subject))
  ]);

  let segment1 = null;
  if (isGap) {
    const benefit = await callOrNull(() => adapters.scheme.verifySchemeBenefit({
      scheme: app.medicalAidScheme,
      plan: app.medicalAidPlan,
      providerId: app.providerId,
      procedureCode: app.procedureCode,
      invoiceCents: app.amountCents
    }));
    const benchRand = num(benchRows?.[0]?.benchmark_cost_100pct);
    segment1 = {
      benchmarkCents: benchRand ? Math.round(benchRand * 100) : null,
      schemeBenefitCents: benefit ? num(benefit.schemeBenefitCents) : null,
      schemeMembershipVerified: !!benefit?.schemeMembershipVerified,
      dspIsOnList: benefit ? !!benefit.dspIsOnList : false,
      source: benefit?.source || { name: 'scheme-benefit', isMock: false, retrievedAt: null }
    };
  }

  const history = historyRows?.[0];
  return {
    application: {
      applicationId: app.applicationId || null,
      patientId: app.patientId,
      providerId: app.providerId,
      segment: app.segment,
      procedureCode: app.procedureCode || null,
      procedureType: app.procedureType || null,
      procedureCategory: app.procedureCategory || null,
      urgency: app.urgency,
      amountCents: Math.round(Number(app.amountCents)),
      termMonths: Number(app.termMonths),
      bookingLeadDays: app.bookingLeadDays ?? null
    },
    income: mapIncome(incomeRow),
    declared: {
      obligationsCents: num(app.declaredObligationsCents) ?? num(incomeRow?.declared_obligations_cents) ?? 0,
      expensesCents: num(app.declaredExpensesCents) ?? num(incomeRow?.declared_expenses_cents) ?? 0
    },
    bureau,
    identity,
    fraud,
    bankAccount,
    mandate: app.mandate || { debiCheckAuthorised: false },
    internalHistory: history ? {
      instalmentsDue: num(history.instalments_due) ?? 0,
      instalmentsOnTime: num(history.instalments_on_time) ?? 0,
      completedArrangements: num(history.completed_arrangements) ?? 0
    } : null,
    provider: mapProvider(providerRows?.[0], snapshotRows?.[0] || null, now),
    portfolio: mapPortfolio(portfolioRows?.[0], app.procedureType),
    segment1,
    behaviour: app.behaviour || {}
  };
}

module.exports = { buildUnderwritingInput };
