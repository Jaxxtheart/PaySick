/**
 * Kehr repository: the SQL behind kehr-preapproval-flow.service.js.
 *
 * Tables from migration 014 plus the shared Shield tables:
 * underwriting_audit_log, manual_review_queue, portfolio_metrics,
 * procedure_risk_weights, procedure_benchmarks, provider_scoring_snapshot.
 * Lookups that read optional tables fall back to defaults, as /api/v1 does.
 */

'use strict';

const iso = (v) => (v ? new Date(v).toISOString() : null);

function consentFromRow(r) {
  return {
    consentId: r.consent_id,
    source: r.source,
    purposeAgreed: r.purpose_agreed,
    grantedAt: iso(r.granted_at),
    expiresAt: iso(r.expires_at),
    withdrawnAt: iso(r.withdrawn_at),
  };
}

function passFromRow(r) {
  return {
    passId: r.pass_id,
    preapprovalId: r.preapproval_id,
    patientId: r.user_id,
    code: r.code,
    status: r.status,
    ceilingCents: Number(r.ceiling_cents),
    maxTermMonths: r.max_term_months,
    indicativeMonthlyCents: Number(r.indicative_monthly_cents),
    shortfallCents: Number(r.shortfall_cents),
    coversShortfall: r.covers_shortfall,
    modelVersion: r.model_version,
    gatesPending: r.gates_pending,
    issuedAt: iso(r.issued_at),
    expiresAt: iso(r.expires_at),
    coolingOffEndsAt: iso(r.cooling_off_ends_at),
  };
}

