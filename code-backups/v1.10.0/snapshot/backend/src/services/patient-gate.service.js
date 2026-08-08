/**
 * PATIENT GATE SERVICE (Gate 2)
 *
 * Purpose: Determine if this patient can afford this loan without breaching
 * affordability ceilings. Identify convenience borrowers (lower risk) versus
 * necessity borrowers (higher risk, tighter controls).
 *
 * This is the core underwriting engine. It produces a RECOMMENDATION, not a decision.
 * Human reviews all amber and red outcomes.
 */

const { query, transaction } = require('../config/database');

// ═══════════════════════════════════════════════════════════════
// HARD RULES — Absolute, no override
// ═══════════════════════════════════════════════════════════════

const HARD_FLOORS = {
  minimum_income: 4000,              // R4,000 — protects vulnerable populations
  maximum_rti: 0.20,                 // 20% repayment-to-income ceiling
  maximum_dti_full_procedure: 0.55,  // 55% DTI for full-procedure financing
  minimum_gap_amount: 2000,          // R2,000 minimum gap financing (below = suggest cash)
  maximum_restructure_cost_increase: 0.25  // 25% max cost increase on restructuring
};

const AMBER_THRESHOLDS = {
  rti_comfort_zone: 0.15,            // 15% — above this is amber
  dti_review_threshold: 0.45,        // 45% — above this is amber
  elective_cooling_off_amount: 15000 // R15,000 — above this triggers 48hr cooling off
};

// Elective procedure types (convenience signal)
const ELECTIVE_PROCEDURES = [
  'dental_veneers', 'dental_implants', 'lasik', 'cosmetic',
  'fertility', 'dental_whitening', 'orthodontics'
];

// Income verification rate adjustments
const VERIFICATION_RATE_ADJUSTMENTS = {
  api_verified: 0,       // Best rate — data is tamper-proof
  pdf_parsed: 0.005,     // +0.5%
  manual_verified: 0.015 // +1.5% — highest uncertainty
};

// Base interest rate (prime + spread)
const BASE_RATE = 0.1125; // 11.25% (SA prime) — adjust as needed

