/**
 * /api/v1 — PaySick facilitation API surface.
 *
 * Four endpoints:
 *   POST /api/v1/applications              — submit a new facilitation request
 *   POST /api/v1/decisions/:applicationId  — run the 5 Shield gates
 *   POST /api/v1/payouts/:applicationId    — provisional / final disbursement
 *   GET  /api/v1/schedules/:applicationId  — instalment schedule
 *
 * All routes:
 *   - require authentication
 *   - emit X-Robots-Tag header
 *   - use cents-only integer arithmetic for money
 *   - use compliant terminology (no loan/lend/borrow/interest/default)
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth.middleware');
const { runShieldDecision } = require('../services/shield-gates.service');
const { buildSchedule } = require('../services/schedule.service');
const { tierConfig } = require('../services/provider-scoring.service');
const webhooks = require('../services/webhook-dispatcher.service');
const dspAdapter = require('../adapters/dsp-check.adapter');

// Anti-crawling header on every response
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateReference() {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  const stamp = Date.now().toString(36).toUpperCase();
  return `PSK-${stamp}-${random}`;
}

async function loadApplication(applicationId) {
  const { rows } = await query(
    `SELECT * FROM v1_applications WHERE application_id = $1`,
    [applicationId]
  );
  return rows[0] || null;
}

async function loadProvider(providerId) {
  const { rows } = await query(
    `SELECT provider_id, status, tier, payout_delay_days, holdback_applications_remaining
     FROM providers WHERE provider_id = $1`,
    [providerId]
  );
  return rows[0] || null;
}

function isMissing(...vals) {
  return vals.some((v) => v === undefined || v === null || v === '');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/applications
// ─────────────────────────────────────────────────────────────────────────────

router.post('/applications', authenticateToken, async (req, res) => {
  try {
    const {
      patientId,
      providerId,
      procedureCode,
      procedureDescription,
      procedureUrgency,
      providerInvoiceAmount,
      termMonths,
      segment,
      medicalAidScheme,
      medicalAidPlan,
      schemeReimbursementEstimate
    } = req.body || {};

    if (isMissing(patientId, providerId, procedureCode, procedureUrgency,
                  providerInvoiceAmount, termMonths, segment)) {
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'INVALID_REQUEST'
      });
    }
    if (!['ELECTIVE', 'SEMI_URGENT', 'URGENT'].includes(procedureUrgency)) {
      return res.status(400).json({ error: 'Invalid procedureUrgency', code: 'INVALID_REQUEST' });
    }
    if (!['SEGMENT_1_GAP', 'SEGMENT_2_OOP'].includes(segment)) {
      return res.status(400).json({ error: 'Invalid segment', code: 'INVALID_REQUEST' });
    }
    if (!Number.isInteger(termMonths) || termMonths < 3 || termMonths > 36) {
      return res.status(400).json({ error: 'termMonths must be 3–36', code: 'INVALID_REQUEST' });
    }
    if (!Number.isInteger(providerInvoiceAmount) || providerInvoiceAmount <= 0) {
      return res.status(400).json({
        error: 'providerInvoiceAmount must be a positive integer in cents',
        code: 'INVALID_REQUEST'
      });
    }

    // Reject suspended/terminated providers immediately.
    const provider = await loadProvider(providerId);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' });
    }
    if (provider.status === 'SUSPENDED' || provider.status === 'TERMINATED') {
      return res.status(409).json({
        error: 'Provider is not accepting new facilitation requests',
        code: 'PROVIDER_UNAVAILABLE'
      });
    }

    // For Segment 1: trigger DSP check up front (best-effort — failure is non-fatal).
    if (segment === 'SEGMENT_1_GAP' && medicalAidScheme && medicalAidPlan) {
      try {
        await dspAdapter.checkDspStatus(medicalAidScheme, medicalAidPlan, providerId);
      } catch (e) {
        // Logged but not blocking — full DSP enforcement is done in Gate 4.
        console.warn('DSP check failed at submission:', e.message);
      }
    }

    const referenceNumber = generateReference();

    const { rows } = await query(
      `INSERT INTO v1_applications (
         reference_number, patient_id, provider_id, procedure_code, procedure_description,
         procedure_urgency, segment, provider_invoice_amount_cents, term_months,
         medical_aid_scheme, medical_aid_plan, scheme_reimbursement_estimate_cents,
         status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'SUBMITTED')
       RETURNING application_id, reference_number, created_at`,
      [
        referenceNumber, patientId, providerId, procedureCode, procedureDescription,
        procedureUrgency, segment, providerInvoiceAmount, termMonths,
        medicalAidScheme || null, medicalAidPlan || null,
        schemeReimbursementEstimate || null
      ]
    );

    const row = rows[0];

    // Pre-compute whether cooling-off will apply so the caller knows upfront.
    const coolingOffRequired = procedureUrgency === 'ELECTIVE' &&
      providerInvoiceAmount > 1_500_000;
    const response = {
      referenceNumber: row.reference_number,
      applicationId: row.application_id,
      status: 'SUBMITTED',
      estimatedDecisionMinutes: 2,
      coolingOffRequired
    };
    if (coolingOffRequired) {
      response.coolingOffExpiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    }

    return res.status(201).json(response);
  } catch (err) {
    console.error('v1.applications.create error:', err.message);
    return res.status(500).json({ error: 'Failed to submit application', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/decisions/:applicationId
// ─────────────────────────────────────────────────────────────────────────────

router.post('/decisions/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const app = await loadApplication(applicationId);
    if (!app) {
      return res.status(404).json({ error: 'Application not found', code: 'NOT_FOUND' });
    }

    // Gather decision context. Each sub-query is small and the route layer
    // is the right place to assemble the snapshot — the Shield engine itself
    // stays pure for testability.

    const provider = await loadProvider(app.provider_id);
    if (!provider) {
      return res.status(409).json({ error: 'Provider not on file', code: 'PROVIDER_NOT_FOUND' });
    }

    // Patient income — sourced from the most recent verification record.
    const incomeRes = await query(
      `SELECT verified_monthly_income_cents, method, verified_at
       FROM patient_income_verification
       WHERE patient_id = $1
       ORDER BY verified_at DESC LIMIT 1`,
      [app.patient_id]
    ).catch(() => ({ rows: [] }));
    const income = incomeRes.rows[0] || {};

    // Provider portfolio share + procedure-type concentration.
    const concRes = await query(
      `SELECT COALESCE(book_share_percent, 0)::float        AS book_share_percent,
              COALESCE(procedure_type_share_percent, 0)::float AS procedure_type_share_percent,
              COALESCE(patient_pd_rate, 0)::float          AS patient_pd_rate,
              COALESCE(billing_agreement_signed, false)    AS billing_agreement_signed
       FROM provider_scoring_snapshot
       WHERE provider_id = $1`,
      [app.provider_id]
    ).catch(() => ({ rows: [] }));
    const conc = concRes.rows[0] || {};

    // Portfolio circuit-breaker inputs.
    const pfRes = await query(
      `SELECT COALESCE(arrears_rate, 0)::float                AS arrears_rate,
              COALESCE(balance_sheet_percent, 0)::float       AS balance_sheet_percent,
              COALESCE(segment1_tariff_flagged_rate, 0)::float AS segment1_tariff_flagged_rate,
              COALESCE(reserve_fund_balance_cents, 0)::bigint AS reserve_fund_balance_cents,
              COALESCE(monthly_fee_income_cents, 0)::bigint   AS monthly_fee_income_cents
       FROM portfolio_metrics
       ORDER BY snapshot_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] }));
    const pf = pfRes.rows[0] || {};

    // Segment-1 benchmark lookup (only meaningful for Segment 1).
    let segment1 = null;
    if (app.segment === 'SEGMENT_1_GAP') {
      const benchRes = await query(
        `SELECT benchmark_cost_100pct FROM procedure_benchmarks
         WHERE procedure_code = $1 AND effective_to IS NULL
         ORDER BY effective_from DESC LIMIT 1`,
        [app.procedure_code]
      ).catch(() => ({ rows: [] }));
      const benchmarkRand = parseFloat(benchRes.rows[0]?.benchmark_cost_100pct || 0);
      const benchmarkCents = Math.round(benchmarkRand * 100);

      let dspIsOnList = true;
      let patientPlanCoveragePercent = 1.0;
      if (app.medical_aid_scheme && app.medical_aid_plan) {
        try {
          const dsp = await dspAdapter.checkDspStatus(
            app.medical_aid_scheme,
            app.medical_aid_plan,
            app.provider_id
          );
          dspIsOnList = dsp.isDsp;
          patientPlanCoveragePercent = dsp.schemeRateMultiple / 100;
        } catch (e) {
          dspIsOnList = false;
        }
      }
      segment1 = {
        benchmarkProcedureCost: benchmarkCents,
        patientPlanCoveragePercent,
        dspIsOnList
      };
    }

    const ctx = {
      application: {
        applicationId: app.application_id,
        segment: app.segment,
        procedureUrgency: app.procedure_urgency,
        providerInvoiceAmount: Number(app.provider_invoice_amount_cents),
        termMonths: app.term_months
      },
      provider: {
        providerId: app.provider_id,
        status: provider.status,
        billingAgreementSigned: !!conc.billing_agreement_signed,
        bookSharePercent: conc.book_share_percent,
        procedureTypeSharePercent: conc.procedure_type_share_percent,
        patientPdRate: conc.patient_pd_rate
      },
      patient: {
        patientId: app.patient_id,
        verifiedMonthlyIncome: income.verified_monthly_income_cents
          ? Number(income.verified_monthly_income_cents) : null,
        incomeVerificationMethod: income.method || null,
        verifiedAt: income.verified_at ? new Date(income.verified_at) : null
      },
      portfolio: {
        arrearsRate: pf.arrears_rate,
        balanceSheetPercent: pf.balance_sheet_percent,
        segment1TariffFlaggedRate: pf.segment1_tariff_flagged_rate,
        reserveFundBalance: Number(pf.reserve_fund_balance_cents || 0),
        monthlyFeeIncome: Number(pf.monthly_fee_income_cents || 0)
      },
      segment1,
      feePercent: 5
    };

    const result = runShieldDecision(ctx);

    // Persist the decision to the application row.
    const newStatus =
      result.decision === 'APPROVED' ? 'APPROVED'
      : result.decision === 'COOLING_OFF' ? 'COOLING_OFF'
      : result.decision === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW'
      : 'DECLINED';

    await query(
      `UPDATE v1_applications SET
         status = $1, decision = $2, decision_gate = $3, decision_reason = $4,
         facilitation_amount_cents = $5, monthly_instalment_cents = $6,
         facilitation_fee_cents = $7, mdr_amount_cents = $8,
         tariff_multiple_applied = $9,
         affordability_ratio = $10, affordability_ceiling = $11,
         cooling_off_required = $12, cooling_off_expires_at = $13,
         dsp_warning_required = $14, tariff_disclosure_required = $15,
         decided_at = NOW(), updated_at = NOW()
       WHERE application_id = $16`,
      [
        newStatus, result.decision, result.gate || null, result.reason || null,
        result.disbursementAmount || null, result.monthlyInstalment || null,
        result.facilitationFeeTotal || null, result.mdrAmount || null,
        result.tariffMultipleApplied || null,
        result.affordabilityRatio || null, result.affordabilityCeiling || null,
        !!result.coolingOffRequired, result.coolingOffExpiresAt || null,
        !!result.dspWarningRequired, !!result.tariffDisclosureRequired,
        app.application_id
      ]
    );

    // Fire webhooks for the terminal decision.
    if (result.decision === 'APPROVED' || result.decision === 'COOLING_OFF') {
      await webhooks.fire('application.approved', {
        applicationId: app.application_id,
        decision: result.decision
      });
    } else if (result.decision === 'DECLINED') {
      await webhooks.fire('application.declined', {
        applicationId: app.application_id,
        gate: result.gate,
        reason: result.reason
      });
    } else if (result.decision === 'MANUAL_REVIEW') {
      await webhooks.fire('application.manual_review', {
        applicationId: app.application_id,
        gate: result.gate,
        reason: result.reason
      });
    }

    if (Array.isArray(result.circuitBreakersFired) && result.circuitBreakersFired.length > 0) {
      for (const breaker of result.circuitBreakersFired) {
        const event = breaker === 'RESERVE_FUND'
          ? 'circuit_breaker.reserve_fund_triggered'
          : 'circuit_breaker.triggered';
        await webhooks.fire(event, { breaker, applicationId: app.application_id });
      }
    }
    if (result.circuitBreaker === 'PROVIDER_PD_RATE') {
      await webhooks.fire('provider.suspended', { providerId: app.provider_id });
    }
    if (result.decision === 'MANUAL_REVIEW' && result.gate === 'GATE_4_TARIFF') {
      await webhooks.fire('invoice.flagged_above_tariff', {
        applicationId: app.application_id,
        providerInvoiceAmount: Number(app.provider_invoice_amount_cents),
        tariffMultipleApplied: result.tariffMultipleApplied
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('v1.decisions error:', err.message);
    return res.status(500).json({ error: 'Decision processing failed', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/payouts/:applicationId
// ─────────────────────────────────────────────────────────────────────────────

router.post('/payouts/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { stage = 'PROVISIONAL', schemeActualPayment } = req.body || {};

    const app = await loadApplication(applicationId);
    if (!app) {
      return res.status(404).json({ error: 'Application not found', code: 'NOT_FOUND' });
    }
    if (app.status !== 'APPROVED' && app.status !== 'COOLING_OFF' && app.status !== 'DISBURSED') {
      return res.status(409).json({
        error: 'Application is not approved for disbursement',
        code: 'NOT_APPROVED'
      });
    }
    if (app.cooling_off_required && app.cooling_off_expires_at &&
        new Date(app.cooling_off_expires_at) > new Date()) {
      return res.status(409).json({
        error: 'Cooling-off period has not yet expired',
        code: 'COOLING_OFF_ACTIVE'
      });
    }

    const provider = await loadProvider(app.provider_id);
    if (!provider) {
      return res.status(409).json({ error: 'Provider not on file', code: 'PROVIDER_NOT_FOUND' });
    }

    const tier = provider.tier || 'NEW';
    const cfg = tierConfig[tier] || tierConfig.NEW;
    const payoutDelayDays = provider.payout_delay_days ?? cfg.payoutDelayDays;
    const holdbackRemaining = provider.holdback_applications_remaining ?? cfg.holdbackApplications;

    if (stage === 'PROVISIONAL') {
      const disbursementAmount = Number(app.facilitation_amount_cents);

      let holdbackPercent = 0;
      let holdbackAmount = 0;
      if (holdbackRemaining > 0) {
        holdbackPercent = cfg.holdbackPercent;
        holdbackAmount = Math.round(disbursementAmount * (holdbackPercent / 100));
      }
      const payoutAmount = disbursementAmount - holdbackAmount;
      const scheduledDate = new Date(Date.now() + payoutDelayDays * 24 * 60 * 60 * 1000);

      const payoutInsert = await query(
        `INSERT INTO v1_payouts (
           application_id, provider_id, stage,
           payout_amount_cents, holdback_amount_cents, holdback_percent,
           scheduled_disbursement_date, status
         ) VALUES ($1,$2,'PROVISIONAL',$3,$4,$5,$6,'PROVISIONAL')
         RETURNING payout_id, scheduled_disbursement_date`,
        [
          app.application_id, app.provider_id,
          payoutAmount, holdbackAmount, holdbackPercent,
          scheduledDate.toISOString().slice(0, 10)
        ]
      );
      const payout = payoutInsert.rows[0];

      if (holdbackAmount > 0) {
        await query(
          `INSERT INTO provider_holdback_ledger (
             provider_id, application_id, payout_id, holdback_amount_cents, status
           ) VALUES ($1,$2,$3,$4,'HELD')`,
          [app.provider_id, app.application_id, payout.payout_id, holdbackAmount]
        );
        // Decrement provider's holdback-applications remaining.
        await query(
          `UPDATE providers
             SET holdback_applications_remaining = GREATEST(holdback_applications_remaining - 1, 0)
           WHERE provider_id = $1`,
          [app.provider_id]
        );
      }

      // Generate the instalment schedule.
      const sched = buildSchedule({
        facilitationAmountCents: Number(app.facilitation_amount_cents),
        facilitationFeeCents: Number(app.facilitation_fee_cents || 0),
        termMonths: app.term_months,
        startDate: scheduledDate
      });
      const schedInsert = await query(
        `INSERT INTO v1_instalment_schedules (
           application_id, reference_number,
           total_facilitation_amount_cents, total_facilitation_fee_cents,
           total_repayable_cents, monthly_instalment_cents, term_months
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING schedule_id`,
        [
          app.application_id, app.reference_number,
          sched.totalFacilitationAmount, sched.totalFacilitationFee,
          sched.totalRepayable, sched.monthlyInstalment, sched.termMonths
        ]
      );
      const scheduleId = schedInsert.rows[0].schedule_id;
      for (const i of sched.instalments) {
        await query(
          `INSERT INTO v1_instalments (
             schedule_id, instalment_number, due_date, amount_cents, status
           ) VALUES ($1,$2,$3,$4,'PENDING')`,
          [scheduleId, i.instalmentNumber, i.dueDate.slice(0, 10), i.amount]
        );
      }

      await query(
        `UPDATE v1_applications SET status = 'DISBURSED', updated_at = NOW()
         WHERE application_id = $1`,
        [app.application_id]
      );

      await webhooks.fire('payout.disbursed_provisional', {
        applicationId: app.application_id,
        payoutId: payout.payout_id,
        payoutAmountCents: payoutAmount,
        holdbackAmountCents: holdbackAmount
      });

      return res.status(201).json({
        payoutId: payout.payout_id,
        stage: 'PROVISIONAL',
        payoutAmount,
        holdbackAmount,
        scheduledDisbursementDate: payout.scheduled_disbursement_date,
        instalmentScheduleId: scheduleId
      });
    }

    // ── Stage 2 — Final disbursement (Segment 1 only) ──────────────────────
    if (stage === 'FINAL') {
      if (app.segment !== 'SEGMENT_1_GAP') {
        return res.status(409).json({
          error: 'Final stage only applies to Segment 1 (gap) applications',
          code: 'NOT_SEGMENT_1'
        });
      }
      if (schemeActualPayment === undefined || schemeActualPayment === null) {
        return res.status(400).json({
          error: 'schemeActualPayment (from EOB) is required for final stage',
          code: 'INVALID_REQUEST'
        });
      }

      // Locate the provisional payout to cap against.
      const provRes = await query(
        `SELECT payout_id, payout_amount_cents FROM v1_payouts
         WHERE application_id = $1 AND stage = 'PROVISIONAL' LIMIT 1`,
        [app.application_id]
      );
      if (provRes.rows.length === 0) {
        return res.status(409).json({
          error: 'No provisional payout on record for this application',
          code: 'NO_PROVISIONAL'
        });
      }
      const provisional = provRes.rows[0];

      const approvedCeiling = Number(app.facilitation_amount_cents);
      const invoiceCents = Number(app.provider_invoice_amount_cents);

      // Final = MIN(provisional, invoice - scheme actual payment), but never
      // above the approved facilitation amount.
      const schemeResidual = Math.max(0, invoiceCents - Number(schemeActualPayment));
      let finalPayoutAmount = Math.min(Number(provisional.payout_amount_cents), schemeResidual);
      if (invoiceCents > approvedCeiling) {
        finalPayoutAmount = Math.min(finalPayoutAmount, approvedCeiling);
        await webhooks.fire('invoice.exceeded_ceiling', {
          applicationId: app.application_id,
          providerInvoiceAmount: invoiceCents,
          approvedCeiling
        });
      }

      const insRes = await query(
        `INSERT INTO v1_payouts (
           application_id, provider_id, stage,
           payout_amount_cents, holdback_amount_cents, holdback_percent,
           scheme_actual_payment_cents, status
         ) VALUES ($1,$2,'FINAL',$3,0,0,$4,'FINAL')
         RETURNING payout_id, created_at`,
        [
          app.application_id, app.provider_id,
          finalPayoutAmount, Number(schemeActualPayment)
        ]
      );
      const payout = insRes.rows[0];

      await webhooks.fire('payout.disbursed_final', {
        applicationId: app.application_id,
        payoutId: payout.payout_id,
        finalPayoutAmount,
        schemeActualPayment: Number(schemeActualPayment)
      });

      return res.status(201).json({
        payoutId: payout.payout_id,
        stage: 'FINAL',
        payoutAmount: finalPayoutAmount,
        holdbackAmount: 0,
        scheduledDisbursementDate: new Date().toISOString().slice(0, 10)
      });
    }

    return res.status(400).json({ error: 'Invalid stage', code: 'INVALID_REQUEST' });
  } catch (err) {
    console.error('v1.payouts error:', err.message);
    return res.status(500).json({ error: 'Payout failed', code: 'SERVER_ERROR' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/schedules/:applicationId
// ─────────────────────────────────────────────────────────────────────────────

router.get('/schedules/:applicationId', authenticateToken, async (req, res) => {
  try {
    const { applicationId } = req.params;

    const schedRes = await query(
      `SELECT * FROM v1_instalment_schedules WHERE application_id = $1 LIMIT 1`,
      [applicationId]
    );
    if (schedRes.rows.length === 0) {
      return res.status(404).json({
        error: 'No instalment schedule for this application',
        code: 'NOT_FOUND'
      });
    }
    const sched = schedRes.rows[0];

    const linesRes = await query(
      `SELECT instalment_number, due_date, amount_cents, status, collected_at
       FROM v1_instalments
       WHERE schedule_id = $1
       ORDER BY instalment_number ASC`,
      [sched.schedule_id]
    );

    const instalments = linesRes.rows.map((r) => ({
      instalmentNumber: r.instalment_number,
      dueDate: new Date(r.due_date).toISOString(),
      amount: Number(r.amount_cents),
      status: r.status,
      collectedAt: r.collected_at ? new Date(r.collected_at).toISOString() : undefined
    }));

    const next = instalments.find((i) => i.status === 'PENDING');

    return res.status(200).json({
      scheduleId: sched.schedule_id,
      referenceNumber: sched.reference_number,
      totalFacilitationAmount: Number(sched.total_facilitation_amount_cents),
      totalFacilitationFee: Number(sched.total_facilitation_fee_cents),
      totalRepayable: Number(sched.total_repayable_cents),
      monthlyInstalment: Number(sched.monthly_instalment_cents),
      termMonths: sched.term_months,
      nextInstalmentDate: next ? next.dueDate : null,
      nextInstalmentAmount: next ? next.amount : null,
      instalments
    });
  } catch (err) {
    console.error('v1.schedules error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch schedule', code: 'SERVER_ERROR' });
  }
});

module.exports = router;
