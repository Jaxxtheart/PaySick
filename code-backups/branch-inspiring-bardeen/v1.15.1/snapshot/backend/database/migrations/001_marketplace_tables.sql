-- =============================================
-- PaySick Marketplace Migration
-- Adds lending marketplace functionality
-- =============================================

-- =============================================
-- ENUM TYPES FOR MARKETPLACE
-- =============================================

-- Application status for marketplace loans
CREATE TYPE marketplace_application_status AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDERWRITING',
    'OFFERS_RECEIVED',
    'OFFER_SELECTED',
    'FUNDED',
    'DECLINED',
    'EXPIRED',
    'CANCELLED'
);

-- Lender offer status
CREATE TYPE lender_offer_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'WITHDRAWN'
);

-- Lender type classification
CREATE TYPE lender_type AS ENUM (
    'PAYSICK_BALANCE_SHEET',
    'BANK',
    'CREDIT_UNION',
    'PRIVATE_LENDER',
    'FINTECH'
);

-- Risk tier classification
CREATE TYPE risk_tier AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH'
);

-- Marketplace loan status
CREATE TYPE marketplace_loan_status AS ENUM (
    'PENDING_DISBURSEMENT',
    'ACTIVE',
    'CURRENT',
    'DELINQUENT',
    'DEFAULT',
    'PAID_OFF',
    'WRITTEN_OFF',
    'RESTRUCTURED'
);

-- Marketplace repayment status
CREATE TYPE marketplace_repayment_status AS ENUM (
    'SCHEDULED',
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'PARTIAL',
    'SKIPPED',
    'REVERSED'
);

-- Payment method for repayments
CREATE TYPE marketplace_payment_method AS ENUM (
    'DEBIT_ORDER',
    'EFT',
    'CARD',
    'CASH',
    'SALARY_DEDUCTION'
);

-- =============================================
-- LENDER TABLE
-- =============================================

CREATE TABLE lenders (
    lender_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic Information
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    type lender_type NOT NULL DEFAULT 'BANK',
    active BOOLEAN NOT NULL DEFAULT true,

    -- Loan Limits
    min_loan_amount DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
    max_loan_amount DECIMAL(12,2) NOT NULL DEFAULT 1000000.00,

    -- Risk Appetite (score range: 0-100)
    min_risk_score INTEGER NOT NULL DEFAULT 0,
    max_risk_score INTEGER NOT NULL DEFAULT 100,

    -- Pricing Configuration
    base_rate DECIMAL(6,4) NOT NULL DEFAULT 0.18,          -- Base interest rate (e.g., 0.18 = 18%)
    risk_premium_low DECIMAL(6,4) DEFAULT 0.02,            -- Additional rate for low risk
    risk_premium_mid DECIMAL(6,4) DEFAULT 0.05,            -- Additional rate for medium risk
    risk_premium_high DECIMAL(6,4) DEFAULT 0.10,           -- Additional rate for high risk

    -- Term Limits (months)
    min_term INTEGER NOT NULL DEFAULT 3,
    max_term INTEGER NOT NULL DEFAULT 60,

    -- Fees
    origination_fee_perc DECIMAL(6,4) DEFAULT 0.025,       -- Origination fee as percentage (e.g., 0.025 = 2.5%)
    service_fee_monthly DECIMAL(10,2) DEFAULT 0.00,        -- Monthly service fee

    -- Integration
    webhook_url VARCHAR(500),
    api_key_encrypted TEXT,
    callback_secret_encrypted TEXT,

    -- Contact
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT chk_loan_amounts CHECK (min_loan_amount <= max_loan_amount),
    CONSTRAINT chk_risk_scores CHECK (min_risk_score >= 0 AND max_risk_score <= 100 AND min_risk_score <= max_risk_score),
    CONSTRAINT chk_terms CHECK (min_term <= max_term AND min_term >= 1),
    CONSTRAINT chk_base_rate CHECK (base_rate >= 0 AND base_rate <= 1)
);

