-- =========================================================================
-- MIGRATION 007: Shield Framework v5.0 Controls
-- Segment 1 Tariff Billing Risk Controls
-- =========================================================================

-- system_config table (for payout percentages)
CREATE TABLE IF NOT EXISTS system_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert config values
INSERT INTO system_config (key, value, description) VALUES
  ('provisional_payout_percent', '80', 'Provisional payout as % of approved facilitation amount (Segment 1)'),
  ('final_payout_percent_max', '20', 'Maximum final payout as % of approved facilitation amount (Segment 1)'),
  ('eob_submission_deadline_days', '30', 'Days from procedure date by which provider must submit EOB'),
  ('eob_overdue_chase_days', '7', 'Days after deadline to trigger chase notification'),
  ('segment1_minimum_deposit_percent', '10', 'Minimum deposit % for Segment 1 gap financing')
ON CONFLICT (key) DO NOTHING;

-- DSP registry cache
CREATE TABLE IF NOT EXISTS dsp_registry (
  id SERIAL PRIMARY KEY,
  provider_hpcsa_number VARCHAR(20) NOT NULL,
  scheme_code VARCHAR(20) NOT NULL,
  plan_codes TEXT[],
  dsp_effective_from DATE,
  dsp_effective_to DATE,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(50),
  UNIQUE (provider_hpcsa_number, scheme_code)
);
CREATE INDEX IF NOT EXISTS idx_dsp_registry_lookup ON dsp_registry (provider_hpcsa_number, scheme_code);

-- Add DSP columns to applications table
DO $$ BEGIN
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS segment VARCHAR(20) DEFAULT 'SEGMENT_2';
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS dsp_verified_at TIMESTAMPTZ;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS dsp_status VARCHAR(20);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS dsp_verification_source VARCHAR(50);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS conservative_gap_applied BOOLEAN DEFAULT FALSE;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS dsp_check_scheme_code VARCHAR(20);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS dsp_check_plan_code VARCHAR(30);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS facilitation_ceiling DECIMAL(12,2);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS provider_submitted_amount DECIMAL(12,2);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS on_manual_hold BOOLEAN DEFAULT FALSE;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS hold_reason TEXT;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS tariff_disclosure_id INTEGER;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS disclosure_acknowledged BOOLEAN DEFAULT FALSE;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS provisional_payout_id INTEGER;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS final_payout_id INTEGER;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS eob_submission_id INTEGER;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS payout_model VARCHAR(20) DEFAULT 'TWO_STAGE';
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS provider_hpcsa_number VARCHAR(20);
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS above_30pct_threshold BOOLEAN DEFAULT FALSE;
  ALTER TABLE applications ADD COLUMN IF NOT EXISTS procedure_date DATE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Procedure benchmarks
CREATE TABLE IF NOT EXISTS procedure_benchmarks (
  id SERIAL PRIMARY KEY,
  procedure_code VARCHAR(20) NOT NULL,
  procedure_name VARCHAR(200) NOT NULL,
  specialty VARCHAR(100),
  metro_region VARCHAR(50),
  benchmark_cost_100pct DECIMAL(12,2) NOT NULL,
  benchmark_source VARCHAR(100),
  effective_from DATE NOT NULL,
  effective_to DATE,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by VARCHAR(100),
  UNIQUE (procedure_code, metro_region, effective_from)
);
CREATE INDEX IF NOT EXISTS idx_benchmark_lookup ON procedure_benchmarks (procedure_code, metro_region) WHERE effective_to IS NULL;

