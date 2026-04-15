-- =============================================
-- PaySick Shield Underwriting Framework
-- Migration 004: Five-Gate Underwriting System
--
-- NEW tables only — does NOT modify existing schema.
-- Extends existing system with underwriting intelligence.
-- =============================================

-- =============================================
-- GATE 1: PROVIDER GATE TABLES
-- =============================================

-- Provider Risk Scores (monthly snapshots)
CREATE TABLE IF NOT EXISTS provider_risk_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(provider_id),

    -- Composite Score
    composite_score FLOAT NOT NULL,               -- 0-100
    traffic_light VARCHAR(10) NOT NULL,            -- green, amber, red

    -- Component Scores
    repayment_score FLOAT NOT NULL,                -- 40% weight
    cost_variance_score FLOAT NOT NULL,            -- 25% weight
    outcome_satisfaction_score FLOAT NOT NULL,      -- 20% weight
    volume_trend_score FLOAT NOT NULL,             -- 15% weight

    -- Underlying Metrics
    rolling_12m_default_rate FLOAT,
    cost_variance_from_benchmark_pct FLOAT,
    avg_satisfaction FLOAT,                        -- 1-5 scale
    month_over_month_volume_change_pct FLOAT,

    -- Recommendation
    recommended_action TEXT,
    requires_human_review BOOLEAN DEFAULT false,

    -- Snapshot Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_risk_scores_provider ON provider_risk_scores(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_risk_scores_period ON provider_risk_scores(period_end DESC);
CREATE INDEX IF NOT EXISTS idx_provider_risk_scores_traffic ON provider_risk_scores(traffic_light);

-- Provider Trust Tiers (audit trail of tier changes)
CREATE TABLE IF NOT EXISTS provider_trust_tiers (
    tier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(provider_id),

    -- Tier Information
    trust_tier VARCHAR(20) NOT NULL,               -- probation, standard, trusted, premium
    previous_tier VARCHAR(20),
    change_reason TEXT NOT NULL,

    -- Tier Parameters (active at time of this tier)
    per_patient_cap DECIMAL(10,2) NOT NULL,
    payout_speed_days INTEGER NOT NULL,
    holdback_pct FLOAT NOT NULL,
    max_monthly_volume INTEGER,                    -- NULL = no cap

    -- Approval
    approved_by UUID,                              -- user_id of approver
    approved_at TIMESTAMP,

    -- Validity
    effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMP,                     -- NULL = current
    is_current BOOLEAN DEFAULT true,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_trust_tiers_provider ON provider_trust_tiers(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_trust_tiers_current ON provider_trust_tiers(provider_id, is_current) WHERE is_current = true;

-- Procedure Cost Benchmarks
CREATE TABLE IF NOT EXISTS procedure_benchmarks (
    benchmark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Procedure Classification
    procedure_type VARCHAR(50) NOT NULL,           -- dental, ophthalmology, cosmetic, etc.
    procedure_subtype VARCHAR(100) NOT NULL,        -- e.g. "single dental implant"
    region VARCHAR(50) NOT NULL,                    -- gauteng, western_cape, kzn, eastern_cape, other

    -- Cost Distribution
    p25_cost DECIMAL(10,2) NOT NULL,               -- 25th percentile
    median_cost DECIMAL(10,2) NOT NULL,            -- 50th percentile (primary benchmark)
    p75_cost DECIMAL(10,2) NOT NULL,               -- 75th percentile
    p95_cost DECIMAL(10,2) NOT NULL,               -- 95th percentile (outlier threshold)

    -- Metadata
    sample_size INTEGER NOT NULL DEFAULT 0,
    source VARCHAR(100) NOT NULL,                  -- internal_data, mediclinic_schedule, netcare_schedule, manual_research
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_procedure_benchmark UNIQUE (procedure_type, procedure_subtype, region)
);

CREATE INDEX IF NOT EXISTS idx_procedure_benchmarks_type ON procedure_benchmarks(procedure_type);
CREATE INDEX IF NOT EXISTS idx_procedure_benchmarks_region ON procedure_benchmarks(region);

-- Provider Holdbacks (financial holdback tracking)
CREATE TABLE IF NOT EXISTS provider_holdbacks (
    holdback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(provider_id),
    loan_id UUID,                                  -- reference to the originating loan

    -- Holdback Details
    holdback_amount DECIMAL(10,2) NOT NULL,
    holdback_pct FLOAT NOT NULL,
    loan_amount DECIMAL(10,2) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'held',    -- held, released, forfeited
    release_date DATE,                             -- scheduled release date (90 days post-disbursement)
    released_at TIMESTAMP,
    released_by UUID,

    -- Forfeiture (if patient defaulted)
    forfeited_at TIMESTAMP,
    forfeiture_reason TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_holdbacks_provider ON provider_holdbacks(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_holdbacks_status ON provider_holdbacks(status);
CREATE INDEX IF NOT EXISTS idx_provider_holdbacks_release ON provider_holdbacks(release_date) WHERE status = 'held';

-- =============================================
-- GATE 2: PATIENT GATE TABLES
-- =============================================

-- Loan Risk Assessments (Gate 2 output per application)
CREATE TABLE IF NOT EXISTS loan_risk_assessments (
    assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID,                           -- FK to loan_applications or applications
    patient_id UUID NOT NULL REFERENCES users(user_id),
    provider_id UUID REFERENCES providers(provider_id),

    -- Procedure Details
    procedure_type VARCHAR(50),
    procedure_description TEXT,
    quoted_amount DECIMAL(10,2) NOT NULL,
    medical_aid_covered DECIMAL(10,2) DEFAULT 0,
    loan_amount_requested DECIMAL(10,2) NOT NULL,
    loan_term_months INTEGER NOT NULL,

    -- Urgency & Booking
    urgency_classification VARCHAR(20) NOT NULL DEFAULT 'planned',  -- elective, planned, semi_urgent, urgent
    booking_lead_days INTEGER,

    -- Income & Affordability
    monthly_income_verified DECIMAL(10,2) NOT NULL,
    monthly_obligations DECIMAL(10,2) NOT NULL DEFAULT 0,
    disposable_income DECIMAL(10,2),
    repayment_to_income FLOAT,                     -- RTI ratio
    debt_to_income_pre FLOAT,                      -- DTI before this loan
    debt_to_income_post FLOAT,                     -- DTI after this loan
    proposed_monthly_repayment DECIMAL(10,2),

    -- Segmentation
    segment VARCHAR(20),                           -- gap_financing, full_procedure
    borrower_profile VARCHAR(30),                  -- convenience, planned_necessity, urgent_necessity
    income_verification VARCHAR(20) NOT NULL DEFAULT 'manual_verified',  -- api_verified, pdf_parsed, manual_verified

    -- AI Decision
    risk_tier VARCHAR(20),                         -- prime, standard, cautious, high_risk
    ai_recommendation VARCHAR(30) NOT NULL,        -- approve, approve_with_conditions, refer_to_human, decline
    ai_confidence FLOAT,                           -- 0-1
    ai_rationale JSONB NOT NULL DEFAULT '[]',      -- array of rationale strings
    ai_flags JSONB NOT NULL DEFAULT '[]',          -- array of flag strings
    ai_conditions JSONB NOT NULL DEFAULT '[]',     -- array of condition strings
    alternative_offer JSONB,                       -- affordable alternative if declined

    -- Traffic Light
    traffic_light VARCHAR(10) NOT NULL,            -- green, amber, red

    -- Human Decision
    human_decision VARCHAR(20),                    -- approved, declined, modified, pending
    human_decision_by UUID,
    human_decision_at TIMESTAMP,
    human_decision_reason TEXT,                     -- mandatory for overrides

    -- Cooling Off
    cooling_off_required BOOLEAN DEFAULT false,
    cooling_off_expires TIMESTAMP,

    -- Gate Results (all gates)
    gate_1_result JSONB,                           -- provider gate output
    gate_2_result JSONB,                           -- patient gate output (this assessment)
    gate_3_result JSONB,                           -- lender gate output

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_loan_risk_assessments_patient ON loan_risk_assessments(patient_id);
CREATE INDEX IF NOT EXISTS idx_loan_risk_assessments_provider ON loan_risk_assessments(provider_id);
CREATE INDEX IF NOT EXISTS idx_loan_risk_assessments_recommendation ON loan_risk_assessments(ai_recommendation);
CREATE INDEX IF NOT EXISTS idx_loan_risk_assessments_human ON loan_risk_assessments(human_decision) WHERE human_decision = 'pending';
CREATE INDEX IF NOT EXISTS idx_loan_risk_assessments_traffic ON loan_risk_assessments(traffic_light);

-- Borrower Profiles (convenience/necessity classification history)
CREATE TABLE IF NOT EXISTS borrower_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(user_id),

    -- Classification
    borrower_profile VARCHAR(30) NOT NULL,          -- convenience, planned_necessity, urgent_necessity

    -- Signal Scores
    convenience_signals INTEGER NOT NULL DEFAULT 0,
    necessity_signals INTEGER NOT NULL DEFAULT 0,

    -- Signal Details
    signal_details JSONB NOT NULL DEFAULT '{}',

    -- Lifecycle
    total_loans INTEGER DEFAULT 0,
    total_loan_value DECIMAL(12,2) DEFAULT 0,
    default_count INTEGER DEFAULT 0,
    avg_repayment_to_income FLOAT,

    -- Health Line Eligibility
    health_line_eligible BOOLEAN DEFAULT false,
    health_line_eligible_date TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_borrower_profiles_patient ON borrower_profiles(patient_id);
CREATE INDEX IF NOT EXISTS idx_borrower_profiles_type ON borrower_profiles(borrower_profile);
CREATE INDEX IF NOT EXISTS idx_borrower_profiles_health_line ON borrower_profiles(health_line_eligible) WHERE health_line_eligible = true;

-- =============================================
-- GATE 3: LENDER GATE TABLES
-- =============================================

-- Lender Scores (monthly performance snapshots)
CREATE TABLE IF NOT EXISTS lender_scores (
    score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lender_id UUID NOT NULL,                       -- FK to lenders table

    -- Performance Metrics
    approval_rate FLOAT,
    avg_rate_charged FLOAT,
    patient_complaint_rate FLOAT,
    collections_complaint_rate FLOAT,
    avg_time_to_fund_hours FLOAT,
    bid_coverage_pct FLOAT,                        -- % of presented loans bid on

    -- Composite Score
    composite_score FLOAT NOT NULL,                -- 0-100
    allocation_priority INTEGER,                   -- 1 = highest priority

    -- Volume
    total_loans_funded INTEGER DEFAULT 0,
    total_value_funded DECIMAL(14,2) DEFAULT 0,
    concentration_pct FLOAT DEFAULT 0,             -- share of total marketplace

    -- Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lender_scores_lender ON lender_scores(lender_id);
CREATE INDEX IF NOT EXISTS idx_lender_scores_period ON lender_scores(period_end DESC);

-- =============================================
-- GATE 4: OUTCOME GATE TABLES
-- =============================================

-- Outcome Surveys (patient satisfaction)
CREATE TABLE IF NOT EXISTS outcome_surveys (
    survey_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID,
    patient_id UUID NOT NULL REFERENCES users(user_id),
    provider_id UUID REFERENCES providers(provider_id),

    -- Survey Type
    survey_type VARCHAR(20) NOT NULL,              -- day_3, day_30, day_90

    -- Responses
    overall_rating INTEGER,                        -- 1-5 stars
    outcome_satisfaction INTEGER,                   -- 1-5
    would_recommend BOOLEAN,
    complications_reported BOOLEAN DEFAULT false,
    complication_details TEXT,
    financial_comfort INTEGER,                     -- 1-5 (how comfortable with repayment)
    free_text_comment TEXT,

    -- Delivery
    sent_via VARCHAR(20),                          -- sms, whatsapp, email
    sent_at TIMESTAMP,
    responded_at TIMESTAMP,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, completed, expired

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outcome_surveys_patient ON outcome_surveys(patient_id);
CREATE INDEX IF NOT EXISTS idx_outcome_surveys_provider ON outcome_surveys(provider_id);
CREATE INDEX IF NOT EXISTS idx_outcome_surveys_type ON outcome_surveys(survey_type);
CREATE INDEX IF NOT EXISTS idx_outcome_surveys_status ON outcome_surveys(status);

-- =============================================
-- GATE 5: CIRCUIT BREAKER TABLES
-- =============================================

-- Circuit Breaker Events (trigger log)
CREATE TABLE IF NOT EXISTS circuit_breaker_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Breaker Identification
    breaker_name VARCHAR(50) NOT NULL,
    breaker_level VARCHAR(10) NOT NULL,            -- amber, red

    -- Trigger Details
    condition_description TEXT NOT NULL,
    trigger_value FLOAT NOT NULL,                  -- the actual value that triggered
    threshold_value FLOAT NOT NULL,                -- the threshold it exceeded

    -- Response
    auto_responses JSONB DEFAULT '[]',             -- actions taken automatically
    human_action_required TEXT,

    -- Resolution
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, acknowledged, resolved, overridden
    acknowledged_by UUID,
    acknowledged_at TIMESTAMP,
    resolved_by UUID,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,

    -- Override (if applicable)
    overridden BOOLEAN DEFAULT false,
    override_by UUID,
    override_at TIMESTAMP,
    override_reason TEXT,                           -- mandatory
    override_expires TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_name ON circuit_breaker_events(breaker_name);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_status ON circuit_breaker_events(status);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_level ON circuit_breaker_events(breaker_level);
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_created ON circuit_breaker_events(created_at DESC);

-- Circuit Breaker State (current state of each breaker)
CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    breaker_name VARCHAR(50) PRIMARY KEY,
    breaker_level VARCHAR(10) NOT NULL,            -- amber, red

    -- Current State
    status VARCHAR(10) NOT NULL DEFAULT 'green',   -- green, amber, red
    current_value FLOAT,
    threshold_value FLOAT NOT NULL,
    distance_to_trigger FLOAT,                     -- positive = safe, negative = triggered

    -- Last Change
    last_triggered_at TIMESTAMP,
    last_resolved_at TIMESTAMP,

    -- Active Override
    active_override BOOLEAN DEFAULT false,
    override_expires TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- HEALTH LINE (Revolving Credit) TABLES
-- =============================================

-- Health Line Accounts
CREATE TABLE IF NOT EXISTS health_line_accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(user_id),

    -- Facility Details
    credit_limit DECIMAL(10,2) NOT NULL,
    available_balance DECIMAL(10,2) NOT NULL,
    current_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    interest_rate FLOAT NOT NULL,                  -- annual rate as decimal e.g. 0.14

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending_approval',  -- pending_approval, active, frozen, closed
    freeze_reason TEXT,
    frozen_at TIMESTAMP,

    -- History
    original_loan_id UUID,                         -- the loan that earned Health Line eligibility
    activation_date TIMESTAMP,
    last_draw_date TIMESTAMP,
    consecutive_on_time_payments INTEGER DEFAULT 0,

    -- Limit History
    initial_limit DECIMAL(10,2) NOT NULL,
    limit_increase_count INTEGER DEFAULT 0,
    last_limit_increase_date TIMESTAMP,

    -- Approval
    activated_by UUID,                             -- underwriter who approved
    activated_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_health_line_patient UNIQUE (patient_id)
);

CREATE INDEX IF NOT EXISTS idx_health_line_patient ON health_line_accounts(patient_id);
CREATE INDEX IF NOT EXISTS idx_health_line_status ON health_line_accounts(status);

-- Health Line Draw-downs
CREATE TABLE IF NOT EXISTS health_line_draws (
    draw_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES health_line_accounts(account_id),
    patient_id UUID NOT NULL REFERENCES users(user_id),
    provider_id UUID REFERENCES providers(provider_id),

    -- Draw Details
    draw_amount DECIMAL(10,2) NOT NULL,
    procedure_type VARCHAR(50),
    procedure_description TEXT,

    -- Repayment
    repayment_term_months INTEGER NOT NULL,
    monthly_repayment DECIMAL(10,2) NOT NULL,
    interest_rate FLOAT NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, disbursed, repaying, completed

    -- Affordability Check (same ceilings apply)
    rti_at_draw FLOAT,
    dti_at_draw FLOAT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_health_line_draws_account ON health_line_draws(account_id);
CREATE INDEX IF NOT EXISTS idx_health_line_draws_patient ON health_line_draws(patient_id);

-- =============================================
-- HUMAN REVIEW & AUDIT TABLES
-- =============================================

-- Human Review Log (every human decision with rationale)
CREATE TABLE IF NOT EXISTS human_review_log (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What was reviewed
    entity_type VARCHAR(30) NOT NULL,              -- loan_application, provider_tier, health_line, circuit_breaker, restructure
    entity_id UUID NOT NULL,

    -- AI Context
    ai_recommendation VARCHAR(30),
    ai_confidence FLOAT,
    ai_rationale JSONB,

    -- Human Decision
    human_decision VARCHAR(30) NOT NULL,
    decision_rationale TEXT NOT NULL,               -- mandatory free text
    is_override BOOLEAN DEFAULT false,             -- true if decision differs from AI recommendation

    -- Who & When
    decided_by UUID NOT NULL,
    decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Outcome Tracking
    outcome_tracked BOOLEAN DEFAULT false,
    outcome_result VARCHAR(30),                    -- performing, defaulted, restructured, etc.
    outcome_tracked_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_human_review_entity ON human_review_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_human_review_decided_by ON human_review_log(decided_by);
CREATE INDEX IF NOT EXISTS idx_human_review_override ON human_review_log(is_override) WHERE is_override = true;
CREATE INDEX IF NOT EXISTS idx_human_review_created ON human_review_log(created_at DESC);

-- =============================================
-- EXTEND EXISTING TABLES (add columns only)
-- Uses ALTER TABLE ADD COLUMN IF NOT EXISTS
-- =============================================

-- Extend providers table
ALTER TABLE providers ADD COLUMN IF NOT EXISTS hpcsa_registration VARCHAR(20);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS practice_type VARCHAR(50);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS trust_tier VARCHAR(20) DEFAULT 'probation';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS risk_score FLOAT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS total_loans_referred INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS total_loan_value DECIMAL(14,2) DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS default_rate FLOAT DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS avg_treatment_cost DECIMAL(10,2);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS cost_variance_pct FLOAT DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS payout_speed_days INTEGER DEFAULT 5;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS per_patient_cap DECIMAL(10,2) DEFAULT 10000;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS holdback_pct FLOAT DEFAULT 10;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS holdback_balance DECIMAL(10,2) DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS concentration_pct FLOAT DEFAULT 0;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS last_review_date TIMESTAMP;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS next_review_date TIMESTAMP;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS shield_flags JSONB DEFAULT '[]';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS max_monthly_volume INTEGER DEFAULT 10;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS avg_satisfaction_score FLOAT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS month_over_month_volume_change_pct FLOAT DEFAULT 0;

-- Extend users table for patient segmentation
ALTER TABLE users ADD COLUMN IF NOT EXISTS segment VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_line_eligible BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(12,2) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS borrower_profile VARCHAR(30);

-- =============================================
-- SEED: Initial Circuit Breaker State
-- =============================================

INSERT INTO circuit_breaker_state (breaker_name, breaker_level, status, threshold_value, distance_to_trigger, current_value)
VALUES
    ('arrears_warning', 'amber', 'green', 4.5, 4.5, 0),
    ('balance_sheet_concentration_warning', 'amber', 'green', 35, 35, 0),
    ('provider_cluster_risk', 'amber', 'green', 4, 4, 0),
    ('segment_drift', 'amber', 'green', 55, 55, 100),
    ('reserve_fund_decline', 'amber', 'green', 18, 18, 100),
    ('arrears_breach', 'red', 'green', 6, 6, 0),
    ('balance_sheet_breach', 'red', 'green', 40, 40, 0),
    ('single_provider_default_spike', 'red', 'green', 8, 8, 0),
    ('reserve_fund_critical', 'red', 'green', 15, 15, 100),
    ('systemic_loss_breach', 'red', 'green', 3, 3, 0)
ON CONFLICT (breaker_name) DO NOTHING;

-- =============================================
-- TRIGGERS for updated_at columns
-- =============================================

CREATE TRIGGER update_provider_trust_tiers_updated_at BEFORE UPDATE ON provider_trust_tiers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_procedure_benchmarks_updated_at BEFORE UPDATE ON procedure_benchmarks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_provider_holdbacks_updated_at BEFORE UPDATE ON provider_holdbacks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loan_risk_assessments_updated_at BEFORE UPDATE ON loan_risk_assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_borrower_profiles_updated_at BEFORE UPDATE ON borrower_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_line_accounts_updated_at BEFORE UPDATE ON health_line_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_line_draws_updated_at BEFORE UPDATE ON health_line_draws
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_circuit_breaker_state_updated_at BEFORE UPDATE ON circuit_breaker_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
