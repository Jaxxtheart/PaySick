-- =========================================================================
-- MIGRATION 010: Recovery Engine — Collections Capability
--
-- Extends the existing `collections` table (schema.sql) with governance
-- gate tracking, and adds the case-lifecycle child tables the PaySick
-- Recovery Engine needs so a medical provider never has to build a
-- collections desk of its own: promise-to-pay, restructure offers,
-- credit bureau submissions, and rare external referrals.
--
-- See: backend/src/services/recovery-engine.service.js
--      backend/src/services/promise-to-pay.service.js
--      backend/src/services/restructure-offer.service.js
--      backend/src/services/bureau-reporting.service.js
--      backend/src/services/external-referral.service.js
-- =========================================================================

-- Human Review & Compliance gate — mandatory from Day 30 (recovery-engine
-- .service.js HUMAN_REVIEW_THRESHOLD_DAYS). Every gated decision on a case
-- is logged here, same discipline as human-review.service.js.
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS gate_required     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS human_reviewed_by VARCHAR(100);

-- Promise-to-pay — self-service commitments captured through the Early/Mid
-- Collections patient portal (promise-to-pay.service.js).
CREATE TABLE IF NOT EXISTS promise_to_pay (
    promise_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id          UUID NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,

    promised_amount_cents  INTEGER NOT NULL,
    promised_date          DATE NOT NULL,

    status                 VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, kept, broken

    created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at            TIMESTAMP
);

CREATE INDEX idx_promise_to_pay_collection ON promise_to_pay(collection_id);

-- Restructure offers — Mid/Late Collections offers, capped at the shared
-- 25% cost-increase rule (backend/src/utils/restructure-policy.js).
CREATE TABLE IF NOT EXISTS restructure_offers (
    offer_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id             UUID NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,

    new_term_months           INTEGER NOT NULL,
    new_monthly_amount_cents  INTEGER NOT NULL,
    cost_increase_pct         NUMERIC(6,4) NOT NULL,

    status                    VARCHAR(20) NOT NULL DEFAULT 'offered', -- offered, accepted, declined
    approved_by                VARCHAR(100), -- Human Review sign-off (mandatory ≥ Day 30)

    created_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at                 TIMESTAMP
);

CREATE INDEX idx_restructure_offers_collection ON restructure_offers(collection_id);

-- Credit bureau submissions — the strongest recovery lever for a book with
-- a ≤R850 average facility (bureau-reporting.service.js). Reported once,
-- logged permanently; never deleted.
CREATE TABLE IF NOT EXISTS bureau_reports (
    report_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id                UUID NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,

    submission_id                VARCHAR(64) NOT NULL,
    days_overdue_at_submission   INTEGER NOT NULL,

    submitted_at                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bureau_reports_collection ON bureau_reports(collection_id);

-- External referrals — registered debt collector / attorney handover.
-- Rare by design (external-referral.service.js proportionality rule);
-- always requires a recorded human approval.
CREATE TABLE IF NOT EXISTS external_referrals (
    referral_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id              UUID NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,

    partner_type                VARCHAR(30) NOT NULL, -- registered_debt_collector, attorney
    outstanding_amount_cents    INTEGER NOT NULL,
    human_approved_by           VARCHAR(100) NOT NULL,

    referred_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_external_referrals_collection ON external_referrals(collection_id);