-- Facilitation ceiling calculations
CREATE TABLE IF NOT EXISTS facilitation_ceiling_calculations (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL,
  procedure_code VARCHAR(20),
  benchmark_cost_100pct DECIMAL(12,2),
  patient_plan_coverage_multiplier DECIMAL(4,2),
  calculated_ceiling DECIMAL(12,2) NOT NULL,
  provider_submitted_amount DECIMAL(12,2),
  variance_percent DECIMAL(6,2),
  above_30pct_threshold BOOLEAN DEFAULT FALSE,
  hold_triggered BOOLEAN DEFAULT FALSE,
  hold_reason TEXT,
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  review_decision VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider billing agreements
CREATE TABLE IF NOT EXISTS provider_billing_agreements (
  id SERIAL PRIMARY KEY,
  provider_id UUID NOT NULL,
  agreement_version VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING_SIGNATURE',
  billing_cap_multiplier DECIMAL(4,2) DEFAULT 3.00,
  signed_at TIMESTAMPTZ,
  signed_by_name VARCHAR(200),
  signed_by_role VARCHAR(100),
  effective_from DATE NOT NULL,
  effective_to DATE,
  suspension_reason TEXT,
  suspended_at TIMESTAMPTZ,
  suspended_by VARCHAR(100),
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add gap financing fields to providers
DO $$ BEGIN
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS gap_financing_enabled BOOLEAN DEFAULT FALSE;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS billing_agreement_id INTEGER;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS billing_agreement_checked_at TIMESTAMPTZ;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS hpcsa_number VARCHAR(20);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Tariff disclosures
CREATE TABLE IF NOT EXISTS tariff_disclosures (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  disclosure_version VARCHAR(10) NOT NULL,
  disclosure_text TEXT NOT NULL,
  dsp_status_at_disclosure VARCHAR(20),
  estimated_gap_at_disclosure DECIMAL(12,2),
  provider_amount_at_disclosure DECIMAL(12,2),
  benchmark_at_disclosure DECIMAL(12,2),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledgement_method VARCHAR(30),
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_id VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider bank accounts (referenced by payout_stages)
CREATE TABLE IF NOT EXISTS provider_bank_accounts (
  id SERIAL PRIMARY KEY,
  provider_id UUID NOT NULL,
  bank_name VARCHAR(100),
  account_number_encrypted TEXT,
  branch_code VARCHAR(6),
  account_holder VARCHAR(200),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payout stages
CREATE TABLE IF NOT EXISTS payout_stages (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  stage VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  scheduled_amount DECIMAL(12,2) NOT NULL,
  actual_amount_paid DECIMAL(12,2),
  triggered_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_reference VARCHAR(100),
  bank_account_id INTEGER,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EOB submissions
CREATE TABLE IF NOT EXISTS eob_submissions (
  id SERIAL PRIMARY KEY,
  application_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ,
  submitted_by VARCHAR(100),
  provider_invoice_amount DECIMAL(12,2),
  provider_invoice_url TEXT,
  scheme_eob_amount DECIMAL(12,2),
  scheme_residual_amount DECIMAL(12,2),
  eob_document_url TEXT,
  reconciliation_status VARCHAR(20) DEFAULT 'PENDING',
  reconciled_at TIMESTAMPTZ,
  reconciled_by VARCHAR(100),
  final_payout_amount DECIMAL(12,2),
  variance_from_approved DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Manual review queue
CREATE TABLE IF NOT EXISTS manual_review_queue (
  id SERIAL PRIMARY KEY,
  application_id UUID,
  provider_id UUID,
  review_type VARCHAR(50) NOT NULL,
  priority VARCHAR(10) DEFAULT 'STANDARD',
  sla_hours INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'OPEN',
  assigned_to VARCHAR(100),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  sla_deadline TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  resolution_notes TEXT,
  resolution_decision VARCHAR(30)
);
CREATE INDEX IF NOT EXISTS idx_review_queue_open ON manual_review_queue (status, priority, sla_deadline) WHERE status IN ('OPEN', 'IN_PROGRESS');

-- Underwriting audit log
CREATE TABLE IF NOT EXISTS underwriting_audit_log (
  id SERIAL PRIMARY KEY,
  application_id UUID,
  provider_id UUID,
  event_type VARCHAR(100) NOT NULL,
  actor VARCHAR(100),
  input_data JSONB,
  output_decision VARCHAR(50),
  output_data JSONB,
  rule_version VARCHAR(20) DEFAULT 'SHIELD_V5',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_application ON underwriting_audit_log (application_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON underwriting_audit_log (created_at DESC);

-- Notification log
CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  application_id UUID,
  recipient_type VARCHAR(20),
  recipient_id VARCHAR(100),
  channel VARCHAR(20),
  template_id VARCHAR(100),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered BOOLEAN DEFAULT FALSE
);

-- Portfolio circuit breaker log
CREATE TABLE IF NOT EXISTS portfolio_circuit_breaker_log (
  id SERIAL PRIMARY KEY,
  breaker_type VARCHAR(50) NOT NULL,
  trigger_metric VARCHAR(100),
  trigger_value DECIMAL(10,4),
  threshold_value DECIMAL(10,4),
  response_action TEXT,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  resolution_notes TEXT
);

-- Messaging queue (if not exists)
CREATE TABLE IF NOT EXISTS messaging_queue (
  id SERIAL PRIMARY KEY,
  recipient_type VARCHAR(20),
  recipient_id VARCHAR(100),
  message_type VARCHAR(100),
  channel VARCHAR(20),
  payload JSONB,
  status VARCHAR(20) DEFAULT 'PENDING',
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
