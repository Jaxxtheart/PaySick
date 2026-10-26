-- =============================================
-- Migration 008: Daily Provider Outreach Agent
--
-- Additive, non-destructive. Adds the pre-onboarding provider-acquisition
-- pipeline used by the daily outreach agent. These tables REFERENCE the
-- existing providers(provider_id) entity — a target practice becomes a real
-- PaySick provider once it signs & onboards. No existing column is altered.
--
-- Conventions match the rest of the schema: UUID PKs via gen_random_uuid(),
-- TIMESTAMP (not timestamptz), VARCHAR/TEXT, CREATE ... IF NOT EXISTS so the
-- startup migration runner can re-apply safely.
-- =============================================

-- ─── Pre-onboarding lifecycle record for a target practice ───────────────────
CREATE TABLE IF NOT EXISTS outreach_providers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id        UUID REFERENCES providers(provider_id),  -- set once they sign & onboard
    practice_name      VARCHAR(255) NOT NULL,
    vertical           VARCHAR(50)  NOT NULL,                   -- aesthetics|fertility|dental|ophthalmology|orthopaedics|...
    source             VARCHAR(50)  NOT NULL,                   -- google_places|referral|manual|channel_partner
    place_id           VARCHAR(255) UNIQUE,                     -- dedupe key for Places-sourced leads
    contact_name       VARCHAR(255),
    email              VARCHAR(255),                            -- public business email only
    phone              VARCHAR(30),
    website            TEXT,
    metro              VARCHAR(100),
    address            TEXT,
    rating             NUMERIC,                                 -- Places proxy for establishment
    ratings_count      INT,
    fit_score          NUMERIC NOT NULL DEFAULT 0,
    stage              VARCHAR(30) NOT NULL DEFAULT 'sourced',  -- sourced→enriched→drafted→approved→contacted→replied→demo→signed→live, or disqualified
    consent_basis      VARCHAR(100),
    do_not_contact     BOOLEAN NOT NULL DEFAULT false,
    owner              VARCHAR(255),                            -- founder for now
    next_action_at     TIMESTAMP,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_providers_stage        ON outreach_providers(stage);
CREATE INDEX IF NOT EXISTS idx_outreach_providers_vertical     ON outreach_providers(vertical);
CREATE INDEX IF NOT EXISTS idx_outreach_providers_metro        ON outreach_providers(metro);
CREATE INDEX IF NOT EXISTS idx_outreach_providers_next_action  ON outreach_providers(next_action_at);
CREATE INDEX IF NOT EXISTS idx_outreach_providers_provider_id  ON outreach_providers(provider_id);

-- ─── Every interaction, in either direction (full audit trail) ───────────────
CREATE TABLE IF NOT EXISTS outreach_touches (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id       UUID NOT NULL REFERENCES outreach_providers(id) ON DELETE CASCADE,
    channel           VARCHAR(20) NOT NULL,                     -- email|linkedin|call|visit
    direction         VARCHAR(20) NOT NULL,                     -- outbound|inbound
    sequence_step     INT,                                      -- 0=initial, 1=bump, 2=value, 3=breakup
    subject           TEXT,
    body              TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'draft',     -- draft|compliance_hold|approved|sent|bounced|replied|rejected
    compliance_flags  TEXT[],
    sent_at           TIMESTAMP,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_touches_provider ON outreach_touches(provider_id);
CREATE INDEX IF NOT EXISTS idx_outreach_touches_status   ON outreach_touches(status);

-- ─── One row per daily run, for observability ────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_runs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date          DATE NOT NULL,
    leads_sourced     INT DEFAULT 0,
    drafts_created    INT DEFAULT 0,
    followups_due     INT DEFAULT 0,
    compliance_holds  INT DEFAULT 0,
    errors            JSONB,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_runs_run_date ON outreach_runs(run_date);
