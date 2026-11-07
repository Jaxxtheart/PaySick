-- =========================================================================
-- MIGRATION 008: /api/v1 API Surface
-- Adds tables for the v1 facilitation pipeline:
--   v1_applications, v1_payouts, v1_instalment_schedules, v1_instalments,
--   provider_holdback_ledger, webhook_events, provider_scoring_snapshot.
--
-- All tables prefixed v1_ to avoid colliding with the legacy applications
-- table and to make this surface independently rollbackable.
-- =========================================================================

-- v1_applications — payment facilitation requests
CREATE TABLE IF NOT EXISTS v1_applications (
  application_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number      VARCHAR(32) UNIQUE NOT NULL,
  patient_id            UUID NOT NULL,
  provider_id           UUID NOT NULL,
  procedure_code        VARCHAR(50),
  procedure_description TEXT,
  procedure_urgency     VARCHAR(20) NOT NULL,
  segment               VARCHAR(20) NOT NULL,
  provider_invoice_amount_cents BIGINT NOT NULL,
  term_months           INTEGER NOT NULL,
  medical_aid_scheme    VARCHAR(50),
  medical_aid_plan      VARCHAR(50),
  scheme_reimbursement_estimate_cents BIGINT,

  status                VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  decision              VARCHAR(20),
  decision_gate         VARCHAR(40),
  decision_reason       TEXT,

  facilitation_amount_cents BIGINT,
  monthly_instalment_cents  BIGINT,
  facilitation_fee_cents    BIGINT,
  mdr_amount_cents          BIGINT,
  tariff_multiple_applied   DECIMAL(6,3),

  affordability_ratio       DECIMAL(6,4),
  affordability_ceiling     DECIMAL(4,3),

  cooling_off_required      BOOLEAN DEFAULT false,
  cooling_off_expires_at    TIMESTAMPTZ,
  dsp_warning_required      BOOLEAN DEFAULT false,
  tariff_disclosure_required BOOLEAN DEFAULT false,

  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_v1_segment CHECK (segment IN ('SEGMENT_1_GAP', 'SEGMENT_2_OOP')),
  CONSTRAINT chk_v1_urgency CHECK (procedure_urgency IN ('ELECTIVE', 'SEMI_URGENT', 'URGENT')),
  CONSTRAINT chk_v1_term CHECK (term_months >= 3 AND term_months <= 36),
  CONSTRAINT chk_v1_status CHECK (status IN ('SUBMITTED', 'APPROVED', 'DECLINED', 'MANUAL_REVIEW', 'COOLING_OFF', 'DISBURSED'))
);

CREATE INDEX IF NOT EXISTS idx_v1_apps_patient ON v1_applications (patient_id);
CREATE INDEX IF NOT EXISTS idx_v1_apps_provider ON v1_applications (provider_id);
CREATE INDEX IF NOT EXISTS idx_v1_apps_status ON v1_applications (status);
CREATE INDEX IF NOT EXISTS idx_v1_apps_reference ON v1_applications (reference_number);

-- v1_payouts — provisional + final disbursement records
CREATE TABLE IF NOT EXISTS v1_payouts (
  payout_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        UUID NOT NULL REFERENCES v1_applications(application_id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL,
  stage                 VARCHAR(20) NOT NULL,
  payout_amount_cents   BIGINT NOT NULL,
  holdback_amount_cents BIGINT NOT NULL DEFAULT 0,
  holdback_percent      DECIMAL(4,2),
  scheduled_disbursement_date DATE,
  scheme_actual_payment_cents BIGINT,
  status                VARCHAR(30) NOT NULL DEFAULT 'PROVISIONAL',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_v1_payout_stage CHECK (stage IN ('PROVISIONAL', 'FINAL'))
);

CREATE INDEX IF NOT EXISTS idx_v1_payouts_app ON v1_payouts (application_id);
CREATE INDEX IF NOT EXISTS idx_v1_payouts_provider ON v1_payouts (provider_id);

-- v1_instalment_schedules — generated when payout stage 1 fires
CREATE TABLE IF NOT EXISTS v1_instalment_schedules (
  schedule_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        UUID NOT NULL REFERENCES v1_applications(application_id) ON DELETE CASCADE,
  reference_number      VARCHAR(32) NOT NULL,
  total_facilitation_amount_cents BIGINT NOT NULL,
  total_facilitation_fee_cents    BIGINT NOT NULL,
  total_repayable_cents BIGINT NOT NULL,
  monthly_instalment_cents BIGINT NOT NULL,
  term_months           INTEGER NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v1_sched_app ON v1_instalment_schedules (application_id);

-- v1_instalments — individual line items
CREATE TABLE IF NOT EXISTS v1_instalments (
  instalment_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           UUID NOT NULL REFERENCES v1_instalment_schedules(schedule_id) ON DELETE CASCADE,
  instalment_number     INTEGER NOT NULL,
  due_date              DATE NOT NULL,
  amount_cents          BIGINT NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  collected_at          TIMESTAMPTZ,
  UNIQUE (schedule_id, instalment_number),
  CONSTRAINT chk_v1_inst_status CHECK (status IN ('PENDING', 'COLLECTED', 'MISSED', 'RESTRUCTURED'))
);

CREATE INDEX IF NOT EXISTS idx_v1_inst_schedule ON v1_instalments (schedule_id);
CREATE INDEX IF NOT EXISTS idx_v1_inst_status ON v1_instalments (status);

-- provider_holdback_ledger — tracks holdback amounts per payout
CREATE TABLE IF NOT EXISTS provider_holdback_ledger (
  ledger_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL,
  application_id        UUID NOT NULL,
  payout_id             UUID,
  holdback_amount_cents BIGINT NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'HELD',
  held_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at           TIMESTAMPTZ,
  release_reason        TEXT,
  CONSTRAINT chk_holdback_status CHECK (status IN ('HELD', 'RELEASED', 'FORFEIT'))
);

CREATE INDEX IF NOT EXISTS idx_holdback_provider ON provider_holdback_ledger (provider_id, status);

-- webhook_events — fan-out queue for downstream subscribers
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id              BIGSERIAL PRIMARY KEY,
  event_name            VARCHAR(80) NOT NULL,
  payload               JSONB NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts              INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,
  delivered_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_webhook_status CHECK (status IN ('PENDING', 'DELIVERED', 'FAILED', 'DEAD'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_pending ON webhook_events (status, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_webhook_name ON webhook_events (event_name);

-- provider_scoring_snapshot — read model consumed by nightly scoring job
CREATE TABLE IF NOT EXISTS provider_scoring_snapshot (
  provider_id           UUID PRIMARY KEY,
  status                VARCHAR(20),
  tier                  VARCHAR(20),
  applications_90d      INTEGER NOT NULL DEFAULT 0,
  pd_rate_90d           DECIMAL(6,4) NOT NULL DEFAULT 0,
  refreshed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- providers — tier + scoring columns (idempotent)
DO $$ BEGIN
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'NEW';
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS scoring_updated_at TIMESTAMPTZ;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS holdback_applications_remaining INTEGER DEFAULT 20;
  ALTER TABLE providers ADD COLUMN IF NOT EXISTS payout_delay_days INTEGER DEFAULT 5;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
