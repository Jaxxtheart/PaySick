-- =============================================
-- Healthcare Risk Scoring System
-- PaySick Proprietary PD & LGD Models
-- =============================================

-- =============================================
-- HEALTHCARE DATA SOURCES
-- Bureau-like scoring for healthcare
-- =============================================

-- Healthcare Data Sources Configuration
CREATE TABLE health_data_sources (
    source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source Information
    source_name VARCHAR(100) NOT NULL UNIQUE,
    source_type VARCHAR(50) NOT NULL, -- medical_aid, pharmacy, provider_history, credit_bureau, claims
    provider_name VARCHAR(100), -- Discovery, Bonitas, MedCredits, etc.

    -- API Configuration
    api_endpoint TEXT,
    api_version VARCHAR(20),
    requires_consent BOOLEAN DEFAULT true,

    -- Weighting in Risk Model
    pd_weight DECIMAL(5,4) DEFAULT 0.0000, -- Weight for PD calculation (0-1)
    lgd_weight DECIMAL(5,4) DEFAULT 0.0000, -- Weight for LGD calculation (0-1)

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, pending_integration
    last_sync TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert known healthcare data sources (South African context)
INSERT INTO health_data_sources (source_name, source_type, provider_name, pd_weight, lgd_weight, status) VALUES
    ('Medical Aid Claims History', 'medical_aid', 'Discovery/Bonitas/Momentum', 0.2000, 0.1500, 'active'),
    ('Chronic Medication Adherence', 'pharmacy', 'Pharmacy Dispensing Records', 0.1500, 0.1000, 'active'),
    ('Healthcare Payment History', 'provider_history', 'PaySick Internal', 0.2500, 0.2500, 'active'),
    ('Medical Credit Bureau', 'credit_bureau', 'MedCredits SA', 0.1500, 0.2000, 'pending_integration'),
    ('ICD-10 Procedure Risk Profile', 'claims', 'CMS/ICD Registry', 0.1500, 0.1500, 'active'),
    ('Provider Network Performance', 'provider_history', 'PaySick Network', 0.1000, 0.1500, 'active');

-- =============================================
-- ICD-10 PROCEDURE RISK WEIGHTS
-- Procedure-specific risk profiles
-- =============================================

CREATE TABLE procedure_risk_weights (
    procedure_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ICD-10 Code Information
    icd10_code VARCHAR(10) NOT NULL,
    icd10_category VARCHAR(100) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,

    -- Risk Weights (scale 0-100, higher = riskier)
    base_pd_risk INTEGER NOT NULL DEFAULT 50, -- Base probability of default risk
    base_lgd_risk INTEGER NOT NULL DEFAULT 50, -- Base loss given default risk

    -- Contextual Factors
    typical_amount_min DECIMAL(10,2), -- Typical procedure cost range
    typical_amount_max DECIMAL(10,2),
    recovery_time_days INTEGER, -- Average recovery affecting ability to pay
    emergency_factor DECIMAL(3,2) DEFAULT 1.00, -- Multiplier for emergency vs elective (1.0-2.0)

    -- Outcome Correlation
    success_rate DECIMAL(5,2), -- Procedure success rate affects patient satisfaction & payment likelihood
    complication_rate DECIMAL(5,2),

    -- Status
    status VARCHAR(20) DEFAULT 'active',

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert common procedure risk weights
INSERT INTO procedure_risk_weights (icd10_code, icd10_category, procedure_name, base_pd_risk, base_lgd_risk, typical_amount_min, typical_amount_max, recovery_time_days, success_rate) VALUES
    ('Z01.0', 'Examination', 'General Consultation', 15, 20, 500, 1500, 0, 99.00),
    ('Z01.1', 'Examination', 'Specialist Consultation', 20, 25, 800, 3000, 0, 98.00),
    ('K35', 'Digestive', 'Appendectomy', 35, 40, 15000, 35000, 14, 95.00),
    ('K80', 'Digestive', 'Gallbladder Surgery', 40, 45, 20000, 45000, 21, 92.00),
    ('M17', 'Musculoskeletal', 'Knee Replacement', 55, 60, 80000, 150000, 90, 88.00),
    ('M16', 'Musculoskeletal', 'Hip Replacement', 55, 60, 90000, 180000, 90, 87.00),
    ('C50', 'Oncology', 'Breast Cancer Treatment', 60, 65, 50000, 200000, 180, 85.00),
    ('I21', 'Cardiovascular', 'Cardiac Procedures', 65, 70, 100000, 400000, 60, 82.00),
    ('O80', 'Obstetrics', 'Normal Delivery', 25, 30, 8000, 20000, 7, 98.00),
    ('O82', 'Obstetrics', 'Caesarean Section', 30, 35, 20000, 45000, 14, 96.00),
    ('H25', 'Ophthalmology', 'Cataract Surgery', 20, 25, 15000, 30000, 7, 97.00),
    ('K40', 'Digestive', 'Hernia Repair', 30, 35, 12000, 30000, 14, 94.00),
    ('Z96', 'General', 'Dental Procedures', 20, 25, 2000, 15000, 3, 96.00);

CREATE INDEX idx_procedure_risk_icd10 ON procedure_risk_weights(icd10_code);
CREATE INDEX idx_procedure_risk_category ON procedure_risk_weights(icd10_category);

-- =============================================
-- PATIENT HEALTH SCORE
-- Healthcare-specific bureau score
-- =============================================

CREATE TABLE patient_health_scores (
    health_score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Overall Health Payment Score (0-100, higher = better)
    health_payment_score INTEGER NOT NULL DEFAULT 50,
    score_band VARCHAR(20), -- excellent (80-100), good (60-79), fair (40-59), poor (0-39)

    -- Component Scores (0-100 each)
    medical_aid_score INTEGER, -- Based on claims history, coverage status
    medication_adherence_score INTEGER, -- Chronic medication compliance
    provider_payment_score INTEGER, -- Historical healthcare payment behavior
    procedure_outcome_score INTEGER, -- Past procedure outcomes
    healthcare_utilization_score INTEGER, -- Frequency/pattern of healthcare usage

    -- Data Freshness
    last_medical_aid_check TIMESTAMP,
    last_pharmacy_check TIMESTAMP,
    last_provider_check TIMESTAMP,

    -- Risk Indicators
    chronic_conditions_count INTEGER DEFAULT 0,
    active_medical_aid BOOLEAN,
    medical_aid_scheme VARCHAR(100), -- Discovery, Bonitas, GEMS, etc.
    medical_aid_option VARCHAR(100), -- Plan level

    -- Consent & Compliance
    data_consent_given BOOLEAN DEFAULT false,
    consent_date TIMESTAMP,
    consent_expiry TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score_calculated_at TIMESTAMP
);

CREATE UNIQUE INDEX idx_patient_health_score_user ON patient_health_scores(user_id);
CREATE INDEX idx_patient_health_score_band ON patient_health_scores(score_band);

-- =============================================
-- HEALTHCARE RISK ASSESSMENT
-- Comprehensive PD & LGD calculations
-- =============================================

CREATE TABLE healthcare_risk_assessments (
    assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Probability of Default (PD) Model
    pd_score DECIMAL(5,4) NOT NULL, -- 0.0000 to 1.0000 (e.g., 0.0320 = 3.2%)
    pd_band VARCHAR(20), -- very_low, low, medium, high, very_high

    -- PD Component Scores (contributions to final PD)
    pd_health_score_component DECIMAL(5,4), -- From patient_health_scores
    pd_procedure_risk_component DECIMAL(5,4), -- From procedure type
    pd_affordability_component DECIMAL(5,4), -- Healthcare-specific affordability
    pd_provider_component DECIMAL(5,4), -- Provider network performance
    pd_behavioral_component DECIMAL(5,4), -- Application behavior signals

    -- Loss Given Default (LGD) Model
    lgd_score DECIMAL(5,4) NOT NULL, -- 0.0000 to 1.0000 (e.g., 0.4500 = 45%)
    lgd_band VARCHAR(20), -- very_low, low, medium, high, very_high

    -- LGD Component Scores
    lgd_collateral_component DECIMAL(5,4), -- Medical aid recovery potential
    lgd_family_support_component DECIMAL(5,4), -- Inferred family payment likelihood
    lgd_procedure_value_component DECIMAL(5,4), -- Procedure necessity/value retention
    lgd_provider_recovery_component DECIMAL(5,4), -- Provider-assisted recovery potential

    -- Expected Loss Calculation
    exposure_at_default DECIMAL(10,2) NOT NULL, -- Loan amount
    expected_loss DECIMAL(10,2) NOT NULL, -- PD × LGD × EAD
    expected_loss_rate DECIMAL(5,4) NOT NULL, -- Expected loss as percentage

    -- Decision Support
    risk_decision VARCHAR(20), -- approve, review, decline
    risk_adjusted_pricing DECIMAL(5,4), -- Suggested interest rate adjustment
    recommended_term_months INTEGER, -- Suggested payment term
    max_approved_amount DECIMAL(10,2), -- Maximum amount based on risk

    -- Model Information
    model_version VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    model_confidence DECIMAL(5,4), -- Model confidence score

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    calculated_by VARCHAR(50) DEFAULT 'system'
);

CREATE INDEX idx_risk_assessment_application ON healthcare_risk_assessments(application_id);
CREATE INDEX idx_risk_assessment_user ON healthcare_risk_assessments(user_id);
CREATE INDEX idx_risk_assessment_pd ON healthcare_risk_assessments(pd_score);
CREATE INDEX idx_risk_assessment_decision ON healthcare_risk_assessments(risk_decision);

-- =============================================
-- RISK MODEL PERFORMANCE TRACKING
-- Track model accuracy over time
-- =============================================

CREATE TABLE risk_model_performance (
    performance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Volume Metrics
    total_assessments INTEGER NOT NULL DEFAULT 0,
    approved_count INTEGER DEFAULT 0,
    declined_count INTEGER DEFAULT 0,

    -- Predicted vs Actual
    predicted_pd_avg DECIMAL(5,4),
    actual_pd DECIMAL(5,4),
    predicted_lgd_avg DECIMAL(5,4),
    actual_lgd DECIMAL(5,4),

    -- Model Accuracy
    gini_coefficient DECIMAL(5,4), -- Discriminatory power
    ks_statistic DECIMAL(5,4), -- Kolmogorov-Smirnov statistic
    auc_roc DECIMAL(5,4), -- Area under ROC curve

    -- Financial Impact
    total_exposure DECIMAL(12,2),
    predicted_losses DECIMAL(12,2),
    actual_losses DECIMAL(12,2),
    loss_variance DECIMAL(12,2),

    -- Model Version
    model_version VARCHAR(20) NOT NULL,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    calculated_at TIMESTAMP
);

CREATE INDEX idx_model_performance_period ON risk_model_performance(period_start, period_end);
CREATE INDEX idx_model_performance_version ON risk_model_performance(model_version);

-- =============================================
-- HEALTHCARE AFFORDABILITY ASSESSMENT
-- Healthcare-specific DTI and affordability
-- =============================================

CREATE TABLE healthcare_affordability (
    affordability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Income Assessment
    declared_income DECIMAL(10,2),
    verified_income DECIMAL(10,2),
    income_source VARCHAR(50), -- employed, self_employed, pension, grant
    income_stability_score INTEGER, -- 0-100

    -- Existing Obligations
    monthly_debt_obligations DECIMAL(10,2),
    medical_aid_premium DECIMAL(10,2),
    existing_healthcare_debt DECIMAL(10,2),

    -- Healthcare-Specific Ratios
    healthcare_dti DECIMAL(5,4), -- Healthcare debt-to-income
    total_dti DECIMAL(5,4), -- Total debt-to-income
    disposable_income DECIMAL(10,2),
    healthcare_capacity DECIMAL(10,2), -- Monthly healthcare payment capacity

    -- Affordability Band
    affordability_band VARCHAR(20), -- high, medium, low, insufficient
    max_monthly_payment DECIMAL(10,2),
    max_loan_amount DECIMAL(10,2),

    -- Data Sources Used
    bank_statement_verified BOOLEAN DEFAULT false,
    payslip_verified BOOLEAN DEFAULT false,
    bureau_data_used BOOLEAN DEFAULT false,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assessed_at TIMESTAMP
);

CREATE UNIQUE INDEX idx_affordability_user ON healthcare_affordability(user_id);

-- =============================================
-- VIEWS FOR RISK DASHBOARD
-- =============================================

-- Current Risk Portfolio View
CREATE VIEW vw_risk_portfolio_summary AS
SELECT
    DATE_TRUNC('month', hra.created_at) AS month,
    COUNT(*) AS total_assessments,
    AVG(hra.pd_score) AS avg_pd,
    AVG(hra.lgd_score) AS avg_lgd,
    AVG(hra.expected_loss_rate) AS avg_expected_loss_rate,
    SUM(hra.exposure_at_default) AS total_exposure,
    SUM(hra.expected_loss) AS total_expected_loss,
    COUNT(CASE WHEN hra.risk_decision = 'approve' THEN 1 END) AS approved,
    COUNT(CASE WHEN hra.risk_decision = 'decline' THEN 1 END) AS declined,
    COUNT(CASE WHEN hra.risk_decision = 'review' THEN 1 END) AS under_review
FROM healthcare_risk_assessments hra
GROUP BY DATE_TRUNC('month', hra.created_at)
ORDER BY month DESC;

-- Risk by Procedure Type View
CREATE VIEW vw_risk_by_procedure AS
SELECT
    a.treatment_type,
    prw.icd10_category,
    COUNT(*) AS applications,
    AVG(hra.pd_score) AS avg_pd,
    AVG(hra.lgd_score) AS avg_lgd,
    AVG(prw.base_pd_risk) AS procedure_base_risk,
    SUM(hra.exposure_at_default) AS total_exposure,
    SUM(hra.expected_loss) AS expected_loss
FROM healthcare_risk_assessments hra
JOIN applications a ON hra.application_id = a.application_id
LEFT JOIN procedure_risk_weights prw ON a.treatment_type = prw.procedure_name
GROUP BY a.treatment_type, prw.icd10_category;

-- Health Score Distribution View
CREATE VIEW vw_health_score_distribution AS
SELECT
    score_band,
    COUNT(*) AS patient_count,
    AVG(health_payment_score) AS avg_score,
    AVG(medical_aid_score) AS avg_medical_aid,
    AVG(medication_adherence_score) AS avg_medication,
    AVG(provider_payment_score) AS avg_provider_payment,
    COUNT(CASE WHEN active_medical_aid THEN 1 END) AS with_medical_aid
FROM patient_health_scores
GROUP BY score_band;

-- =============================================
-- UPDATE TRIGGERS
-- =============================================

CREATE TRIGGER update_health_data_sources_updated_at BEFORE UPDATE ON health_data_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_procedure_risk_weights_updated_at BEFORE UPDATE ON procedure_risk_weights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_health_scores_updated_at BEFORE UPDATE ON patient_health_scores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_healthcare_affordability_updated_at BEFORE UPDATE ON healthcare_affordability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RISK SCORING FUNCTION
-- Calculate PD band from score
-- =============================================

CREATE OR REPLACE FUNCTION get_pd_band(pd_score DECIMAL)
RETURNS VARCHAR(20) AS $$
BEGIN
    RETURN CASE
        WHEN pd_score <= 0.02 THEN 'very_low'
        WHEN pd_score <= 0.05 THEN 'low'
        WHEN pd_score <= 0.10 THEN 'medium'
        WHEN pd_score <= 0.20 THEN 'high'
        ELSE 'very_high'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_lgd_band(lgd_score DECIMAL)
RETURNS VARCHAR(20) AS $$
BEGIN
    RETURN CASE
        WHEN lgd_score <= 0.20 THEN 'very_low'
        WHEN lgd_score <= 0.35 THEN 'low'
        WHEN lgd_score <= 0.50 THEN 'medium'
        WHEN lgd_score <= 0.70 THEN 'high'
        ELSE 'very_high'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_health_score_band(score INTEGER)
RETURNS VARCHAR(20) AS $$
BEGIN
    RETURN CASE
        WHEN score >= 80 THEN 'excellent'
        WHEN score >= 60 THEN 'good'
        WHEN score >= 40 THEN 'fair'
        ELSE 'poor'
    END;
END;
$$ LANGUAGE plpgsql;
