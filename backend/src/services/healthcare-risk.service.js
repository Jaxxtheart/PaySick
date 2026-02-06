/**
 * HEALTHCARE RISK ASSESSMENT SERVICE
 *
 * Proprietary PD (Probability of Default) & LGD (Loss Given Default) models
 * specifically designed for healthcare financing.
 *
 * KEY INSIGHT: Healthcare financing has fundamentally different risk characteristics
 * than retail BNPL - patients finance essential procedures, not impulse purchases.
 *
 * DATA SOURCES:
 * - Medical Aid Claims History (Discovery, Bonitas, Momentum)
 * - Chronic Medication Adherence (Pharmacy records)
 * - Healthcare Payment History (PaySick internal)
 * - Medical Credit Bureau (MedCredits SA)
 * - ICD-10 Procedure Risk Profiles
 * - Provider Network Performance
 */

const { query, transaction } = require('../config/database');
const EventEmitter = require('events');

class HealthcareRiskService extends EventEmitter {
  constructor() {
    super();
    this.MODEL_VERSION = 'v1.0';

    // Default weights for components (can be overridden from database)
    this.PD_WEIGHTS = {
      healthScore: 0.25,
      procedureRisk: 0.20,
      affordability: 0.25,
      providerPerformance: 0.15,
      behavioralSignals: 0.15
    };

    this.LGD_WEIGHTS = {
      medicalAidRecovery: 0.30,
      familySupport: 0.20,
      procedureValue: 0.25,
      providerRecovery: 0.25
    };
  }

  /**
   * MAIN ENTRY POINT: Calculate comprehensive risk assessment
   * Called during onboarding/application process
   */
  async calculateRiskAssessment(params) {
    const {
      userId,
      applicationId,
      loanAmount,
      procedureType,
      icd10Code,
      providerId,
      monthlyIncome,
      existingDebt,
      medicalAidScheme,
      medicalAidOption,
      hasChronicConditions,
      applicationBehavior
    } = params;

    // Get or create patient health score
    const healthScore = await this.getOrCreateHealthScore(userId, {
      medicalAidScheme,
      medicalAidOption,
      hasChronicConditions
    });

    // Get procedure risk profile
    const procedureRisk = await this.getProcedureRiskProfile(procedureType, icd10Code);

    // Calculate affordability
    const affordability = await this.calculateHealthcareAffordability(userId, {
      monthlyIncome,
      existingDebt,
      loanAmount,
      medicalAidPremium: medicalAidScheme ? await this.estimateMedicalAidPremium(medicalAidScheme, medicalAidOption) : 0
    });

    // Get provider performance data
    const providerPerformance = await this.getProviderPerformance(providerId);

    // Analyze application behavior signals
    const behavioralScore = this.analyzeBehavioralSignals(applicationBehavior);

    // Calculate PD (Probability of Default)
    const pdResult = this.calculatePD({
      healthScore: healthScore.health_payment_score,
      procedureRisk: procedureRisk.base_pd_risk,
      affordabilityScore: affordability.affordability_score,
      providerScore: providerPerformance.performance_score,
      behavioralScore
    });

    // Calculate LGD (Loss Given Default)
    const lgdResult = this.calculateLGD({
      hasMedicalAid: !!medicalAidScheme,
      medicalAidTier: this.getMedicalAidTier(medicalAidScheme, medicalAidOption),
      procedureNecessity: procedureRisk.necessity_score,
      providerNetwork: providerPerformance.is_network_partner,
      familySupportIndicator: healthScore.family_support_indicator || 0.5
    });

    // Calculate Expected Loss
    const exposureAtDefault = loanAmount;
    const expectedLoss = pdResult.pd_score * lgdResult.lgd_score * exposureAtDefault;
    const expectedLossRate = pdResult.pd_score * lgdResult.lgd_score;

    // Make risk decision
    const riskDecision = this.makeRiskDecision(pdResult.pd_score, lgdResult.lgd_score, expectedLossRate);

    // Calculate risk-adjusted pricing
    const riskAdjustedPricing = this.calculateRiskAdjustedPricing(pdResult.pd_score, lgdResult.lgd_score);

    // Determine recommended term based on risk
    const recommendedTerm = this.getRecommendedTerm(pdResult.pd_score, loanAmount);

    // Calculate max approved amount based on affordability and risk
    const maxApprovedAmount = this.calculateMaxApprovedAmount(
      affordability.max_loan_amount,
      pdResult.pd_score
    );

    // Store the risk assessment
    const assessment = await this.storeRiskAssessment({
      applicationId,
      userId,

      // PD
      pdScore: pdResult.pd_score,
      pdBand: pdResult.pd_band,
      pdHealthScoreComponent: pdResult.components.healthScore,
      pdProcedureRiskComponent: pdResult.components.procedureRisk,
      pdAffordabilityComponent: pdResult.components.affordability,
      pdProviderComponent: pdResult.components.provider,
      pdBehavioralComponent: pdResult.components.behavioral,

      // LGD
      lgdScore: lgdResult.lgd_score,
      lgdBand: lgdResult.lgd_band,
      lgdCollateralComponent: lgdResult.components.medicalAidRecovery,
      lgdFamilySupportComponent: lgdResult.components.familySupport,
      lgdProcedureValueComponent: lgdResult.components.procedureValue,
      lgdProviderRecoveryComponent: lgdResult.components.providerRecovery,

      // Expected Loss
      exposureAtDefault,
      expectedLoss,
      expectedLossRate,

      // Decision
      riskDecision: riskDecision.decision,
      riskAdjustedPricing,
      recommendedTermMonths: recommendedTerm,
      maxApprovedAmount,

      modelVersion: this.MODEL_VERSION,
      modelConfidence: this.calculateModelConfidence(healthScore, procedureRisk)
    });

    this.emit('assessment:completed', {
      assessmentId: assessment.assessment_id,
      applicationId,
      decision: riskDecision.decision
    });

    return {
      assessmentId: assessment.assessment_id,
      pd: {
        score: pdResult.pd_score,
        band: pdResult.pd_band,
        components: pdResult.components
      },
      lgd: {
        score: lgdResult.lgd_score,
        band: lgdResult.lgd_band,
        components: lgdResult.components
      },
      expectedLoss: {
        exposure: exposureAtDefault,
        amount: expectedLoss,
        rate: expectedLossRate
      },
      decision: riskDecision,
      pricing: {
        baseRate: 0.18, // 18% base
        riskPremium: riskAdjustedPricing - 0.18,
        finalRate: riskAdjustedPricing
      },
      terms: {
        recommendedTerm,
        maxAmount: maxApprovedAmount
      },
      healthScore: healthScore.health_payment_score,
      affordability: affordability.affordability_band
    };
  }

