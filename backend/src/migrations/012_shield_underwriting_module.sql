-- =========================================================================
-- 012 — Shield Underwriting Module
--
-- 1. Creates the tables the Shield decision route read but no migration ever
--    created (patient_income_verification, portfolio_metrics), and the
--    provider_scoring_snapshot columns it queried. Their absence made the
--    old engine silently pass concentration, provider and portfolio checks.
-- 2. Adds the immutable decision log and performance-event tables that make
--    the Medical Risk Score trainable: every decision stores its input,
--    feature vector, policy and model versions; every repayment outcome is
--    labelled against the fixed outcome definition.
-- 3. Adds a model registry table for MRS champion/challenger governance.
-- Idempotent.
-- =========================================================================

-- ── Verified income (3+ months of evidence per verification) ─────────────
CREATE TABLE IF NOT EXISTS patient_income_verification (
  verification_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id                   UUID NOT NULL,
  method                       VARCHAR(40) NOT NULL,
  verified_at                  TIMESTAMPTZ NOT NULL,
  months                       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{grossCents, netCents}]
  observed_debit_orders_cents  BIGINT,
  declared_obligations_cents   BIGINT,
  declared_expenses_cents      BIGINT,
  source_name                  VARCHAR(60) NOT NULL,
  is_mock                      BOOLEAN NOT NULL DEFAULT false,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_piv_method CHECK (method IN
    ('OPEN_BANKING', 'BANK_STATEMENT', 'PAYSLIP_AND_BANK_STATEMENT', 'MANUAL_REVIEW', 'SELF_DECLARED'))
);
CREATE INDEX IF NOT EXISTS idx_piv_patient_time ON patient_income_verification (patient_id, verified_at DESC);

-- ── Portfolio metrics snapshot (circuit-breaker inputs) ──────────────────
CREATE TABLE IF NOT EXISTS portfolio_metrics (
  snapshot_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_outstanding_cents      BIGINT NOT NULL,
  active_arrangements          INTEGER NOT NULL,
  arrears_30_rate              DECIMAL(6,4) NOT NULL,
  balance_sheet_share          DECIMAL(6,4) NOT NULL,
  reserve_fund_cents           BIGINT NOT NULL,
  monthly_fee_income_cents     BIGINT NOT NULL,
  gap_tariff_flagged_rate      DECIMAL(6,4) NOT NULL DEFAULT 0,
  procedure_type_outstanding   JSONB NOT NULL DEFAULT '{}'::jsonb   -- {procedureType: cents}
);
CREATE INDEX IF NOT EXISTS idx_portfolio_metrics_time ON portfolio_metrics (snapshot_at DESC);

-- ── Provider verification + scoring columns ──────────────────────────────
DO $$ BEGIN
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS hpcsa_verified BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS practice_number_verified BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS bank_account_verified BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS verification_checked_at TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS billing_agreement_signed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS arrangements_90d INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS missed_90d_rate DECIMAL(6,4) NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS fpd_sample INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS fpd_rate DECIMAL(6,4) NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS dispute_rate DECIMAL(6,4) NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS complaints_30d INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS cost_variance_vs_benchmark DECIMAL(6,4);
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS monthly_volume_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_scoring_snapshot ADD COLUMN IF NOT EXISTS outstanding_cents BIGINT NOT NULL DEFAULT 0;

-- ── v1 applications: fields the MRS clinical pillar needs ────────────────
ALTER TABLE v1_applications ADD COLUMN IF NOT EXISTS procedure_type VARCHAR(60);
ALTER TABLE v1_applications ADD COLUMN IF NOT EXISTS procedure_category VARCHAR(30);
ALTER TABLE v1_applications ADD COLUMN IF NOT EXISTS booking_lead_days INTEGER;
ALTER TABLE v1_applications ADD COLUMN IF NOT EXISTS shield_decision_id UUID;

