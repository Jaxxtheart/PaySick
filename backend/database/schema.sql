-- =============================================
-- PaySick Database Schema
-- South African Healthcare Payment Platform
-- =============================================

-- =============================================
-- CORE TABLES
-- =============================================

-- Users/Patients Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Personal Information
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    cell_number VARCHAR(10) NOT NULL, -- SA format: 0821234567

    -- Identity & Verification (FICA/POPIA)
    sa_id_number VARCHAR(13) UNIQUE NOT NULL, -- 13-digit SA ID
    postal_code VARCHAR(4) NOT NULL,
    date_of_birth DATE NOT NULL,

    -- Consent & Compliance
    terms_accepted BOOLEAN NOT NULL DEFAULT false,
    popia_consent BOOLEAN NOT NULL DEFAULT false,
    popia_consent_date TIMESTAMP,

    -- Account Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, active, suspended, closed
    risk_tier VARCHAR(20), -- low, medium, high
    credit_limit DECIMAL(10,2) DEFAULT 850.00,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,

    -- Indexes
    CONSTRAINT chk_cell_number CHECK (cell_number ~ '^0[0-9]{9}$'),
    CONSTRAINT chk_id_number CHECK (LENGTH(sa_id_number) = 13),
    CONSTRAINT chk_postal_code CHECK (postal_code ~ '^[0-9]{4}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_cell ON users(cell_number);
CREATE INDEX idx_users_id_number ON users(sa_id_number);
CREATE INDEX idx_users_status ON users(status);

-- Banking Details Table (NCA Compliant)
CREATE TABLE banking_details (
    banking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Bank Account Information
    bank_name VARCHAR(50) NOT NULL, -- absa, fnb, nedbank, standard, capitec, investec
    account_type VARCHAR(20) NOT NULL, -- cheque, savings
    account_number_encrypted TEXT NOT NULL, -- Encrypted account number
    branch_code VARCHAR(6) NOT NULL,
    account_holder_name VARCHAR(255) NOT NULL,

    -- Debit Order Configuration
    debit_order_day INTEGER NOT NULL, -- 1, 7, 15, 25
    debit_order_active BOOLEAN NOT NULL DEFAULT true,

    -- Verification
    verification_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, failed
    verification_date TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_primary BOOLEAN DEFAULT true,

    CONSTRAINT chk_branch_code CHECK (branch_code ~ '^[0-9]{6}$'),
    CONSTRAINT chk_debit_day CHECK (debit_order_day IN (1, 7, 15, 25))
);

CREATE INDEX idx_banking_user ON banking_details(user_id);
CREATE INDEX idx_banking_verification ON banking_details(verification_status);

-- Healthcare Providers Directory
CREATE TABLE providers (
    provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Provider Information
    provider_name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- hospital, clinic, gp_practice, specialist
    provider_group VARCHAR(100), -- Netcare, Life Healthcare, Mediclinic, etc.

    -- Contact Details
    contact_email VARCHAR(255),
    contact_phone VARCHAR(15),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(50),
    postal_code VARCHAR(4),

    -- Network Status
    network_partner BOOLEAN DEFAULT false,
    partnership_tier VARCHAR(20), -- platinum, gold, silver, basic
    commission_rate DECIMAL(5,2), -- Percentage PaySick charges

    -- Banking (for settlements)
    bank_name VARCHAR(50),
    account_number_encrypted TEXT,
    branch_code VARCHAR(6),

    -- Status
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
    onboarded_at TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_providers_name ON providers(provider_name);
CREATE INDEX idx_providers_group ON providers(provider_group);
CREATE INDEX idx_providers_network ON providers(network_partner);

-- =============================================
-- APPLICATION TABLES
-- =============================================

-- Payment Applications
CREATE TABLE applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(provider_id),

    -- Application Details
    bill_amount DECIMAL(10,2) NOT NULL,
    treatment_type VARCHAR(50) NOT NULL, -- consultation, follow-up, urgent, specialist
    provider_name VARCHAR(255) NOT NULL, -- Stored for non-network providers
    existing_patient BOOLEAN NOT NULL,

    -- Risk Assessment
    risk_score INTEGER, -- 0-100
    completion_time_seconds INTEGER,
    application_hour INTEGER,

    -- Decision
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, under_review, declined
    decision_date TIMESTAMP,
    decision_reason TEXT,
    approved_amount DECIMAL(10,2),

    -- Terms
    payment_term_months INTEGER DEFAULT 3,
    monthly_payment DECIMAL(10,2),

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT,

    CONSTRAINT chk_bill_amount CHECK (bill_amount >= 500 AND bill_amount <= 850),
    CONSTRAINT chk_risk_score CHECK (risk_score >= 0 AND risk_score <= 100)
);

CREATE INDEX idx_applications_user ON applications(user_id);
CREATE INDEX idx_applications_provider ON applications(provider_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_created ON applications(created_at);

-- =============================================
-- PAYMENT TABLES
-- =============================================

-- Payment Plans
CREATE TABLE payment_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Plan Details
    total_amount DECIMAL(10,2) NOT NULL,
    monthly_amount DECIMAL(10,2) NOT NULL,
    number_of_payments INTEGER NOT NULL DEFAULT 3,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, completed, defaulted, cancelled

    -- Dates
    start_date DATE NOT NULL,
    first_payment_date DATE NOT NULL,
    completion_date DATE,

    -- Tracking
    payments_made INTEGER DEFAULT 0,
    total_paid DECIMAL(10,2) DEFAULT 0.00,
    outstanding_balance DECIMAL(10,2),

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_plans_application ON payment_plans(application_id);
CREATE INDEX idx_payment_plans_user ON payment_plans(user_id);
CREATE INDEX idx_payment_plans_status ON payment_plans(status);

-- Individual Payments
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES payment_plans(plan_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Payment Details
    payment_number INTEGER NOT NULL, -- 1, 2, or 3
    amount DECIMAL(10,2) NOT NULL,
    due_date DATE NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled, processing, paid, failed, overdue
    payment_date TIMESTAMP,

    -- Debit Order
    debit_order_reference VARCHAR(100),
    debit_order_status VARCHAR(20), -- submitted, successful, failed, reversed

    -- Fees
    late_fee DECIMAL(10,2) DEFAULT 0.00,
    admin_fee DECIMAL(10,2) DEFAULT 0.00,

    -- Failure Handling
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_date DATE,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_payment_number CHECK (payment_number BETWEEN 1 AND 3)
);

CREATE INDEX idx_payments_plan ON payments(plan_id);
CREATE INDEX idx_payments_user ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_due_date ON payments(due_date);

-- Payment Transactions (Ledger)
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(payment_id),
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Transaction Details
    transaction_type VARCHAR(30) NOT NULL, -- debit_order, manual_payment, refund, fee, reversal
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'ZAR',

    -- Status
    status VARCHAR(20) NOT NULL, -- pending, completed, failed, reversed

    -- Banking
    bank_reference VARCHAR(100),
    external_reference VARCHAR(100),

    -- Metadata
    description TEXT,
    notes TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

CREATE INDEX idx_transactions_payment ON transactions(payment_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);

-- =============================================
-- COLLECTIONS & RECOVERY
-- =============================================

-- Collections Cases
CREATE TABLE collections (
    collection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(payment_id),
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Case Details
    amount_outstanding DECIMAL(10,2) NOT NULL,
    days_overdue INTEGER NOT NULL,
    collection_stage VARCHAR(20) NOT NULL, -- early, reminder, final_notice, legal

    -- Actions
    last_contact_date DATE,
    next_action_date DATE,
    contact_attempts INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, in_progress, resolved, written_off
    resolution_type VARCHAR(30), -- paid, payment_plan, written_off
    resolution_date TIMESTAMP,

    -- Assignment
    assigned_to VARCHAR(100),
    assigned_date TIMESTAMP,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collections_payment ON collections(payment_id);
CREATE INDEX idx_collections_user ON collections(user_id);
CREATE INDEX idx_collections_status ON collections(status);
CREATE INDEX idx_collections_stage ON collections(collection_stage);

-- Collection Actions Log
CREATE TABLE collection_actions (
    action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES collections(collection_id),

    -- Action Details
    action_type VARCHAR(30) NOT NULL, -- sms, email, call, letter, legal_notice
    action_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    performed_by VARCHAR(100),

    -- Content
    subject VARCHAR(255),
    message TEXT,

    -- Response
    response_received BOOLEAN DEFAULT false,
    response_date TIMESTAMP,
    response_notes TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_collection_actions_collection ON collection_actions(collection_id);
CREATE INDEX idx_collection_actions_type ON collection_actions(action_type);

-- =============================================
-- PROVIDER SETTLEMENTS
-- =============================================

-- Provider Settlements
CREATE TABLE settlements (
    settlement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(provider_id),

    -- Settlement Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Amounts
    gross_amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    net_amount DECIMAL(10,2) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, paid
    approved_by VARCHAR(100),
    approved_date TIMESTAMP,
    payment_date TIMESTAMP,
    payment_reference VARCHAR(100),

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_settlements_provider ON settlements(provider_id);
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_period ON settlements(period_start, period_end);

-- Settlement Line Items
CREATE TABLE settlement_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES settlements(settlement_id),
    application_id UUID NOT NULL REFERENCES applications(application_id),

    -- Item Details
    patient_name VARCHAR(255),
    treatment_date DATE,
    bill_amount DECIMAL(10,2) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    net_amount DECIMAL(10,2) NOT NULL,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_settlement_items_settlement ON settlement_items(settlement_id);
CREATE INDEX idx_settlement_items_application ON settlement_items(application_id);

-- =============================================
-- NOTIFICATIONS & COMMUNICATIONS
-- =============================================

-- Notifications
CREATE TABLE notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),

    -- Notification Details
    type VARCHAR(30) NOT NULL, -- payment_reminder, payment_success, payment_failed, application_approved
    channel VARCHAR(20) NOT NULL, -- sms, email, push, in_app

    -- Content
    subject VARCHAR(255),
    message TEXT NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,

    -- Metadata
    related_entity_type VARCHAR(30), -- application, payment, collection
    related_entity_id UUID,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- =============================================
-- AUDIT & COMPLIANCE
-- =============================================

-- Audit Log
CREATE TABLE audit_log (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Entity
    entity_type VARCHAR(50) NOT NULL, -- user, application, payment, etc.
    entity_id UUID NOT NULL,

    -- Action
    action VARCHAR(50) NOT NULL, -- create, update, delete, approve, decline
    performed_by UUID, -- user_id or system
    performed_by_type VARCHAR(20), -- user, system, admin

    -- Changes
    old_values JSONB,
    new_values JSONB,

    -- Context
    ip_address INET,
    user_agent TEXT,

    -- Audit
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- POPIA Compliance Log
CREATE TABLE popia_access_log (
    access_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Access Details
    user_id UUID REFERENCES users(user_id),
    data_subject_id UUID NOT NULL, -- The user whose data was accessed
    accessed_by UUID NOT NULL, -- Staff/admin who accessed

    -- Purpose
    access_purpose VARCHAR(100) NOT NULL,
    access_type VARCHAR(30) NOT NULL, -- view, update, export, delete

    -- Data
    tables_accessed TEXT[], -- Array of table names
    fields_accessed TEXT[], -- Array of field names

    -- Justification
    justification TEXT NOT NULL,

    -- Audit
    access_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address INET
);

CREATE INDEX idx_popia_data_subject ON popia_access_log(data_subject_id);
CREATE INDEX idx_popia_accessed_by ON popia_access_log(accessed_by);
CREATE INDEX idx_popia_timestamp ON popia_access_log(access_timestamp);

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Active Payment Plans Summary
CREATE VIEW vw_active_payment_plans AS
SELECT
    pp.plan_id,
    pp.user_id,
    u.full_name,
    u.email,
    u.cell_number,
    pp.total_amount,
    pp.monthly_amount,
    pp.payments_made,
    pp.outstanding_balance,
    pp.status,
    pp.first_payment_date,
    a.provider_name,
    a.treatment_type
FROM payment_plans pp
JOIN users u ON pp.user_id = u.user_id
JOIN applications a ON pp.application_id = a.application_id
WHERE pp.status = 'active';

-- Overdue Payments
CREATE VIEW vw_overdue_payments AS
SELECT
    p.payment_id,
    p.user_id,
    u.full_name,
    u.email,
    u.cell_number,
    p.amount,
    p.due_date,
    CURRENT_DATE - p.due_date AS days_overdue,
    p.late_fee,
    p.status,
    pp.plan_id
FROM payments p
JOIN users u ON p.user_id = u.user_id
JOIN payment_plans pp ON p.plan_id = pp.plan_id
WHERE p.status IN ('overdue', 'failed')
  AND p.due_date < CURRENT_DATE;

-- Provider Performance
CREATE VIEW vw_provider_performance AS
SELECT
    pr.provider_id,
    pr.provider_name,
    pr.provider_group,
    COUNT(DISTINCT a.application_id) AS total_applications,
    COUNT(DISTINCT CASE WHEN a.status = 'approved' THEN a.application_id END) AS approved_applications,
    SUM(CASE WHEN a.status = 'approved' THEN a.approved_amount ELSE 0 END) AS total_approved_amount,
    AVG(CASE WHEN a.status = 'approved' THEN a.risk_score END) AS avg_risk_score
FROM providers pr
LEFT JOIN applications a ON pr.provider_id = a.provider_id
GROUP BY pr.provider_id, pr.provider_name, pr.provider_group;

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_banking_updated_at BEFORE UPDATE ON banking_details
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_plans_updated_at BEFORE UPDATE ON payment_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Calculate outstanding balance on payment plan updates
CREATE OR REPLACE FUNCTION calculate_outstanding_balance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.outstanding_balance = NEW.total_amount - NEW.total_paid;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_plan_balance BEFORE UPDATE ON payment_plans
    FOR EACH ROW EXECUTE FUNCTION calculate_outstanding_balance();