  /**
   * Get or create patient health score (Healthcare Bureau Score)
   */
  async getOrCreateHealthScore(userId, params = {}) {
    const { medicalAidScheme, medicalAidOption, hasChronicConditions } = params;

    // Check for existing score
    const existing = await query(
      'SELECT * FROM patient_health_scores WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) {
      const score = existing.rows[0];

      // Check if score is stale (older than 30 days)
      const scoreAge = Date.now() - new Date(score.score_calculated_at).getTime();
      if (scoreAge < 30 * 24 * 60 * 60 * 1000) {
        return score;
      }
    }

    // Calculate new health score from available data sources
    const componentScores = await this.fetchHealthDataSources(userId, params);

    // Calculate overall health payment score
    const healthPaymentScore = this.calculateHealthPaymentScore(componentScores);
    const scoreBand = this.getHealthScoreBand(healthPaymentScore);

    // Upsert the health score
    const result = await query(
      `INSERT INTO patient_health_scores (
        user_id,
        health_payment_score,
        score_band,
        medical_aid_score,
        medication_adherence_score,
        provider_payment_score,
        procedure_outcome_score,
        healthcare_utilization_score,
        chronic_conditions_count,
        active_medical_aid,
        medical_aid_scheme,
        medical_aid_option,
        data_consent_given,
        consent_date,
        score_calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        health_payment_score = EXCLUDED.health_payment_score,
        score_band = EXCLUDED.score_band,
        medical_aid_score = EXCLUDED.medical_aid_score,
        medication_adherence_score = EXCLUDED.medication_adherence_score,
        provider_payment_score = EXCLUDED.provider_payment_score,
        procedure_outcome_score = EXCLUDED.procedure_outcome_score,
        healthcare_utilization_score = EXCLUDED.healthcare_utilization_score,
        chronic_conditions_count = EXCLUDED.chronic_conditions_count,
        active_medical_aid = EXCLUDED.active_medical_aid,
        medical_aid_scheme = EXCLUDED.medical_aid_scheme,
        medical_aid_option = EXCLUDED.medical_aid_option,
        score_calculated_at = NOW(),
        updated_at = NOW()
      RETURNING *`,
      [
        userId,
        healthPaymentScore,
        scoreBand,
        componentScores.medicalAid,
        componentScores.medicationAdherence,
        componentScores.providerPayment,
        componentScores.procedureOutcome,
        componentScores.healthcareUtilization,
        hasChronicConditions ? 1 : 0,
        !!medicalAidScheme,
        medicalAidScheme || null,
        medicalAidOption || null
      ]
    );

    return result.rows[0];
  }