function createKehrRepository({ query }) {
  const optional = (promise) => promise.catch(() => ({ rows: [] }));

  return {
    async getUser(userId) {
      const r = await query('SELECT user_id, full_name, sa_id_number, cell_number FROM users WHERE user_id = $1', [userId]);
      const u = r.rows[0];
      return u ? { userId: u.user_id, fullName: u.full_name, idNumber: u.sa_id_number, cellNumber: u.cell_number } : null;
    },

    async listConsents(userId) {
      const r = await query(
        `SELECT consent_id, source, purpose_agreed, granted_at, expires_at, withdrawn_at
         FROM kehr_consents WHERE user_id = $1 ORDER BY granted_at`,
        [userId]
      );
      return r.rows.map(consentFromRow);
    },

    async insertConsent(userId, record) {
      const r = await query(
        `INSERT INTO kehr_consents (user_id, source, purpose_agreed, granted_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING consent_id, source, purpose_agreed, granted_at, expires_at, withdrawn_at`,
        [userId, record.source, record.purposeAgreed, record.grantedAt, record.expiresAt]
      );
      return consentFromRow(r.rows[0]);
    },

    async withdrawConsent(userId, source, at) {
      await query(
        `UPDATE kehr_consents SET withdrawn_at = $3
         WHERE user_id = $1 AND source = $2 AND withdrawn_at IS NULL`,
        [userId, source, at]
      );
    },

    async insertPreapproval(userId, input) {
      const r = await query(
        `INSERT INTO kehr_preapprovals (user_id, procedure_code, estimate_cents, urgency, scheme)
         VALUES ($1, $2, $3, $4, $5) RETURNING preapproval_id`,
        [userId, input.procedureCode, input.estimateCents, input.urgency, input.scheme ? JSON.stringify(input.scheme) : null]
      );
      return { preapprovalId: r.rows[0].preapproval_id, userId, input, documents: {}, assessment: null, status: 'collecting' };
    },

    async getPreapproval(userId, preapprovalId) {
      const r = await query(
        `SELECT preapproval_id, user_id, procedure_code, estimate_cents, urgency, scheme, documents, facts, assessment, status
         FROM kehr_preapprovals
         WHERE preapproval_id = $1 AND user_id = $2`,
        [preapprovalId, userId]
      );
      const p = r.rows[0];
      if (!p) return null;
      return {
        preapprovalId: p.preapproval_id,
        userId: p.user_id,
        input: { procedureCode: p.procedure_code, estimateCents: Number(p.estimate_cents), urgency: p.urgency, scheme: p.scheme },
        documents: p.documents || {},
        facts: p.facts,
        assessment: p.assessment,
        status: p.status,
      };
    },

    async saveDocuments(preapprovalId, documents) {
      await query(
        'UPDATE kehr_preapprovals SET documents = $2, updated_at = NOW() WHERE preapproval_id = $1',
        [preapprovalId, JSON.stringify(documents)]
      );
    },

    async saveAssessment(preapprovalId, assessment, facts) {
      await query(
        `UPDATE kehr_preapprovals
         SET assessment = $2, facts = $3, status = $4, assessed_at = NOW(), updated_at = NOW()
         WHERE preapproval_id = $1`,
        [preapprovalId, JSON.stringify(assessment), JSON.stringify(facts), assessment.status]
      );
    },

    async insertPass(preapprovalId, pass) {
      const r = await query(
        `INSERT INTO kehr_passes (preapproval_id, user_id, code, status, ceiling_cents, max_term_months,
           indicative_monthly_cents, shortfall_cents, covers_shortfall, model_version, gates_pending,
           issued_at, expires_at, cooling_off_ends_at)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (code) DO NOTHING
         RETURNING *`,
        [preapprovalId, pass.patientId, pass.code, pass.ceilingCents, pass.maxTermMonths,
          pass.indicativeMonthlyCents, pass.shortfallCents, pass.coversShortfall, pass.modelVersion,
          JSON.stringify(pass.gatesPending || []), pass.issuedAt, pass.expiresAt, pass.coolingOffEndsAt]
      );
      return r.rows[0] ? passFromRow(r.rows[0]) : null;
    },

    async getActivePass(userId) {
      const r = await query(
        `SELECT * FROM kehr_passes WHERE user_id = $1 AND status = 'active'
         ORDER BY issued_at DESC LIMIT 1`,
        [userId]
      );
      return r.rows[0] ? passFromRow(r.rows[0]) : null;
    },

    async getPassByCode(code) {
      const r = await query('SELECT * FROM kehr_passes WHERE code = $1', [code]);
      return r.rows[0] ? passFromRow(r.rows[0]) : null;
    },

    async markPassConverted(passId) {
      await query(
        "UPDATE kehr_passes SET status = 'converted', converted_at = NOW() WHERE pass_id = $1 AND status = 'active'",
        [passId]
      );
    },

    async getPortfolio() {
      const r = await optional(query(
        `SELECT COALESCE(arrears_rate, 0)::float          AS arrears_rate,
                COALESCE(balance_sheet_percent, 0)::float AS balance_sheet_percent,
                COALESCE(reserve_fund_balance_cents, 0)::bigint AS reserve_fund_balance_cents,
                COALESCE(monthly_fee_income_cents, 0)::bigint   AS monthly_fee_income_cents
         FROM portfolio_metrics ORDER BY snapshot_at DESC LIMIT 1`
      ));
      const pf = r.rows[0] || {};
      return {
        arrearsRate: pf.arrears_rate || 0,
        balanceSheetPercent: pf.balance_sheet_percent || 0,
        reserveFundBalance: Number(pf.reserve_fund_balance_cents || 0),
        monthlyFeeIncome: Number(pf.monthly_fee_income_cents || 0),
      };
    },

    async getProcedureRisk(procedureCode) {
      if (!procedureCode) return null;
      const r = await optional(query(
        `SELECT base_pd_risk, base_lgd_risk FROM procedure_risk_weights
         WHERE icd10_code = $1 OR procedure_name = $1 LIMIT 1`,
        [procedureCode]
      ));
      const p = r.rows[0];
      return p ? { base_pd_risk: Number(p.base_pd_risk), base_lgd_risk: Number(p.base_lgd_risk), necessity_score: 0.6 } : null;
    },

    async getBenchmarkCents(procedureCode) {
      if (!procedureCode) return 0;
      const r = await optional(query(
        `SELECT benchmark_cost_100pct FROM procedure_benchmarks
         WHERE procedure_code = $1 AND effective_to IS NULL
         ORDER BY effective_from DESC LIMIT 1`,
        [procedureCode]
      ));
      return Math.round(parseFloat(r.rows[0]?.benchmark_cost_100pct || 0) * 100);
    },

    async getProviderForShield(providerId) {
      const p = await optional(query('SELECT status FROM providers WHERE provider_id = $1', [providerId]));
      const c = await optional(query(
        `SELECT COALESCE(book_share_percent, 0)::float           AS book_share_percent,
                COALESCE(procedure_type_share_percent, 0)::float AS procedure_type_share_percent,
                COALESCE(patient_pd_rate, 0)::float             AS patient_pd_rate,
                COALESCE(billing_agreement_signed, false)       AS billing_agreement_signed
         FROM provider_scoring_snapshot WHERE provider_id = $1`,
        [providerId]
      ));
      const conc = c.rows[0] || {};
      const status = p.rows[0] ? String(p.rows[0].status || '').toUpperCase() : null;
      return {
        status,
        billingAgreementSigned: !!conc.billing_agreement_signed,
        bookSharePercent: conc.book_share_percent,
        procedureTypeSharePercent: conc.procedure_type_share_percent,
        patientPdRate: conc.patient_pd_rate,
      };
    },

    async insertPlanLink(row) {
      await query(
        `INSERT INTO kehr_plan_links (link_id, provider_id, amount_cents, bill_total_cents, procedure_code, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.linkId, row.providerId, row.amountCents, row.billTotalCents, row.procedureCode, row.expiresAt]
      );
      return row;
    },

    async getPlanLink(linkId) {
      const r = await query('SELECT * FROM kehr_plan_links WHERE link_id = $1', [linkId]);
      const l = r.rows[0];
      if (!l) return null;
      return {
        linkId: l.link_id,
        providerId: l.provider_id,
        amountCents: Number(l.amount_cents),
        billTotalCents: l.bill_total_cents === null ? null : Number(l.bill_total_cents),
        procedureCode: l.procedure_code,
        status: l.status,
        expiresAt: iso(l.expires_at),
      };
    },

    async markPlanLinkRedeemed(linkId, userId, outcome) {
      await query(
        `UPDATE kehr_plan_links SET status = 'redeemed', redeemed_by = $2, outcome = $3, redeemed_at = NOW()
         WHERE link_id = $1 AND status = 'sent'`,
        [linkId, userId, outcome]
      );
    },

    async audit(event) {
      await query(
        `INSERT INTO underwriting_audit_log (application_id, provider_id, event_type, actor, input_data, output_decision, output_data, rule_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [event.applicationId || null, event.providerId || null, event.eventType, event.actor,
          JSON.stringify(event.inputData || {}), event.outputDecision, JSON.stringify(event.outputData || {}), event.ruleVersion]
      );
    },

    async queueReview({ preapprovalId, reason, slaHours }) {
      const r = await query(
        `INSERT INTO manual_review_queue (application_id, review_type, priority, sla_hours, sla_deadline)
         VALUES ($1, $2, 'STANDARD', $3, NOW() + make_interval(hours => $3))
         RETURNING id`,
        [preapprovalId, `KEHR_${reason}`.slice(0, 50), slaHours]
      );
      return r.rows[0].id;
    },
  };
}

module.exports = { createKehrRepository };