-- ── Immutable decision log (audit, replay, MRS training data) ────────────
CREATE TABLE IF NOT EXISTS shield_decisions (
  decision_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id     UUID,
  patient_id         UUID,
  provider_id        UUID,
  channel            VARCHAR(20) NOT NULL,                 -- V1_API | MARKETPLACE
  decision           VARCHAR(30) NOT NULL,
  decisive_stage     VARCHAR(30),
  hard_decline       BOOLEAN NOT NULL DEFAULT false,
  reason_codes       JSONB NOT NULL,
  pd_12m             DECIMAL(8,6),
  mrs_score          INTEGER,
  mrs_grade          CHAR(1),
  provider_grade     VARCHAR(4),
  policy_version     VARCHAR(80) NOT NULL,
  model_id           VARCHAR(80) NOT NULL,
  registry_version   VARCHAR(40) NOT NULL,
  evaluated_at       TIMESTAMPTZ NOT NULL,
  input_hash         CHAR(64) NOT NULL,
  outcome_hash       CHAR(64) NOT NULL,
  record             JSONB NOT NULL,                       -- full buildDecisionRecord() output
  human_decision     VARCHAR(20),
  human_decision_by  UUID,
  human_decision_at  TIMESTAMPTZ,
  human_decision_reason TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shield_decisions_app ON shield_decisions (application_id);
CREATE INDEX IF NOT EXISTS idx_shield_decisions_review ON shield_decisions (decision, human_decision) WHERE decision = 'REFER';
CREATE INDEX IF NOT EXISTS idx_shield_decisions_model ON shield_decisions (model_id, evaluated_at);

-- Decision rows are append-only; only the human-review columns may change.
CREATE OR REPLACE FUNCTION shield_decisions_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.record IS DISTINCT FROM OLD.record
     OR NEW.input_hash IS DISTINCT FROM OLD.input_hash
     OR NEW.outcome_hash IS DISTINCT FROM OLD.outcome_hash
     OR NEW.decision IS DISTINCT FROM OLD.decision THEN
    RAISE EXCEPTION 'shield_decisions rows are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shield_decisions_guard ON shield_decisions;
CREATE TRIGGER trg_shield_decisions_guard BEFORE UPDATE ON shield_decisions
  FOR EACH ROW EXECUTE FUNCTION shield_decisions_guard();

-- ── Performance events (outcome labels for the MRS) ──────────────────────
CREATE TABLE IF NOT EXISTS shield_performance_events (
  event_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id        UUID NOT NULL REFERENCES shield_decisions(decision_id),
  application_id     UUID,
  event_type         VARCHAR(40) NOT NULL,   -- INSTALMENT_PAID | INSTALMENT_MISSED | DPD_30 | DPD_60 | DPD_90 | SETTLED | DISPUTED | RECOVERY
  months_on_book     INTEGER NOT NULL,
  days_past_due      INTEGER NOT NULL DEFAULT 0,
  amount_cents       BIGINT,
  occurred_at        TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shield_perf_decision ON shield_performance_events (decision_id, occurred_at);

-- ── MRS model registry (governance record of each model version) ─────────
CREATE TABLE IF NOT EXISTS shield_model_registry (
  model_id           VARCHAR(80) PRIMARY KEY,
  stage              VARCHAR(30) NOT NULL,   -- EXPERT_PRIOR | INTERCEPT_RECALIBRATION | CHALLENGER | CHAMPION | RETIRED
  role               VARCHAR(20) NOT NULL,   -- CHAMPION | CHALLENGER | RETIRED
  definition         JSONB NOT NULL,
  validation_evidence JSONB,
  approved_by        VARCHAR(120),
  effective_from     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at         TIMESTAMPTZ
);

INSERT INTO shield_model_registry (model_id, stage, role, definition)
VALUES ('MRS-EXPERT-0.1.0', 'EXPERT_PRIOR', 'CHAMPION',
        '{"source": "backend/src/shield/medical-risk-score/models.js", "calibrated": false}'::jsonb)
ON CONFLICT (model_id) DO NOTHING;