  /**
   * Fetch data from healthcare data sources
   * In production, these would be actual API calls to:
   * - Medical aid schemes (Discovery, Bonitas, Momentum)
   * - MedCredits (medical credit bureau)
   * - Pharmacy dispensing records
   */
  async fetchHealthDataSources(userId, params) {
    const { medicalAidScheme, hasChronicConditions } = params;

    // Get PaySick internal payment history
    const internalHistory = await this.getInternalPaymentHistory(userId);

    // Simulate fetching from external sources
    // In production, replace with actual API integrations

    // Medical Aid Score (based on claims history, coverage status)
    const medicalAidScore = medicalAidScheme
      ? await this.simulateMedicalAidScore(medicalAidScheme)
      : 40; // Lower score for uninsured

    // Medication Adherence (chronic medication pickup consistency)
    const medicationAdherenceScore = hasChronicConditions
      ? await this.simulateMedicationAdherence()
      : 70; // Neutral for non-chronic patients

    // Provider Payment History (from PaySick data)
    const providerPaymentScore = internalHistory.paymentScore;

    // Procedure Outcome Score (historical procedure success)
    const procedureOutcomeScore = 65; // Default - would come from claims data

    // Healthcare Utilization (frequency and pattern)
    const healthcareUtilizationScore = 60; // Default - would come from claims data

    return {
      medicalAid: medicalAidScore,
      medicationAdherence: medicationAdherenceScore,
      providerPayment: providerPaymentScore,
      procedureOutcome: procedureOutcomeScore,
      healthcareUtilization: healthcareUtilizationScore
    };
  }

  /**
   * Get internal PaySick payment history for user
   */
  async getInternalPaymentHistory(userId) {
    const result = await query(
      `SELECT
        COUNT(*) AS total_payments,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_on_time,
        COUNT(CASE WHEN status IN ('overdue', 'failed') THEN 1 END) AS late_payments,
        COALESCE(AVG(CASE WHEN status = 'paid' THEN
          EXTRACT(DAY FROM payment_date - due_date)
        END), 0) AS avg_days_early_late
      FROM payments
      WHERE user_id = $1`,
      [userId]
    );

    const stats = result.rows[0];

    if (parseInt(stats.total_payments) === 0) {
      // New customer - neutral score
      return { paymentScore: 50, isNew: true };
    }

    const paidRatio = parseInt(stats.paid_on_time) / parseInt(stats.total_payments);
    const avgDaysLate = parseFloat(stats.avg_days_early_late);

    // Calculate score (0-100)
    let score = 50; // Base
    score += paidRatio * 40; // Up to 40 points for on-time payments
    score -= Math.min(avgDaysLate, 10) * 2; // Penalty for late payments
    score += parseInt(stats.total_payments) > 3 ? 10 : 0; // Bonus for history

    return {
      paymentScore: Math.max(0, Math.min(100, Math.round(score))),
      isNew: false,
      stats
    };
  }

  /**
   * Simulate medical aid score fetch
   * In production: Integration with Discovery/Bonitas/Momentum APIs
   */
  async simulateMedicalAidScore(scheme) {
    // Different schemes have different claim patterns
    const schemeScores = {
      'discovery': 75,
      'bonitas': 70,
      'momentum': 70,
      'gems': 72,
      'medihelp': 68,
      'fedhealth': 67,
      'other': 60
    };

    const schemeLower = scheme.toLowerCase();
    for (const [key, score] of Object.entries(schemeScores)) {
      if (schemeLower.includes(key)) {
        return score + Math.floor(Math.random() * 15); // Add some variance
      }
    }
    return schemeScores.other;
  }

  /**
   * Simulate medication adherence score
   * In production: Integration with pharmacy dispensing records
   */
  async simulateMedicationAdherence() {
    // Would check prescription pickup consistency
    // Higher score = consistent medication pickup = responsible patient
    return 55 + Math.floor(Math.random() * 30);
  }

