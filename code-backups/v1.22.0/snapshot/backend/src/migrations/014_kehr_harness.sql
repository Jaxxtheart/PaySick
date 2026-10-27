-- =============================================
-- Migration 014: Kehr harness, Journey A (v1.21.0)
--
-- Pre-approval before treatment. See services/kehr-preapproval-flow.service.js.
--
--   kehr_consents      one revocable consent per data source, with the exact
--                      purpose text the patient agreed to (POPIA s18, s26)
--   kehr_preapprovals  what the patient asked for, the figures read from
--                      their documents (never the files), the verified facts
--                      used and the full assessment (backend only)
--   kehr_passes        the pass: code, ceiling, max term, expiry
--   kehr_plan_links    provider-sent links; the bill lives here, the signed
--                      token carries only an id and a phone hash
--
-- Decisions are also written to underwriting_audit_log (rule_version
-- RISK_v1.1) and cases for a person go to manual_review_queue, the same
-- tables Shield uses. Amounts are integer cents. Rows are never deleted.
-- =============================================

CREATE TABLE IF NOT EXISTS kehr_consents (
  consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  source VARCHAR(40) NOT NULL CHECK (source IN (
    'bank_income_once', 'bank_payday_sync', 'scheme_cover', 'health_history',
    'bureau', 'provider_share', 'document_upload'
  )),
  purpose_agreed TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kehr_consents_user ON kehr_consents (user_id, source);

CREATE TABLE IF NOT EXISTS kehr_preapprovals (
  preapproval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  procedure_code VARCHAR(100),
  estimate_cents BIGINT NOT NULL CHECK (estimate_cents > 0),
  urgency VARCHAR(10) NOT NULL CHECK (urgency IN ('elective', 'planned', 'urgent')),
  scheme JSONB,
  documents JSONB NOT NULL DEFAULT '{}'::jsonb,
  facts JSONB,
  assessment JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'collecting' CHECK (status IN (
    'collecting', 'not_needed', 'below_minimum', 'pre_approved', 'review', 'declined'
  )),
  assessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kehr_preapprovals_user ON kehr_preapprovals (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kehr_passes (
  pass_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preapproval_id UUID NOT NULL REFERENCES kehr_preapprovals(preapproval_id),
  user_id UUID NOT NULL REFERENCES users(user_id),
  code VARCHAR(7) NOT NULL UNIQUE,
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'expired', 'withdrawn')),
  ceiling_cents BIGINT NOT NULL CHECK (ceiling_cents > 0),
  max_term_months INTEGER NOT NULL,
  indicative_monthly_cents BIGINT NOT NULL,
  shortfall_cents BIGINT NOT NULL,
  covers_shortfall BOOLEAN NOT NULL,
  model_version VARCHAR(10) NOT NULL,
  gates_pending JSONB NOT NULL DEFAULT '[]'::jsonb,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  cooling_off_ends_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kehr_passes_active ON kehr_passes (user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS kehr_plan_links (
  link_id UUID PRIMARY KEY,
  provider_id UUID NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  bill_total_cents BIGINT,
  procedure_code VARCHAR(100),
  status VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'redeemed')),
  outcome VARCHAR(12),
  redeemed_by UUID REFERENCES users(user_id),
  redeemed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kehr_plan_links_provider ON kehr_plan_links (provider_id, created_at DESC);