class PatientGateService {
  /**
   * MAIN ENTRY: Assess a patient's loan application.
   * Returns recommendation with rationale for human review.
   */
  async assessApplication(application) {
    const result = {
      gate: 'PATIENT_GATE',
      application_id: application.application_id || null,
      patient_id: application.patient_id,
      decision: null,
      ai_recommendation: null,
      ai_confidence: null,
      conditions: [],
      flags: [],
      rationale: [],
      requires_human: false,
      alternative: null,
      borrower_profile: null,
      risk_tier: null,
      traffic_light: null,
      affordability: {}
    };

    // ═══════════════════════════════════════════════════════════
    // HARD FLOOR — Income minimum R4,000
    // ═══════════════════════════════════════════════════════════
    if (application.monthly_income_verified < HARD_FLOORS.minimum_income) {
      result.decision = 'DECLINE';
      result.traffic_light = 'red';
      result.ai_recommendation = 'decline';
      result.ai_confidence = 1.0;
      result.rationale.push(
        `Income of R${application.monthly_income_verified.toLocaleString()} is below R4,000 hard floor. ` +
        `Patient is served by public healthcare. This floor is an ethical safeguard and credit quality mechanism. ` +
        `No override permitted — coded into the algorithm.`
      );
      return await this.persistAssessment(application, result);
    }

    // ═══════════════════════════════════════════════════════════
    // GAP FINANCING VALIDATION
    // ═══════════════════════════════════════════════════════════
    if (application.segment === 'gap_financing') {
      const gapValidation = this.validateGapFinancing(application);
      if (gapValidation.block) {
        result.decision = 'DECLINE';
        result.traffic_light = 'red';
        result.ai_recommendation = 'decline';
        result.ai_confidence = 0.95;
        result.rationale.push(gapValidation.reason);
        return await this.persistAssessment(application, result);
      }
      if (gapValidation.flag) {
        result.flags.push(gapValidation.flag);
        result.rationale.push(gapValidation.reason);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // CALCULATE PROPOSED REPAYMENT
    // ═══════════════════════════════════════════════════════════
    const applicableRate = this.getApplicableRate(application);
    const proposedRepayment = this.calculateMonthlyRepayment(
      application.loan_amount_requested,
      application.loan_term_months,
      applicableRate
    );
    result.affordability.proposed_monthly_repayment = proposedRepayment;
    result.affordability.applicable_rate = applicableRate;

    // ═══════════════════════════════════════════════════════════
    // HARD CEILING — RTI > 20%
    // ═══════════════════════════════════════════════════════════
    const rti = proposedRepayment / application.monthly_income_verified;
    result.affordability.rti = rti;

    if (rti > HARD_FLOORS.maximum_rti) {
      result.decision = 'DECLINE';
      result.traffic_light = 'red';
      result.ai_recommendation = 'decline';
      result.ai_confidence = 1.0;
      result.rationale.push(
        `Repayment-to-income ratio of ${(rti * 100).toFixed(1)}% exceeds 20% hard ceiling. ` +
        `Proposed repayment R${proposedRepayment.toFixed(0)} on verified income ` +
        `R${application.monthly_income_verified.toLocaleString()}. ` +
        `Reduce loan amount or extend term to bring RTI below ceiling.`
      );

      // Offer an alternative that DOES fit
      result.alternative = this.calculateAffordableLoan(
        application.monthly_income_verified,
        0.18, // 2% headroom
        application.loan_term_months,
        applicableRate
      );

      return await this.persistAssessment(application, result);
    }

    if (rti > AMBER_THRESHOLDS.rti_comfort_zone) {
      result.flags.push('RTI_AMBER');
      result.requires_human = true;
      result.rationale.push(
        `RTI of ${(rti * 100).toFixed(1)}% is within ceiling but above 15% comfort zone. ` +
        `Human review required to assess overall financial position.`
      );
    }

    // ═══════════════════════════════════════════════════════════
    // DTI POST-LOAN CHECK
    // ═══════════════════════════════════════════════════════════
    const monthlyObligations = application.monthly_obligations || 0;
    const dtiPre = monthlyObligations / application.monthly_income_verified;
    const dtiPost = (monthlyObligations + proposedRepayment) / application.monthly_income_verified;
    result.affordability.dti_pre = dtiPre;
    result.affordability.dti_post = dtiPost;
    result.affordability.disposable_income = application.monthly_income_verified - monthlyObligations - proposedRepayment;

    if (dtiPost > HARD_FLOORS.maximum_dti_full_procedure && application.segment !== 'gap_financing') {
      result.decision = 'DECLINE';
      result.traffic_light = 'red';
      result.ai_recommendation = 'decline';
      result.ai_confidence = 0.95;
      result.rationale.push(
        `Post-loan DTI of ${(dtiPost * 100).toFixed(1)}% exceeds 55% for full-procedure financing. ` +
        `Patient is over-extended. Lending here creates harm, not value.`
      );
      return await this.persistAssessment(application, result);
    }

    if (dtiPost > AMBER_THRESHOLDS.dti_review_threshold) {
      result.flags.push('DTI_AMBER');
      result.requires_human = true;
      result.rationale.push(
        `Post-loan DTI of ${(dtiPost * 100).toFixed(1)}% is elevated. ` +
        `Underwriter should assess stability of income and nature of obligations.`
      );
    }

    // ═══════════════════════════════════════════════════════════
    // BORROWER PROFILE CLASSIFICATION
    // ═══════════════════════════════════════════════════════════
    const profileResult = this.classifyBorrowerProfile(application);
    result.borrower_profile = profileResult.profile;
    result.rationale.push(
      `Borrower classified as "${profileResult.profile}" ` +
      `(convenience signals: ${profileResult.convenience_signals}, ` +
      `necessity signals: ${profileResult.necessity_signals}).`
    );

    // ═══════════════════════════════════════════════════════════
    // URGENCY-BASED CONTROLS
    // ═══════════════════════════════════════════════════════════
    if (application.urgency_classification === 'elective' &&
        application.loan_amount_requested > AMBER_THRESHOLDS.elective_cooling_off_amount) {
      result.conditions.push('COOLING_OFF_48HR');
      result.rationale.push(
        `Elective procedure above R15,000 — 48-hour cooling-off period applies. ` +
        `This filters impulsive borrowing while preserving patient choice.`
      );
    }

    if (profileResult.profile === 'urgent_necessity') {
      result.conditions.push('TIGHTER_CONTROLS');
      result.requires_human = true;
      result.rationale.push(
        `Urgent-necessity borrower profile detected. Apply tighter criteria: ` +
        `lower loan ceiling, shorter term, mandatory credit life insurance. ` +
        `Human review required — assess if patient has underlying capacity.`
      );
    }

    // ═══════════════════════════════════════════════════════════
    // RISK TIER ASSIGNMENT
    // ═══════════════════════════════════════════════════════════
    result.risk_tier = this.assignRiskTier(result, profileResult);

    // ═══════════════════════════════════════════════════════════
    // COMPOSITE RECOMMENDATION
    // ═══════════════════════════════════════════════════════════
    if (result.decision === null) {
      if (!result.requires_human && result.flags.length === 0) {
        result.decision = 'APPROVE';
        result.ai_recommendation = 'approve';
        result.ai_confidence = Math.min(0.95, 0.85 + (profileResult.convenience_signals * 0.02));
        result.traffic_light = 'green';
      } else if (result.requires_human) {
        result.decision = 'REFER_TO_HUMAN';
        result.ai_recommendation = profileResult.convenience_signals > profileResult.necessity_signals
          ? 'approve_with_conditions'
          : 'refer_to_human';
        result.ai_confidence = Math.max(0.1, Math.min(0.9,
          0.5 + (profileResult.convenience_signals * 0.05) - (profileResult.necessity_signals * 0.05)
        ));
        result.traffic_light = 'amber';
      } else {
        result.decision = 'APPROVE_WITH_CONDITIONS';
        result.ai_recommendation = 'approve_with_conditions';
        result.ai_confidence = 0.70;
        result.traffic_light = 'amber';
      }
    }

    return await this.persistAssessment(application, result);
  }

  /**
   * Classify borrower as convenience, planned_necessity, or urgent_necessity.
   */
  classifyBorrowerProfile(application) {
    let convenience_signals = 0;
    let necessity_signals = 0;
    const details = {};

    // Signal 1: Procedure type
    if (ELECTIVE_PROCEDURES.includes(application.procedure_type)) {
      convenience_signals += 2;
      details.procedure = 'elective (+2 convenience)';
    } else if (application.urgency_classification === 'urgent') {
      necessity_signals += 2;
      details.procedure = 'urgent (+2 necessity)';
    } else {
      details.procedure = 'neutral';
    }

    // Signal 2: Booking lead time
    if (application.booking_lead_days >= 14) {
      convenience_signals += 1;
      details.booking = 'planned_ahead (+1 convenience)';
    } else if (application.booking_lead_days !== undefined && application.booking_lead_days <= 2) {
      necessity_signals += 1;
      details.booking = 'same_day_or_next (+1 necessity)';
    } else {
      details.booking = 'neutral';
    }

    // Signal 3: Income-to-loan ratio
    const incomeToLoan = application.monthly_income_verified / application.loan_amount_requested;
    if (incomeToLoan >= 0.5) {
      convenience_signals += 1;
      details.income_ratio = 'could_pay_cash (+1 convenience)';
    } else if (incomeToLoan < 0.15) {
      necessity_signals += 1;
      details.income_ratio = 'large_relative_to_income (+1 necessity)';
    } else {
      details.income_ratio = 'neutral';
    }

    // Signal 4: Medical aid status
    if (application.medical_aid_covered > 0) {
      convenience_signals += 2;
      details.medical_aid = 'gap_financing (+2 convenience)';
    } else {
      details.medical_aid = 'no_medical_aid (neutral)';
    }

    // Signal 5: DTI pre-loan
    const dtiPre = (application.monthly_obligations || 0) / application.monthly_income_verified;
    if (dtiPre < 0.30) {
      convenience_signals += 1;
      details.dti = 'low_existing_debt (+1 convenience)';
    } else if (dtiPre > 0.50) {
      necessity_signals += 1;
      details.dti = 'already_stretched (+1 necessity)';
    } else {
      details.dti = 'neutral';
    }

    // Classify
    let profile;
    if (convenience_signals >= 4 && necessity_signals <= 1) {
      profile = 'convenience';
    } else if (necessity_signals >= 3) {
      profile = 'urgent_necessity';
    } else {
      profile = 'planned_necessity';
    }

    return {
      profile,
      convenience_signals,
      necessity_signals,
      details
    };
  }

  /**
   * Assign risk tier based on assessment results.
   */
  assignRiskTier(result, profileResult) {
    const { affordability, flags } = result;

    if (profileResult.profile === 'convenience' && flags.length === 0 && affordability.rti < 0.12) {
      return 'prime';
    }
    if (flags.length === 0 && affordability.rti <= 0.15 && affordability.dti_post <= 0.40) {
      return 'standard';
    }
    if (profileResult.profile === 'urgent_necessity' || flags.length >= 2) {
      return 'high_risk';
    }
    return 'cautious';
  }

  /**
   * Validate gap financing specifics.
   */
  validateGapFinancing(application) {
    const gapAmount = application.loan_amount_requested;

    if (gapAmount < HARD_FLOORS.minimum_gap_amount) {
      return {
        block: false,
        flag: 'GAP_AMOUNT_LOW',
        reason: `Gap amount of R${gapAmount.toLocaleString()} is below R2,000. Suggest patient pays cash — not worth the loan admin.`
      };
    }

    if (application.medical_aid_covered !== undefined && gapAmount > application.quoted_amount) {
      return {
        block: true,
        reason: `Gap amount R${gapAmount.toLocaleString()} exceeds quoted procedure cost R${application.quoted_amount.toLocaleString()}. Something is wrong — flagged for review.`
      };
    }

    return { block: false };
  }

  /**
   * Calculate monthly repayment using simple amortisation.
   */
  calculateMonthlyRepayment(principal, termMonths, annualRate) {
    if (annualRate === 0) return principal / termMonths;
    const monthlyRate = annualRate / 12;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  /**
   * Calculate the maximum affordable loan amount for a given RTI ceiling.
   */
  calculateAffordableLoan(monthlyIncome, maxRti, termMonths, annualRate) {
    const maxRepayment = monthlyIncome * maxRti;
    const monthlyRate = annualRate / 12;

    let maxLoan;
    if (annualRate === 0) {
      maxLoan = maxRepayment * termMonths;
    } else {
      maxLoan = maxRepayment * (Math.pow(1 + monthlyRate, termMonths) - 1) /
        (monthlyRate * Math.pow(1 + monthlyRate, termMonths));
    }

    return {
      max_loan_amount: Math.floor(maxLoan),
      max_monthly_repayment: Math.floor(maxRepayment),
      rti: maxRti,
      term_months: termMonths,
      rate: annualRate
    };
  }

  /**
   * Get applicable interest rate (base + verification adjustment).
   */
  getApplicableRate(application) {
    const adjustment = VERIFICATION_RATE_ADJUSTMENTS[application.income_verification] || VERIFICATION_RATE_ADJUSTMENTS.manual_verified;
    return BASE_RATE + adjustment;
  }

  /**
   * Persist the assessment to the database.
   */
  async persistAssessment(application, result) {
    try {
      const res = await query(
        `INSERT INTO loan_risk_assessments
         (application_id, patient_id, provider_id,
          procedure_type, procedure_description, quoted_amount,
          medical_aid_covered, loan_amount_requested, loan_term_months,
          urgency_classification, booking_lead_days,
          monthly_income_verified, monthly_obligations, disposable_income,
          repayment_to_income, debt_to_income_pre, debt_to_income_post,
          proposed_monthly_repayment, segment, borrower_profile,
          income_verification, risk_tier,
          ai_recommendation, ai_confidence, ai_rationale, ai_flags, ai_conditions,
          alternative_offer, traffic_light, cooling_off_required, cooling_off_expires,
          gate_2_result)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
         RETURNING assessment_id`,
        [
          application.application_id || null,
          application.patient_id,
          application.provider_id || null,
          application.procedure_type || null,
          application.procedure_description || null,
          application.quoted_amount || application.loan_amount_requested,
          application.medical_aid_covered || 0,
          application.loan_amount_requested,
          application.loan_term_months,
          application.urgency_classification || 'planned',
          application.booking_lead_days || null,
          application.monthly_income_verified,
          application.monthly_obligations || 0,
          result.affordability.disposable_income || null,
          result.affordability.rti || null,
          result.affordability.dti_pre || null,
          result.affordability.dti_post || null,
          result.affordability.proposed_monthly_repayment || null,
          application.segment || null,
          result.borrower_profile,
          application.income_verification || 'manual_verified',
          result.risk_tier,
          result.ai_recommendation || result.decision,
          result.ai_confidence,
          JSON.stringify(result.rationale),
          JSON.stringify(result.flags),
          JSON.stringify(result.conditions),
          result.alternative ? JSON.stringify(result.alternative) : null,
          result.traffic_light,
          result.conditions.includes('COOLING_OFF_48HR'),
          result.conditions.includes('COOLING_OFF_48HR')
            ? new Date(Date.now() + 48 * 60 * 60 * 1000)
            : null,
          JSON.stringify(result)
        ]
      );
      result.assessment_id = res.rows[0]?.assessment_id;
    } catch (err) {
      console.error('Failed to persist loan risk assessment:', err.message);
    }

    return result;
  }

  /**
   * Update borrower profile record.
   */
  async upsertBorrowerProfile(patientId, profileResult) {
    await query(
      `INSERT INTO borrower_profiles (patient_id, borrower_profile, convenience_signals, necessity_signals, signal_details)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (patient_id) DO UPDATE SET
         borrower_profile = $2,
         convenience_signals = $3,
         necessity_signals = $4,
         signal_details = $5,
         updated_at = NOW()`,
      [
        patientId,
        profileResult.profile,
        profileResult.convenience_signals,
        profileResult.necessity_signals,
        JSON.stringify(profileResult.details)
      ]
    );
  }

  /**
   * Get human review queue — applications awaiting human decision.
   */
  async getHumanReviewQueue(limit = 50) {
    const result = await query(
      `SELECT lra.*,
              u.full_name AS patient_name,
              u.email AS patient_email,
              p.provider_name,
              p.trust_tier AS provider_tier,
              p.risk_score AS provider_risk_score
       FROM loan_risk_assessments lra
       JOIN users u ON lra.patient_id = u.user_id
       LEFT JOIN providers p ON lra.provider_id = p.provider_id
       WHERE lra.ai_recommendation IN ('refer_to_human', 'approve_with_conditions')
         AND lra.human_decision IS NULL
       ORDER BY lra.created_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Record human decision on an assessment.
   */
  async recordHumanDecision(assessmentId, decision, decidedBy, reason) {
    const result = await query(
      `UPDATE loan_risk_assessments
       SET human_decision = $2,
           human_decision_by = $3,
           human_decision_at = NOW(),
           human_decision_reason = $4,
           updated_at = NOW()
       WHERE assessment_id = $1
       RETURNING *`,
      [assessmentId, decision, decidedBy, reason]
    );
    return result.rows[0];
  }
}

const patientGateService = new PatientGateService();

module.exports = { PatientGateService, patientGateService, HARD_FLOORS, AMBER_THRESHOLDS };