  /**
   * Get procedure risk profile from ICD-10 code or procedure type
   */
  async getProcedureRiskProfile(procedureType, icd10Code) {
    let result;

    if (icd10Code) {
      result = await query(
        `SELECT * FROM procedure_risk_weights
         WHERE icd10_code = $1 AND status = 'active'`,
        [icd10Code]
      );
    }

    if (!result?.rows?.length && procedureType) {
      result = await query(
        `SELECT * FROM procedure_risk_weights
         WHERE LOWER(procedure_name) LIKE LOWER($1) AND status = 'active'`,
        [`%${procedureType}%`]
      );
    }

    if (result?.rows?.length > 0) {
      const risk = result.rows[0];
      return {
        base_pd_risk: risk.base_pd_risk,
        base_lgd_risk: risk.base_lgd_risk,
        typical_amount_min: risk.typical_amount_min,
        typical_amount_max: risk.typical_amount_max,
        recovery_time_days: risk.recovery_time_days || 0,
        success_rate: risk.success_rate || 90,
        necessity_score: this.calculateNecessityScore(risk)
      };
    }

    // Default risk for unknown procedures
    return {
      base_pd_risk: 50,
      base_lgd_risk: 50,
      typical_amount_min: 5000,
      typical_amount_max: 50000,
      recovery_time_days: 14,
      success_rate: 90,
      necessity_score: 0.6
    };
  }

  /**
   * Calculate how necessary/essential the procedure is
   * Essential procedures have better repayment rates
   */
  calculateNecessityScore(riskProfile) {
    // Factors that increase necessity:
    // - Emergency factor > 1
    // - Lower typical amounts (basic care)
    // - Categories like maternity, oncology

    let score = 0.5; // Base

    if (riskProfile.emergency_factor > 1) {
      score += 0.2;
    }

    if (riskProfile.icd10_category) {
      const essentialCategories = ['oncology', 'cardiovascular', 'obstetrics'];
      if (essentialCategories.some(c =>
        riskProfile.icd10_category.toLowerCase().includes(c)
      )) {
        score += 0.15;
      }
    }

    return Math.min(1, score);
  }

  /**
   * Get provider performance metrics
   */
  async getProviderPerformance(providerId) {
    if (!providerId) {
      return {
        performance_score: 50,
        is_network_partner: false,
        default_rate: 0.05
      };
    }

    const result = await query(
      `SELECT
        p.network_partner,
        p.partnership_tier,
        COUNT(DISTINCT a.application_id) AS total_applications,
        COUNT(DISTINCT CASE WHEN pp.status = 'completed' THEN pp.plan_id END) AS completed_plans,
        COUNT(DISTINCT CASE WHEN pp.status = 'defaulted' THEN pp.plan_id END) AS defaulted_plans
      FROM providers p
      LEFT JOIN applications a ON p.provider_id = a.provider_id
      LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
      WHERE p.provider_id = $1
      GROUP BY p.provider_id, p.network_partner, p.partnership_tier`,
      [providerId]
    );

    if (result.rows.length === 0) {
      return {
        performance_score: 50,
        is_network_partner: false,
        default_rate: 0.05
      };
    }

    const data = result.rows[0];
    const totalPlans = parseInt(data.completed_plans) + parseInt(data.defaulted_plans);
    const defaultRate = totalPlans > 0
      ? parseInt(data.defaulted_plans) / totalPlans
      : 0.05;

    // Calculate performance score
    let score = 50;

    // Network partners get bonus
    if (data.network_partner) {
      score += 15;
      if (data.partnership_tier === 'platinum') score += 10;
      else if (data.partnership_tier === 'gold') score += 7;
      else if (data.partnership_tier === 'silver') score += 4;
    }

    // Adjust based on default rate
    if (defaultRate < 0.02) score += 15;
    else if (defaultRate < 0.05) score += 10;
    else if (defaultRate > 0.10) score -= 15;

    // Volume bonus
    if (totalPlans > 50) score += 10;
    else if (totalPlans > 20) score += 5;

    return {
      performance_score: Math.max(0, Math.min(100, score)),
      is_network_partner: data.network_partner,
      partnership_tier: data.partnership_tier,
      default_rate: defaultRate
    };
  }