CREATE INDEX idx_lenders_code ON lenders(code);
CREATE INDEX idx_lenders_active ON lenders(active);
CREATE INDEX idx_lenders_type ON lenders(type);

-- =============================================
-- LOAN APPLICATION TABLE (MARKETPLACE)
-- =============================================

CREATE TABLE loan_applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References to existing tables
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(provider_id),

    -- Procedure Details
    procedure_type VARCHAR(100) NOT NULL,
    procedure_code VARCHAR(50),
    procedure_description TEXT,

    -- Loan Request
    loan_amount DECIMAL(12,2) NOT NULL,
    requested_term INTEGER NOT NULL,  -- months

    -- Risk Assessment (calculated by PaySick)
    risk_score INTEGER,
    risk_tier risk_tier,
    affordability_score DECIMAL(5,2),
    debt_to_income_ratio DECIMAL(5,2),

    -- Patient Financial Info (for lender review)
    monthly_income DECIMAL(12,2),
    employment_status VARCHAR(50),
    employment_duration_months INTEGER,

    -- Pre-calculated Terms (by PaySick underwriting)
    recommended_rate DECIMAL(6,4),
    recommended_term INTEGER,
    recommended_monthly_payment DECIMAL(12,2),

    -- Bureau Data Reference
    bureau_check_id VARCHAR(100),
    bureau_check_date TIMESTAMP,
    bureau_score INTEGER,

    -- Status
    status marketplace_application_status NOT NULL DEFAULT 'DRAFT',
    submitted_at TIMESTAMP,
    underwriting_completed_at TIMESTAMP,
    offers_deadline TIMESTAMP,

    -- Final Decision
    selected_offer_id UUID,
    decision_at TIMESTAMP,
    decline_reason TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,

    -- Constraints
    CONSTRAINT chk_loan_amount CHECK (loan_amount > 0),
    CONSTRAINT chk_requested_term CHECK (requested_term >= 1 AND requested_term <= 120),
    CONSTRAINT chk_risk_score_range CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100))
);

CREATE INDEX idx_loan_applications_user ON loan_applications(user_id);
CREATE INDEX idx_loan_applications_provider ON loan_applications(provider_id);
CREATE INDEX idx_loan_applications_status ON loan_applications(status);
CREATE INDEX idx_loan_applications_created ON loan_applications(created_at);
CREATE INDEX idx_loan_applications_risk_tier ON loan_applications(risk_tier);

-- =============================================
-- LENDER OFFERS TABLE
-- =============================================

CREATE TABLE lender_offers (
    offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    application_id UUID NOT NULL REFERENCES loan_applications(application_id) ON DELETE CASCADE,
    lender_id UUID NOT NULL REFERENCES lenders(lender_id) ON DELETE CASCADE,

    -- Offer Terms
    approved_amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(6,4) NOT NULL,          -- Annual interest rate
    term INTEGER NOT NULL,                         -- Months
    monthly_payment DECIMAL(12,2) NOT NULL,
    total_repayable DECIMAL(12,2) NOT NULL,

    -- Fees
    origination_fee DECIMAL(10,2) DEFAULT 0.00,
    service_fee DECIMAL(10,2) DEFAULT 0.00,

    -- Status
    status lender_offer_status NOT NULL DEFAULT 'PENDING',

    -- Timing
    offered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    responded_at TIMESTAMP,

    -- Lender Notes
    lender_notes TEXT,
    conditions TEXT,

    -- If declined by lender
    decline_reason TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT chk_approved_amount CHECK (approved_amount > 0),
    CONSTRAINT chk_interest_rate CHECK (interest_rate >= 0 AND interest_rate <= 1),
    CONSTRAINT chk_offer_term CHECK (term >= 1),
    CONSTRAINT chk_monthly_payment CHECK (monthly_payment > 0),

    -- Unique constraint: one offer per lender per application
    CONSTRAINT uq_lender_offer UNIQUE (application_id, lender_id)
);

CREATE INDEX idx_lender_offers_application ON lender_offers(application_id);
CREATE INDEX idx_lender_offers_lender ON lender_offers(lender_id);
CREATE INDEX idx_lender_offers_status ON lender_offers(status);
CREATE INDEX idx_lender_offers_expires ON lender_offers(expires_at);

