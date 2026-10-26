/**
 * UNDERWRITING SERVICE — Shield Framework v5.0
 *
 * Implements five Segment 1 tariff billing risk controls:
 *   Control 1 — DSP Status Verification
 *   Control 2 — Tariff-Anchored Facilitation Ceiling
 *   Control 3 — Provider Billing Agreement Gate
 *   Control 4 — Tariff Disclosure Screen
 *   Control 5 — Post-Procedure EOB/Payout Reconciliation
 *
 * Language rules: no "loan", "credit", "lend", "borrow", "interest rate", "principal".
 * Use: "payment plan", "facilitation amount", "monthly instalment", "facilitation fee".
 */

const { query } = require('../config/database');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DISCLOSURE_VERSION = '1.0';

const DISCLOSURE_TEXT = `
TARIFF GAP FACILITATION DISCLOSURE — PaySick (Pty) Ltd

This disclosure explains the gap between your medical scheme's tariff (what your
scheme pays) and the healthcare provider's actual charge (what the provider bills).

WHAT IS A GAP?
Your medical scheme pays claims based on a tariff rate — typically the National
Health Reference Price List (NHRPL) or a multiple thereof. Many healthcare
providers charge above this tariff, resulting in a "tariff gap" — the difference
between what your scheme pays and what the provider charges.

HOW PAYSICK HELPS
PaySick facilitates the payment of your tariff gap through a structured payment
plan. You agree to pay a facilitation fee in exchange for PaySick settling your
gap amount directly with the provider.

YOUR RIGHTS
1. You have the right to request an itemised account from the provider.
2. You have the right to verify the provider's charges against the applicable
   tariff schedule.
3. You are not obligated to accept gap payment facilitation — you may negotiate
   directly with the provider or pay the gap yourself.
4. The facilitation fee is fixed and disclosed upfront. No hidden charges apply.

PROVIDER DSP STATUS
If your provider is a Designated Service Provider (DSP) for your medical scheme,
your out-of-pocket exposure may be reduced. If your provider is NOT a DSP, a
conservative gap estimate and an additional upfront deposit may apply.

FACILITATION CEILING
The maximum gap amount PaySick will facilitate is capped based on your medical
scheme's benefit coverage for this procedure. This ceiling protects you from
facilitation of excessive provider charges.

BY ACKNOWLEDGING THIS DISCLOSURE, YOU CONFIRM THAT:
- You have read and understood the above information.
- You have had the opportunity to ask questions.
- You consent to PaySick facilitating the gap payment on your behalf.
- You understand the total facilitation amount and monthly instalment schedule.

PaySick (Pty) Ltd | Registration No. 2023/123456/07
NCR Registration: [Pending] | FSCA Registration: [Pending]
This is a facilitation service, not financial advice.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 1 — DSP STATUS VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * dspCheck — Control 1
 * Looks up the DSP registry, determines provider DSP status,
 * applies conservative gap / upfront deposit rules, and logs audit entry.
 *
 * @param {string} applicationId
 * @param {string} providerHpcsaNumber
 * @param {string} patientSchemeCode
 * @param {string} patientPlanCode
 * @returns {object} DSP check result
 */
async function dspCheck(applicationId, providerHpcsaNumber, patientSchemeCode, patientPlanCode) {
  // 1. Look up DSP registry
  const registryResult = await query(
    `SELECT provider_hpcsa_number, scheme_code, dsp_effective_from, dsp_effective_to
     FROM dsp_registry
     WHERE provider_hpcsa_number = $1
       AND scheme_code = $2
       AND (dsp_effective_to IS NULL OR dsp_effective_to >= CURRENT_DATE)
     LIMIT 1`,
    [providerHpcsaNumber, patientSchemeCode]
  );

  let dspStatus;
  let conservativeGapApplied = false;
  let upfrontPercentIncrease = 0;
  let disclosureRequired = false;
  let manualReviewRequired = false;

  if (registryResult.rows.length > 0) {
    // Provider found in DSP registry — standard gap, no increase
    dspStatus = 'DSP';
    conservativeGapApplied = false;
    upfrontPercentIncrease = 0;
    disclosureRequired = false;
  } else if (patientSchemeCode && patientSchemeCode !== 'UNKNOWN_SCHEME') {
    // Provider not in DSP registry for this scheme — NON_DSP
    dspStatus = 'NON_DSP';
    conservativeGapApplied = true;
    upfrontPercentIncrease = 10;
    disclosureRequired = true;
  } else {
    // Scheme code unknown — cannot determine DSP status
    dspStatus = 'UNKNOWN';
    upfrontPercentIncrease = 5;
    manualReviewRequired = true;
  }

  // 2. Update application with DSP status
  const updateResult = await query(
    `UPDATE applications
     SET dsp_status = $1,
         dsp_verified_at = NOW(),
         conservative_gap_applied = $2,
         dsp_check_scheme_code = $3,
         dsp_check_plan_code = $4,
         dsp_verification_source = 'DSP_REGISTRY'
     WHERE application_id = $5
     RETURNING application_id, dsp_status`,
    [dspStatus, conservativeGapApplied, patientSchemeCode, patientPlanCode, applicationId]
  );

  // 3. Add to manual review queue if UNKNOWN
  if (manualReviewRequired) {
    await query(
      `INSERT INTO manual_review_queue
         (application_id, review_type, priority, sla_hours, status, opened_at, sla_deadline)
       VALUES ($1, 'DSP_UNKNOWN_STATUS', 'HIGH', 4, 'OPEN', NOW(), NOW() + INTERVAL '4 hours')`,
      [applicationId]
    );
  }

  // 4. Audit log
  await logAuditEvent(
    applicationId,
    null,
    'DSP_CHECK',
    'SYSTEM',
    { provider_hpcsa_number: providerHpcsaNumber, scheme_code: patientSchemeCode, plan_code: patientPlanCode },
    dspStatus,
    { conservative_gap_applied: conservativeGapApplied, upfront_percent_increase: upfrontPercentIncrease, manual_review_required: manualReviewRequired }
  );

  return {
    dsp_status: dspStatus,
    conservative_gap_applied: conservativeGapApplied,
    upfront_percent_increase: upfrontPercentIncrease,
    disclosure_required: disclosureRequired,
    manual_review_required: manualReviewRequired,
    application_id: applicationId
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 2 — TARIFF-ANCHORED FACILITATION CEILING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * calculateCeiling — Control 2
 * Looks up the procedure benchmark, calculates the facilitation ceiling,
 * compares to the provider's submitted amount, and triggers a manual hold
 * if the variance exceeds 30%.
 *
 * ceiling = benchmark_cost_100pct * (1 - coverage_multiplier)
 *
 * @param {string} applicationId
 * @param {string} procedureCode
 * @param {string} metroRegion
 * @param {number} coverageMultiplier  (e.g. 0.7 = scheme covers 70%)
 * @param {number} providerSubmittedAmount
 * @returns {object} Ceiling calculation result
 */
async function calculateCeiling(applicationId, procedureCode, metroRegion, coverageMultiplier, providerSubmittedAmount) {
  // 1. Look up procedure benchmark
  const benchmarkResult = await query(
    `SELECT benchmark_cost_100pct, procedure_name
     FROM procedure_benchmarks
     WHERE procedure_code = $1
       AND (metro_region = $2 OR metro_region IS NULL)
       AND effective_to IS NULL
     ORDER BY metro_region NULLS LAST
     LIMIT 1`,
    [procedureCode, metroRegion]
  );

  // Handle missing benchmark
  if (benchmarkResult.rows.length === 0) {
    // Add to manual review queue
    await query(
      `INSERT INTO manual_review_queue
         (application_id, review_type, priority, sla_hours, status, opened_at, sla_deadline)
       VALUES ($1, 'NO_BENCHMARK', 'STANDARD', 24, 'OPEN', NOW(), NOW() + INTERVAL '24 hours')`,
      [applicationId]
    );

    await logAuditEvent(
      applicationId,
      null,
      'CEILING_CALCULATION',
      'SYSTEM',
      { procedure_code: procedureCode, metro_region: metroRegion },
      'MANUAL_REVIEW',
      { reason: 'NO_BENCHMARK' }
    );

    return {
      decision: 'MANUAL_REVIEW',
      reason: 'NO_BENCHMARK',
      procedure_code: procedureCode
    };
  }

  const benchmark = parseFloat(benchmarkResult.rows[0].benchmark_cost_100pct);
  const procedureName = benchmarkResult.rows[0].procedure_name;

  // 2. Calculate ceiling: gap = benchmark * (1 - coverage_multiplier)
  const calculatedCeiling = Math.max(0, parseFloat((benchmark * (1 - coverageMultiplier)).toFixed(2)));

  // Handle zero ceiling (coverage_multiplier = 1.0 means 100% covered — no gap)
  if (calculatedCeiling === 0 || coverageMultiplier >= 1.0) {
    // Insert ceiling calculation record
    await query(
      `INSERT INTO facilitation_ceiling_calculations
         (application_id, procedure_code, benchmark_cost_100pct, patient_plan_coverage_multiplier,
          calculated_ceiling, provider_submitted_amount, variance_percent, above_30pct_threshold, hold_triggered)
       VALUES ($1, $2, $3, $4, 0, $5, NULL, FALSE, FALSE)
       RETURNING id, calculated_ceiling`,
      [applicationId, procedureCode, benchmark, coverageMultiplier, providerSubmittedAmount]
    );

    await query(
      `UPDATE applications SET facilitation_ceiling = 0 WHERE application_id = $1`,
      [applicationId]
    );

    await logAuditEvent(
      applicationId, null, 'CEILING_CALCULATION', 'SYSTEM',
      { procedure_code: procedureCode, coverage_multiplier: coverageMultiplier, benchmark },
      'REJECTED',
      { reason: 'FULL_COVERAGE_NO_GAP', calculated_ceiling: 0 }
    );

    return {
      calculated_ceiling: 0,
      decision: 'REJECTED',
      rejection_reason: 'Your medical scheme provides full coverage for this procedure — no gap facilitation is required.',
      benchmark_cost_100pct: benchmark,
      procedure_name: procedureName
    };
  }

  // 3. Calculate variance from benchmark
  const variancePercent = parseFloat(((providerSubmittedAmount - benchmark) / benchmark * 100).toFixed(2));
  const above30pct = variancePercent > 30;
  const holdTriggered = above30pct;

  // 4. Insert ceiling calculation record
  const calcResult = await query(
    `INSERT INTO facilitation_ceiling_calculations
       (application_id, procedure_code, benchmark_cost_100pct, patient_plan_coverage_multiplier,
        calculated_ceiling, provider_submitted_amount, variance_percent, above_30pct_threshold,
        hold_triggered, hold_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, calculated_ceiling`,
    [
      applicationId, procedureCode, benchmark, coverageMultiplier, calculatedCeiling,
      providerSubmittedAmount, variancePercent, above30pct, holdTriggered,
      holdTriggered ? `Provider invoice ${variancePercent.toFixed(1)}% above benchmark (threshold: 30%)` : null
    ]
  );

  // 5. Update application
  if (holdTriggered) {
    await query(
      `UPDATE applications
       SET facilitation_ceiling = $1, on_manual_hold = TRUE,
           hold_reason = $2, above_30pct_threshold = TRUE,
           provider_submitted_amount = $3
       WHERE application_id = $4`,
      [calculatedCeiling, `Provider invoice ${variancePercent.toFixed(1)}% above benchmark`, providerSubmittedAmount, applicationId]
    );

    // Add to manual review queue
    await query(
      `INSERT INTO manual_review_queue
         (application_id, review_type, priority, sla_hours, status, opened_at, sla_deadline)
       VALUES ($1, 'TARIFF_INFLATION_HOLD', 'HIGH', 8, 'OPEN', NOW(), NOW() + INTERVAL '8 hours')`,
      [applicationId]
    );
  } else {
    await query(
      `UPDATE applications
       SET facilitation_ceiling = $1, above_30pct_threshold = FALSE,
           provider_submitted_amount = $2
       WHERE application_id = $3`,
      [calculatedCeiling, providerSubmittedAmount, applicationId]
    );
  }

  // 6. Audit log
  await logAuditEvent(
    applicationId, null, 'CEILING_CALCULATION', 'SYSTEM',
    { procedure_code: procedureCode, coverage_multiplier: coverageMultiplier, benchmark, submitted: providerSubmittedAmount },
    holdTriggered ? 'MANUAL_HOLD' : 'APPROVED',
    { calculated_ceiling: calculatedCeiling, variance_percent: variancePercent, above_30pct_threshold: above30pct }
  );

  const decision = holdTriggered ? 'MANUAL_HOLD' : 'APPROVED';

  return {
    calculated_ceiling: calculatedCeiling,
    benchmark_cost_100pct: benchmark,
    procedure_name: procedureName,
    coverage_multiplier: coverageMultiplier,
    provider_submitted_amount: providerSubmittedAmount,
    variance_percent: variancePercent,
    above_30pct_threshold: above30pct,
    manual_hold_triggered: holdTriggered,
    decision
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 3 — PROVIDER BILLING AGREEMENT GATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkBillingAgreement — Control 3
 * Checks whether a provider has an ACTIVE billing agreement.
 * Segment 2 providers bypass this gate entirely.
 *
 * @param {string} providerId
 * @param {string} segment  ('SEGMENT_1' | 'SEGMENT_2')
 * @returns {object} Eligibility result
 */
async function checkBillingAgreement(providerId, segment) {
  // Segment 2 always bypasses the billing agreement gate
  if (segment === 'SEGMENT_2') {
    await logAuditEvent(
      null, providerId, 'BILLING_AGREEMENT_CHECK', 'SYSTEM',
      { provider_id: providerId, segment },
      'ELIGIBLE',
      { gap_financing_eligible: true, segment_bypass: true }
    );

    return {
      gap_financing_eligible: true,
      segment_bypass: true,
      segment
    };
  }

  // Look up billing agreement for Segment 1
  const agreementResult = await query(
    `SELECT id, status, agreement_version, signed_at, suspension_reason, suspended_at
     FROM provider_billing_agreements
     WHERE provider_id = $1
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY created_at DESC
     LIMIT 1`,
    [providerId]
  );

  let result;

  if (agreementResult.rows.length === 0) {
    result = {
      gap_financing_eligible: false,
      agreement_status: 'NONE',
      block_reason: 'No billing agreement on file. Provider must sign the PaySick Billing Agreement before gap payment facilitation can proceed.',
      segment
    };
  } else {
    const agreement = agreementResult.rows[0];
    if (agreement.status === 'ACTIVE') {
      result = {
        gap_financing_eligible: true,
        agreement_status: 'ACTIVE',
        agreement_version: agreement.agreement_version,
        signed_at: agreement.signed_at,
        segment
      };
    } else if (agreement.status === 'SUSPENDED') {
      result = {
        gap_financing_eligible: false,
        agreement_status: 'SUSPENDED',
        suspension_reason: agreement.suspension_reason,
        suspended_at: agreement.suspended_at,
        block_reason: 'Provider billing agreement is suspended. Gap payment facilitation is blocked until the suspension is lifted.',
        segment
      };
    } else {
      result = {
        gap_financing_eligible: false,
        agreement_status: agreement.status,
        block_reason: `Billing agreement is in status '${agreement.status}'. Only ACTIVE agreements permit gap facilitation.`,
        segment
      };
    }
  }

  await logAuditEvent(
    null, providerId, 'BILLING_AGREEMENT_CHECK', 'SYSTEM',
    { provider_id: providerId, segment },
    result.gap_financing_eligible ? 'ELIGIBLE' : 'BLOCKED',
    result
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 4 — TARIFF DISCLOSURE SCREEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * createDisclosure — Control 4a
 * Creates a tariff disclosure record (before acknowledgement).
 *
 * @param {string} applicationId
 * @param {string} patientId
 * @param {string} dspStatus
 * @param {number} estimatedGap
 * @param {number} providerAmount
 * @param {number} benchmark
 * @returns {object} Created disclosure record
 */
async function createDisclosure(applicationId, patientId, dspStatus, estimatedGap, providerAmount, benchmark) {
  const result = await query(
    `INSERT INTO tariff_disclosures
       (application_id, patient_id, disclosure_version, disclosure_text,
        dsp_status_at_disclosure, estimated_gap_at_disclosure,
        provider_amount_at_disclosure, benchmark_at_disclosure,
        acknowledged, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, NOW())
     RETURNING id, application_id, acknowledged, created_at`,
    [applicationId, patientId, DISCLOSURE_VERSION, DISCLOSURE_TEXT,
     dspStatus, estimatedGap, providerAmount, benchmark]
  );

  await logAuditEvent(
    applicationId, null, 'DISCLOSURE_CREATED', 'SYSTEM',
    { patient_id: patientId, dsp_status: dspStatus, estimated_gap: estimatedGap },
    'PENDING_ACKNOWLEDGEMENT',
    { disclosure_id: result.rows[0].id }
  );

  return {
    disclosure_id: result.rows[0].id,
    application_id: applicationId,
    acknowledged: false,
    disclosure_version: DISCLOSURE_VERSION,
    created_at: result.rows[0].created_at
  };
}

/**
 * acknowledgeDisclosure — Control 4b
 * Records patient acknowledgement of tariff disclosure.
 *
 * @param {number} disclosureId
 * @param {string} applicationId
 * @param {string} patientId
 * @param {string} method  ('CHECKBOX' | 'OTP' | 'BIOMETRIC')
 * @param {string} ipAddress
 * @param {string} userAgent
 * @param {string} sessionId
 * @returns {object} Acknowledgement result
 */
async function acknowledgeDisclosure(disclosureId, applicationId, patientId, method, ipAddress, userAgent, sessionId) {
  // Update disclosure to acknowledged
  const updateResult = await query(
    `UPDATE tariff_disclosures
     SET acknowledged = TRUE,
         acknowledged_at = NOW(),
         acknowledgement_method = $1,
         ip_address = $2,
         user_agent = $3,
         session_id = $4
     WHERE id = $5
       AND application_id = $6
       AND patient_id = $7
     RETURNING id, application_id, acknowledged, acknowledged_at`,
    [method, ipAddress, userAgent, sessionId, disclosureId, applicationId, patientId]
  );

  // Update application disclosure_acknowledged flag
  await query(
    `UPDATE applications
     SET disclosure_acknowledged = TRUE,
         tariff_disclosure_id = $1
     WHERE application_id = $2`,
    [disclosureId, applicationId]
  );

  await logAuditEvent(
    applicationId, null, 'DISCLOSURE_ACKNOWLEDGED', patientId,
    { disclosure_id: disclosureId, method, ip_address: ipAddress },
    'ACKNOWLEDGED',
    { acknowledged_at: updateResult.rows[0]?.acknowledged_at }
  );

  return {
    disclosure_id: disclosureId,
    acknowledged: true,
    application_can_proceed: true,
    acknowledged_at: updateResult.rows[0]?.acknowledged_at
  };
}

/**
 * checkDisclosureGate — Control 4c
 * Checks whether the application has an acknowledged disclosure.
 * Returns boolean indicating whether the application can proceed to APPROVED.
 *
 * @param {string} applicationId
 * @returns {object} Gate check result
 */
async function checkDisclosureGate(applicationId) {
  const result = await query(
    `SELECT disclosure_acknowledged, tariff_disclosure_id
     FROM applications
     WHERE application_id = $1`,
    [applicationId]
  );

  if (result.rows.length === 0) {
    return {
      can_proceed_to_approval: false,
      reason: 'Application not found'
    };
  }

  const { disclosure_acknowledged, tariff_disclosure_id } = result.rows[0];

  if (!disclosure_acknowledged || !tariff_disclosure_id) {
    return {
      can_proceed_to_approval: false,
      reason: 'Tariff disclosure has not been acknowledged by the patient. Acknowledgement is required before approval.'
    };
  }

  return {
    can_proceed_to_approval: true,
    tariff_disclosure_id
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL 5 — EOB / PAYOUT RECONCILIATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * triggerProvisionalPayout — Control 5a
 * Creates a PROVISIONAL payout stage at 80% of the facilitation ceiling.
 *
 * @param {string} applicationId
 * @returns {object} Provisional payout record
 */
async function triggerProvisionalPayout(applicationId) {
  // Fetch application ceiling and provider
  const appResult = await query(
    `SELECT application_id, facilitation_ceiling, provider_id, disclosure_acknowledged
     FROM applications
     WHERE application_id = $1`,
    [applicationId]
  );

  if (appResult.rows.length === 0) {
    throw new Error('Application not found');
  }

  const app = appResult.rows[0];
  const ceiling = parseFloat(app.facilitation_ceiling);
  const provisionalAmount = parseFloat((ceiling * 0.80).toFixed(2));

  // Insert payout stage
  const payoutResult = await query(
    `INSERT INTO payout_stages
       (application_id, provider_id, stage, status, scheduled_amount, triggered_at)
     VALUES ($1, $2, 'PROVISIONAL', 'PENDING', $3, NOW())
     RETURNING id, stage, scheduled_amount, status`,
    [applicationId, app.provider_id, provisionalAmount]
  );

  // Update application with provisional_payout_id
  await query(
    `UPDATE applications SET provisional_payout_id = $1 WHERE application_id = $2`,
    [payoutResult.rows[0].id, applicationId]
  );

  await logAuditEvent(
    applicationId, app.provider_id, 'PROVISIONAL_PAYOUT_TRIGGERED', 'SYSTEM',
    { facilitation_ceiling: ceiling, provisional_percent: 80 },
    'PAYOUT_CREATED',
    { payout_id: payoutResult.rows[0].id, scheduled_amount: provisionalAmount }
  );

  return {
    payout_id: payoutResult.rows[0].id,
    payout_stage: 'PROVISIONAL',
    scheduled_amount: parseFloat(payoutResult.rows[0].scheduled_amount),
    percent_of_ceiling: 80,
    status: payoutResult.rows[0].status,
    facilitation_ceiling: ceiling
  };
}

/**
 * submitEob — Control 5b
 * Creates an EOB submission record for reconciliation.
 *
 * @param {string} applicationId
 * @param {string} providerId
 * @param {number} invoiceAmount
 * @param {number} eobAmount  (scheme's EOB total paid)
 * @param {string} invoiceUrl
 * @param {string} eobUrl
 * @param {string} submittedBy
 * @returns {object} EOB submission record
 */
async function submitEob(applicationId, providerId, invoiceAmount, eobAmount, invoiceUrl, eobUrl, submittedBy) {
  // Scheme residual = scheme's EOB payment to provider (what scheme pays directly to provider)
  // This represents what's left for PaySick to settle in the final payout
  const schemeResidual = parseFloat(eobAmount) || 0;

  const result = await query(
    `INSERT INTO eob_submissions
       (application_id, provider_id, submitted_at, submitted_by,
        provider_invoice_amount, provider_invoice_url,
        scheme_eob_amount, scheme_residual_amount, eob_document_url,
        reconciliation_status)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, 'PENDING')
     RETURNING id, application_id, reconciliation_status, submitted_at`,
    [applicationId, providerId, submittedBy, invoiceAmount, invoiceUrl,
     eobAmount, schemeResidual, eobUrl]
  );

  // Link EOB to application
  await query(
    `UPDATE applications SET eob_submission_id = $1 WHERE application_id = $2`,
    [result.rows[0].id, applicationId]
  );

  return {
    eob_submission_id: result.rows[0].id,
    application_id: applicationId,
    reconciliation_status: 'PENDING',
    submitted_at: result.rows[0].submitted_at
  };
}

/**
 * reconcileEob — Control 5c
 * Calculates final payout = MIN(remaining_approved, scheme_residual).
 * Excess withheld if provider invoice > ceiling.
 *
 * @param {string} applicationId
 * @returns {object} Reconciliation result
 */
async function reconcileEob(applicationId) {
  // Fetch application
  const appResult = await query(
    `SELECT application_id, facilitation_ceiling, provider_id FROM applications WHERE application_id = $1`,
    [applicationId]
  );

  if (appResult.rows.length === 0) {
    throw new Error('Application not found');
  }
  const app = appResult.rows[0];
  const ceiling = parseFloat(app.facilitation_ceiling);

  // Fetch EOB submission
  const eobResult = await query(
    `SELECT id, scheme_residual_amount, provider_invoice_amount, reconciliation_status
     FROM eob_submissions
     WHERE application_id = $1
       AND reconciliation_status = 'PENDING'
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [applicationId]
  );

  if (eobResult.rows.length === 0) {
    throw new Error('No pending EOB submission found for this application');
  }
  const eob = eobResult.rows[0];
  const schemeResidual = parseFloat(eob.scheme_residual_amount);
  const providerInvoice = parseFloat(eob.provider_invoice_amount);

  // Fetch provisional payout (already paid)
  const provisionResult = await query(
    `SELECT id, actual_amount_paid, scheduled_amount
     FROM payout_stages
     WHERE application_id = $1 AND stage = 'PROVISIONAL'
     ORDER BY created_at DESC
     LIMIT 1`,
    [applicationId]
  );

  const provisionalPaid = provisionResult.rows.length > 0
    ? parseFloat(provisionResult.rows[0].actual_amount_paid || provisionResult.rows[0].scheduled_amount)
    : 0;

  // remaining_approved = ceiling - provisional_paid
  const remainingApproved = Math.max(0, ceiling - provisionalPaid);

  // final_payout = MIN(remaining_approved, scheme_residual)
  const finalPayoutAmount = Math.min(remainingApproved, schemeResidual);

  // excess_withheld: if provider invoiced more than ceiling, that excess is withheld
  const excessWithheld = Math.max(0, providerInvoice - ceiling);
  const notificationSent = excessWithheld > 0;

  // Insert final payout stage
  const finalPayoutResult = await query(
    `INSERT INTO payout_stages
       (application_id, provider_id, stage, status, scheduled_amount, triggered_at)
     VALUES ($1, $2, 'FINAL', 'PENDING', $3, NOW())
     RETURNING id, stage, scheduled_amount`,
    [applicationId, app.provider_id, finalPayoutAmount]
  );

  // Update EOB reconciliation status
  await query(
    `UPDATE eob_submissions
     SET reconciliation_status = 'RECONCILED',
         reconciled_at = NOW(),
         final_payout_amount = $1,
         variance_from_approved = $2
     WHERE id = $3`,
    [finalPayoutAmount, providerInvoice - ceiling, eob.id]
  );

  // Update application
  await query(
    `UPDATE applications SET final_payout_id = $1 WHERE application_id = $2`,
    [finalPayoutResult.rows[0].id, applicationId]
  );

  // Create notification if excess was withheld
  await query(
    `INSERT INTO notification_log
       (application_id, recipient_type, recipient_id, channel, template_id, sent_at)
     VALUES ($1, 'PROVIDER', $2, 'EMAIL', $3, NOW())`,
    [applicationId, app.provider_id,
     excessWithheld > 0 ? 'EXCESS_WITHHELD_NOTIFICATION' : 'FINAL_PAYOUT_NOTIFICATION']
  );

  await logAuditEvent(
    applicationId, app.provider_id, 'EOB_RECONCILIATION', 'SYSTEM',
    { ceiling, provisional_paid: provisionalPaid, scheme_residual: schemeResidual, provider_invoice: providerInvoice },
    'RECONCILED',
    { final_payout_amount: finalPayoutAmount, excess_withheld: excessWithheld }
  );

  return {
    final_payout_amount: finalPayoutAmount,
    excess_withheld: excessWithheld,
    notification_sent: notificationSent,
    reconciliation_status: 'RECONCILED',
    remaining_approved: remainingApproved,
    scheme_residual: schemeResidual,
    facilitation_ceiling: ceiling
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * addToManualReviewQueue
 */
async function addToManualReviewQueue(applicationId, providerId, reviewType, priority, slaHours) {
  const result = await query(
    `INSERT INTO manual_review_queue
       (application_id, provider_id, review_type, priority, sla_hours, status, opened_at, sla_deadline)
     VALUES ($1, $2, $3, $4, $5, 'OPEN', NOW(), NOW() + ($5 || ' hours')::INTERVAL)
     RETURNING id`,
    [applicationId, providerId, reviewType, priority, slaHours]
  );
  return result.rows[0];
}

/**
 * logAuditEvent
 */
async function logAuditEvent(applicationId, providerId, eventType, actor, inputData, outputDecision, outputData) {
  const result = await query(
    `INSERT INTO underwriting_audit_log
       (application_id, provider_id, event_type, actor, input_data, output_decision, output_data, rule_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'SHIELD_V5')
     RETURNING id`,
    [applicationId, providerId, eventType, actor,
     JSON.stringify(inputData), outputDecision, JSON.stringify(outputData)]
  );
  return result.rows[0];
}

module.exports = {
  dspCheck,
  calculateCeiling,
  checkBillingAgreement,
  createDisclosure,
  acknowledgeDisclosure,
  checkDisclosureGate,
  triggerProvisionalPayout,
  submitEob,
  reconcileEob,
  addToManualReviewQueue,
  logAuditEvent,
  DISCLOSURE_TEXT,
  DISCLOSURE_VERSION
};