  /**
   * Analyze behavioral signals from application process
   */
  analyzeBehavioralSignals(behavior = {}) {
    const {
      completionTimeSeconds = 180,
      applicationHour = 12,
      deviceType = 'desktop',
      locationConsistent = true,
      formEditsCount = 2
    } = behavior;

    let score = 60; // Base score

    // Application completion time (too fast = suspicious, too slow = hesitant)
    if (completionTimeSeconds < 60) score -= 15; // Too fast
    else if (completionTimeSeconds > 600) score -= 10; // Too slow
    else if (completionTimeSeconds >= 120 && completionTimeSeconds <= 300) score += 10;

    // Application hour (business hours = more reliable)
    if (applicationHour >= 9 && applicationHour <= 17) score += 5;
    else if (applicationHour >= 0 && applicationHour <= 5) score -= 10; // Late night

    // Device consistency
    if (deviceType === 'mobile') score += 5; // Mobile users tend to be more genuine

    // Location consistency
    if (locationConsistent) score += 5;
    else score -= 10;

    // Form edits (some edits = careful, too many = uncertain)
    if (formEditsCount >= 1 && formEditsCount <= 4) score += 5;
    else if (formEditsCount > 10) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate healthcare-specific affordability
   */
  async calculateHealthcareAffordability(userId, params) {
    const {
      monthlyIncome,
      existingDebt,
      loanAmount,
      medicalAidPremium = 0
    } = params;

    const monthlyDebtObligations = existingDebt || 0;

    // Healthcare-specific DTI (includes medical aid premium)
    const healthcareDTI = monthlyIncome > 0
      ? (monthlyDebtObligations + medicalAidPremium) / monthlyIncome
      : 1;

    // Disposable income after obligations
    const disposableIncome = monthlyIncome - monthlyDebtObligations - medicalAidPremium;

    // Healthcare capacity (30% of disposable income)
    const healthcareCapacity = Math.max(0, disposableIncome * 0.30);

    // Max monthly payment based on capacity
    const maxMonthlyPayment = healthcareCapacity;

    // Max loan amount (assuming 3-month term, 20% interest)
    const maxLoanAmount = maxMonthlyPayment * 3 * 0.85; // 85% to account for interest

    // Calculate affordability band
    const requestedMonthlyPayment = loanAmount / 3;
    let affordabilityBand;
    let affordabilityScore;

    if (requestedMonthlyPayment <= healthcareCapacity * 0.5) {
      affordabilityBand = 'high';
      affordabilityScore = 85;
    } else if (requestedMonthlyPayment <= healthcareCapacity * 0.75) {
      affordabilityBand = 'medium';
      affordabilityScore = 65;
    } else if (requestedMonthlyPayment <= healthcareCapacity) {
      affordabilityBand = 'low';
      affordabilityScore = 45;
    } else {
      affordabilityBand = 'insufficient';
      affordabilityScore = 20;
    }

    // Store affordability assessment
    await query(
      `INSERT INTO healthcare_affordability (
        user_id,
        declared_income,
        monthly_debt_obligations,
        medical_aid_premium,
        healthcare_dti,
        total_dti,
        disposable_income,
        healthcare_capacity,
        affordability_band,
        max_monthly_payment,
        max_loan_amount,
        assessed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        declared_income = EXCLUDED.declared_income,
        monthly_debt_obligations = EXCLUDED.monthly_debt_obligations,
        medical_aid_premium = EXCLUDED.medical_aid_premium,
        healthcare_dti = EXCLUDED.healthcare_dti,
        total_dti = EXCLUDED.total_dti,
        disposable_income = EXCLUDED.disposable_income,
        healthcare_capacity = EXCLUDED.healthcare_capacity,
        affordability_band = EXCLUDED.affordability_band,
        max_monthly_payment = EXCLUDED.max_monthly_payment,
        max_loan_amount = EXCLUDED.max_loan_amount,
        assessed_at = NOW(),
        updated_at = NOW()`,
      [
        userId,
        monthlyIncome,
        monthlyDebtObligations,
        medicalAidPremium,
        healthcareDTI,
        healthcareDTI, // Same for now
        disposableIncome,
        healthcareCapacity,
        affordabilityBand,
        maxMonthlyPayment,
        maxLoanAmount
      ]
    );

    return {
      healthcare_dti: healthcareDTI,
      disposable_income: disposableIncome,
      healthcare_capacity: healthcareCapacity,
      affordability_band: affordabilityBand,
      affordability_score: affordabilityScore,
      max_monthly_payment: maxMonthlyPayment,
      max_loan_amount: maxLoanAmount
    };
  }

  /**
   * Estimate medical aid premium for affordability calculation
   */
  async estimateMedicalAidPremium(scheme, option) {
    // Rough estimates by scheme tier
    const premiumEstimates = {
      'comprehensive': 4500,
      'classic': 3000,
      'essential': 2000,
      'smart': 1500,
      'basic': 1000
    };

    const optionLower = (option || 'essential').toLowerCase();
    for (const [tier, premium] of Object.entries(premiumEstimates)) {
      if (optionLower.includes(tier)) {
        return premium;
      }
    }
    return 2000; // Default estimate
  }

  /**
   * Calculate Probability of Default (PD)
   */
  calculatePD(scores) {
    const {
      healthScore = 50,
      procedureRisk = 50,
      affordabilityScore = 50,
      providerScore = 50,
      behavioralScore = 50
    } = scores;

    // Normalize scores to 0-1 range (inverted - higher score = lower risk)
    const healthComponent = (100 - healthScore) / 100 * this.PD_WEIGHTS.healthScore;
    const procedureComponent = procedureRisk / 100 * this.PD_WEIGHTS.procedureRisk;
    const affordabilityComponent = (100 - affordabilityScore) / 100 * this.PD_WEIGHTS.affordability;
    const providerComponent = (100 - providerScore) / 100 * this.PD_WEIGHTS.providerPerformance;
    const behavioralComponent = (100 - behavioralScore) / 100 * this.PD_WEIGHTS.behavioralSignals;

    // Sum components to get PD
    const pdRaw = healthComponent + procedureComponent + affordabilityComponent +
                  providerComponent + behavioralComponent;

    // Apply calibration to get to target PD range (0.5% - 15%)
    // Our target average is 3.2% based on investor deck
    const pdScore = Math.max(0.005, Math.min(0.15, pdRaw * 0.15));

    return {
      pd_score: Math.round(pdScore * 10000) / 10000,
      pd_band: this.getPDBand(pdScore),
      components: {
        healthScore: Math.round(healthComponent * 10000) / 10000,
        procedureRisk: Math.round(procedureComponent * 10000) / 10000,
        affordability: Math.round(affordabilityComponent * 10000) / 10000,
        provider: Math.round(providerComponent * 10000) / 10000,
        behavioral: Math.round(behavioralComponent * 10000) / 10000
      }
    };
  }

  /**
   * Calculate Loss Given Default (LGD)
   */
  calculateLGD(params) {
    const {
      hasMedicalAid = false,
      medicalAidTier = 'none',
      procedureNecessity = 0.5,
      providerNetwork = false,
      familySupportIndicator = 0.5
    } = params;

    // Medical Aid Recovery Potential (can recover from scheme)
    let medicalAidRecovery;
    if (!hasMedicalAid) {
      medicalAidRecovery = 0.8; // 80% LGD component - no medical aid recovery
    } else if (medicalAidTier === 'comprehensive') {
      medicalAidRecovery = 0.2; // Strong recovery potential
    } else if (medicalAidTier === 'classic') {
      medicalAidRecovery = 0.35;
    } else {
      medicalAidRecovery = 0.5;
    }

    // Family Support (medical debt attracts family payment)
    // Higher necessity = more family support
    const familySupportLGD = 1 - (familySupportIndicator * procedureNecessity);

    // Procedure Value Retention (essential procedures = better payment)
    const procedureValueLGD = 1 - procedureNecessity;

    // Provider Recovery (network partners assist with collections)
    const providerRecoveryLGD = providerNetwork ? 0.3 : 0.6;

    // Calculate weighted LGD
    const lgdRaw =
      medicalAidRecovery * this.LGD_WEIGHTS.medicalAidRecovery +
      familySupportLGD * this.LGD_WEIGHTS.familySupport +
      procedureValueLGD * this.LGD_WEIGHTS.procedureValue +
      providerRecoveryLGD * this.LGD_WEIGHTS.providerRecovery;

    // Calibrate to target range (20% - 70%)
    // Target average is 45% based on investor deck
    const lgdScore = Math.max(0.20, Math.min(0.70, lgdRaw));

    return {
      lgd_score: Math.round(lgdScore * 10000) / 10000,
      lgd_band: this.getLGDBand(lgdScore),
      components: {
        medicalAidRecovery: Math.round(medicalAidRecovery * this.LGD_WEIGHTS.medicalAidRecovery * 10000) / 10000,
        familySupport: Math.round(familySupportLGD * this.LGD_WEIGHTS.familySupport * 10000) / 10000,
        procedureValue: Math.round(procedureValueLGD * this.LGD_WEIGHTS.procedureValue * 10000) / 10000,
        providerRecovery: Math.round(providerRecoveryLGD * this.LGD_WEIGHTS.providerRecovery * 10000) / 10000
      }
    };
  }

  /**
   * Get medical aid tier from scheme and option
   */
  getMedicalAidTier(scheme, option) {
    if (!scheme) return 'none';

    const optionLower = (option || '').toLowerCase();

    if (optionLower.includes('comprehensive') || optionLower.includes('executive')) {
      return 'comprehensive';
    } else if (optionLower.includes('classic') || optionLower.includes('priority')) {
      return 'classic';
    } else if (optionLower.includes('essential') || optionLower.includes('smart')) {
      return 'essential';
    }

    return 'basic';
  }

  /**
   * Make risk decision based on PD and LGD
   */
  makeRiskDecision(pdScore, lgdScore, expectedLossRate) {
    // Decision thresholds
    if (expectedLossRate <= 0.01) {
      return {
        decision: 'approve',
        reason: 'Low expected loss rate',
        confidence: 0.95
      };
    } else if (expectedLossRate <= 0.025) {
      return {
        decision: 'approve',
        reason: 'Acceptable expected loss within risk appetite',
        confidence: 0.85
      };
    } else if (expectedLossRate <= 0.05) {
      return {
        decision: 'review',
        reason: 'Elevated risk - manual review recommended',
        confidence: 0.70
      };
    } else {
      return {
        decision: 'decline',
        reason: 'Expected loss exceeds risk appetite',
        confidence: 0.90
      };
    }
  }

  /**
   * Calculate risk-adjusted pricing (interest rate)
   */
  calculateRiskAdjustedPricing(pdScore, lgdScore) {
    const baseRate = 0.18; // 18% base rate
    const riskFreeRate = 0.08; // SA prime-ish

    // Risk premium based on expected loss
    const expectedLoss = pdScore * lgdScore;
    const riskPremium = expectedLoss * 2; // 2x coverage ratio

    // Capital charge (regulatory)
    const capitalCharge = 0.02;

    // Target return
    const targetReturn = 0.03;

    const finalRate = riskFreeRate + riskPremium + capitalCharge + targetReturn;

    // Cap between 15% and 28% (NCA limits)
    return Math.max(0.15, Math.min(0.28, finalRate));
  }

  /**
   * Get recommended payment term based on risk
   */
  getRecommendedTerm(pdScore, loanAmount) {
    // Lower risk = can offer longer terms
    // Higher amounts = may need longer terms

    if (pdScore <= 0.03) {
      return loanAmount > 10000 ? 6 : 3;
    } else if (pdScore <= 0.05) {
      return loanAmount > 15000 ? 4 : 3;
    } else {
      return 3; // Minimum term for higher risk
    }
  }

  /**
   * Calculate maximum approved amount based on affordability and risk
   */
  calculateMaxApprovedAmount(affordabilityMax, pdScore) {
    // Reduce max amount based on risk
    let riskMultiplier = 1;

    if (pdScore <= 0.03) {
      riskMultiplier = 1.0;
    } else if (pdScore <= 0.05) {
      riskMultiplier = 0.85;
    } else if (pdScore <= 0.08) {
      riskMultiplier = 0.70;
    } else {
      riskMultiplier = 0.50;
    }

    return Math.round(affordabilityMax * riskMultiplier);
  }

  /**
   * Calculate model confidence based on data quality
   */
  calculateModelConfidence(healthScore, procedureRisk) {
    let confidence = 0.5; // Base

    // More data sources = higher confidence
    if (healthScore.medical_aid_score) confidence += 0.1;
    if (healthScore.medication_adherence_score) confidence += 0.1;
    if (healthScore.provider_payment_score) confidence += 0.15;

    // Known procedure = higher confidence
    if (procedureRisk.icd10_code) confidence += 0.15;

    return Math.min(0.95, confidence);
  }

  /**
   * Calculate overall health payment score from components
   */
  calculateHealthPaymentScore(components) {
    const weights = {
      medicalAid: 0.25,
      medicationAdherence: 0.15,
      providerPayment: 0.30,
      procedureOutcome: 0.15,
      healthcareUtilization: 0.15
    };

    const score =
      (components.medicalAid || 50) * weights.medicalAid +
      (components.medicationAdherence || 50) * weights.medicationAdherence +
      (components.providerPayment || 50) * weights.providerPayment +
      (components.procedureOutcome || 50) * weights.procedureOutcome +
      (components.healthcareUtilization || 50) * weights.healthcareUtilization;

    return Math.round(score);
  }

  /**
   * Band classification helpers
   */
  getPDBand(pdScore) {
    if (pdScore <= 0.02) return 'very_low';
    if (pdScore <= 0.05) return 'low';
    if (pdScore <= 0.10) return 'medium';
    if (pdScore <= 0.20) return 'high';
    return 'very_high';
  }

  getLGDBand(lgdScore) {
    if (lgdScore <= 0.20) return 'very_low';
    if (lgdScore <= 0.35) return 'low';
    if (lgdScore <= 0.50) return 'medium';
    if (lgdScore <= 0.70) return 'high';
    return 'very_high';
  }

  getHealthScoreBand(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Store risk assessment in database
   */
  async storeRiskAssessment(assessment) {
    const result = await query(
      `INSERT INTO healthcare_risk_assessments (
        application_id,
        user_id,
        pd_score,
        pd_band,
        pd_health_score_component,
        pd_procedure_risk_component,
        pd_affordability_component,
        pd_provider_component,
        pd_behavioral_component,
        lgd_score,
        lgd_band,
        lgd_collateral_component,
        lgd_family_support_component,
        lgd_procedure_value_component,
        lgd_provider_recovery_component,
        exposure_at_default,
        expected_loss,
        expected_loss_rate,
        risk_decision,
        risk_adjusted_pricing,
        recommended_term_months,
        max_approved_amount,
        model_version,
        model_confidence
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      ) RETURNING *`,
      [
        assessment.applicationId,
        assessment.userId,
        assessment.pdScore,
        assessment.pdBand,
        assessment.pdHealthScoreComponent,
        assessment.pdProcedureRiskComponent,
        assessment.pdAffordabilityComponent,
        assessment.pdProviderComponent,
        assessment.pdBehavioralComponent,
        assessment.lgdScore,
        assessment.lgdBand,
        assessment.lgdCollateralComponent,
        assessment.lgdFamilySupportComponent,
        assessment.lgdProcedureValueComponent,
        assessment.lgdProviderRecoveryComponent,
        assessment.exposureAtDefault,
        assessment.expectedLoss,
        assessment.expectedLossRate,
        assessment.riskDecision,
        assessment.riskAdjustedPricing,
        assessment.recommendedTermMonths,
        assessment.maxApprovedAmount,
        assessment.modelVersion,
        assessment.modelConfidence
      ]
    );

    return result.rows[0];
  }

  /**
   * Get risk assessment for an application
   */
  async getRiskAssessment(applicationId) {
    const result = await query(
      'SELECT * FROM healthcare_risk_assessments WHERE application_id = $1',
      [applicationId]
    );
    return result.rows[0];
  }

  /**
   * Get portfolio risk summary for admin dashboard
   */
  async getPortfolioRiskSummary() {
    const result = await query(`
      SELECT
        COUNT(*) AS total_assessments,
        AVG(pd_score) AS avg_pd,
        AVG(lgd_score) AS avg_lgd,
        AVG(expected_loss_rate) AS avg_expected_loss_rate,
        SUM(exposure_at_default) AS total_exposure,
        SUM(expected_loss) AS total_expected_loss,
        COUNT(CASE WHEN risk_decision = 'approve' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN risk_decision = 'decline' THEN 1 END) AS declined_count,
        COUNT(CASE WHEN risk_decision = 'review' THEN 1 END) AS review_count,
        AVG(CASE WHEN pd_band = 'very_low' THEN 1
                 WHEN pd_band = 'low' THEN 2
                 WHEN pd_band = 'medium' THEN 3
                 WHEN pd_band = 'high' THEN 4
                 ELSE 5 END) AS avg_pd_band_numeric
      FROM healthcare_risk_assessments
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);

    return result.rows[0];
  }

  /**
   * Get risk distribution by band
   */
  async getRiskDistribution() {
    const result = await query(`
      SELECT
        pd_band,
        COUNT(*) AS count,
        AVG(pd_score) AS avg_pd,
        AVG(expected_loss_rate) AS avg_el_rate,
        SUM(exposure_at_default) AS total_exposure
      FROM healthcare_risk_assessments
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY pd_band
      ORDER BY
        CASE pd_band
          WHEN 'very_low' THEN 1
          WHEN 'low' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'high' THEN 4
          ELSE 5
        END
    `);

    return result.rows;
  }
}

// Export singleton instance
const healthcareRiskService = new HealthcareRiskService();

module.exports = {
  HealthcareRiskService,
  healthcareRiskService
};