-- =============================================
-- MARKETPLACE LOANS TABLE
-- =============================================

CREATE TABLE marketplace_loans (
    loan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    application_id UUID NOT NULL REFERENCES loan_applications(application_id),
    offer_id UUID NOT NULL REFERENCES lender_offers(offer_id),
    lender_id UUID NOT NULL REFERENCES lenders(lender_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    provider_id UUID REFERENCES providers(provider_id),

    -- Loan Terms (from accepted offer)
    principal_amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(6,4) NOT NULL,
    term INTEGER NOT NULL,
    monthly_payment DECIMAL(12,2) NOT NULL,
    total_repayable DECIMAL(12,2) NOT NULL,

    -- Fees
    origination_fee DECIMAL(10,2) DEFAULT 0.00,
    total_fees DECIMAL(10,2) DEFAULT 0.00,

    -- Status
    status marketplace_loan_status NOT NULL DEFAULT 'PENDING_DISBURSEMENT',

    -- Dates
    disbursement_date DATE,
    first_payment_date DATE,
    maturity_date DATE,

    -- Balance Tracking
    outstanding_principal DECIMAL(12,2) NOT NULL,
    outstanding_interest DECIMAL(12,2) DEFAULT 0.00,
    outstanding_fees DECIMAL(10,2) DEFAULT 0.00,
    total_outstanding DECIMAL(12,2) NOT NULL,

    -- Payment Tracking
    payments_made INTEGER DEFAULT 0,
    total_paid DECIMAL(12,2) DEFAULT 0.00,
    last_payment_date DATE,
    next_payment_date DATE,

    -- Delinquency
    days_past_due INTEGER DEFAULT 0,
    delinquency_count INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    closed_reason TEXT,

    -- Constraints
    CONSTRAINT chk_principal CHECK (principal_amount > 0),
    CONSTRAINT chk_loan_term CHECK (term >= 1)
);

CREATE INDEX idx_marketplace_loans_application ON marketplace_loans(application_id);
CREATE INDEX idx_marketplace_loans_lender ON marketplace_loans(lender_id);
CREATE INDEX idx_marketplace_loans_user ON marketplace_loans(user_id);
CREATE INDEX idx_marketplace_loans_status ON marketplace_loans(status);
CREATE INDEX idx_marketplace_loans_next_payment ON marketplace_loans(next_payment_date);

-- =============================================
-- LOAN REPAYMENTS TABLE
-- =============================================

CREATE TABLE loan_repayments (
    repayment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- References
    loan_id UUID NOT NULL REFERENCES marketplace_loans(loan_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Payment Details
    payment_number INTEGER NOT NULL,
    scheduled_date DATE NOT NULL,

    -- Amounts
    scheduled_amount DECIMAL(12,2) NOT NULL,
    principal_portion DECIMAL(12,2) NOT NULL,
    interest_portion DECIMAL(12,2) NOT NULL,
    fees_portion DECIMAL(10,2) DEFAULT 0.00,

    -- Actual Payment
    paid_amount DECIMAL(12,2),
    paid_date TIMESTAMP,
    payment_method marketplace_payment_method,

    -- Status
    status marketplace_repayment_status NOT NULL DEFAULT 'SCHEDULED',

    -- Payment Reference
    transaction_reference VARCHAR(100),
    bank_reference VARCHAR(100),

    -- Late Fees
    late_fee DECIMAL(10,2) DEFAULT 0.00,
    days_late INTEGER DEFAULT 0,

    -- Failure Info
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_date DATE,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT chk_payment_number CHECK (payment_number >= 1),
    CONSTRAINT chk_scheduled_amount CHECK (scheduled_amount > 0)
);

CREATE INDEX idx_loan_repayments_loan ON loan_repayments(loan_id);
CREATE INDEX idx_loan_repayments_user ON loan_repayments(user_id);
CREATE INDEX idx_loan_repayments_status ON loan_repayments(status);
CREATE INDEX idx_loan_repayments_scheduled ON loan_repayments(scheduled_date);

-- =============================================
-- MARKETPLACE AUDIT LOG
-- =============================================

CREATE TABLE marketplace_audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Entity Reference
    entity_type VARCHAR(50) NOT NULL,  -- loan_application, lender_offer, marketplace_loan, loan_repayment
    entity_id UUID NOT NULL,

    -- Action
    action VARCHAR(50) NOT NULL,  -- create, update, status_change, offer_received, offer_accepted, etc.
    performed_by UUID,
    performed_by_type VARCHAR(20),  -- user, lender, system, admin

    -- Changes
    old_values JSONB,
    new_values JSONB,

    -- Context
    ip_address INET,
    user_agent TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_marketplace_audit_entity ON marketplace_audit_log(entity_type, entity_id);
CREATE INDEX idx_marketplace_audit_action ON marketplace_audit_log(action);
CREATE INDEX idx_marketplace_audit_created ON marketplace_audit_log(created_at);

-- =============================================
-- VIEWS FOR MARKETPLACE
-- =============================================

-- Active Loan Applications with Offers
CREATE VIEW vw_marketplace_applications AS
SELECT
    la.application_id,
    la.user_id,
    u.full_name AS patient_name,
    u.email AS patient_email,
    la.procedure_type,
    la.loan_amount,
    la.requested_term,
    la.risk_score,
    la.risk_tier,
    la.status,
    la.submitted_at,
    la.offers_deadline,
    COUNT(lo.offer_id) AS offer_count,
    MIN(lo.interest_rate) AS best_rate,
    p.provider_name
FROM loan_applications la
JOIN users u ON la.user_id = u.user_id
LEFT JOIN providers p ON la.provider_id = p.provider_id
LEFT JOIN lender_offers lo ON la.application_id = lo.application_id AND lo.status = 'PENDING'
GROUP BY la.application_id, u.full_name, u.email, p.provider_name;

-- Lender Performance Summary
CREATE VIEW vw_lender_performance AS
SELECT
    l.lender_id,
    l.name AS lender_name,
    l.code AS lender_code,
    l.type AS lender_type,
    COUNT(DISTINCT lo.offer_id) AS total_offers,
    COUNT(DISTINCT CASE WHEN lo.status = 'ACCEPTED' THEN lo.offer_id END) AS accepted_offers,
    COUNT(DISTINCT ml.loan_id) AS active_loans,
    SUM(ml.principal_amount) AS total_loaned,
    AVG(ml.interest_rate) AS avg_rate
FROM lenders l
LEFT JOIN lender_offers lo ON l.lender_id = lo.lender_id
LEFT JOIN marketplace_loans ml ON l.lender_id = ml.lender_id
GROUP BY l.lender_id, l.name, l.code, l.type;

-- =============================================
-- TRIGGERS FOR MARKETPLACE
-- =============================================

-- Auto-update updated_at for lenders
CREATE TRIGGER update_lenders_updated_at BEFORE UPDATE ON lenders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for loan_applications
CREATE TRIGGER update_loan_applications_updated_at BEFORE UPDATE ON loan_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for lender_offers
CREATE TRIGGER update_lender_offers_updated_at BEFORE UPDATE ON lender_offers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for marketplace_loans
CREATE TRIGGER update_marketplace_loans_updated_at BEFORE UPDATE ON marketplace_loans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for loan_repayments
CREATE TRIGGER update_loan_repayments_updated_at BEFORE UPDATE ON loan_repayments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- FUNCTION: Calculate total outstanding on loan update
-- =============================================

CREATE OR REPLACE FUNCTION calculate_loan_outstanding()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_outstanding = NEW.outstanding_principal + NEW.outstanding_interest + NEW.outstanding_fees;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_loan_outstanding BEFORE INSERT OR UPDATE ON marketplace_loans
    FOR EACH ROW EXECUTE FUNCTION calculate_loan_outstanding();

-- =============================================
-- END OF MARKETPLACE MIGRATION
-- =============================================
