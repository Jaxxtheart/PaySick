-- =============================================
-- Migration 013: Care Agent governed actions (v1.18.0)
--
-- Every write the Care Agent makes after the first conversation (accept
-- an offer, pay an instalment, promise to pay, send a request to the team)
-- goes through one proposal row here. See
-- services/care-agent-action-executor.service.js for the state machine:
--
--   awaiting_consent -> confirming -> executed | lodged | refused | failed
--   awaiting_consent -> declined | expired
--
-- `params` holds the figures PaySick computed when the proposal was made.
-- On confirm the executor recomputes them from live data and refuses if an
-- amount changed, so a patient never consents to one figure and pays
-- another. Rows are never deleted: with care_agent_audit_log they are the
-- record of what the agent prepared and what the patient decided.
-- =============================================

CREATE TABLE IF NOT EXISTS care_agent_action_proposals (
  proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES care_agent_sessions(session_id),
  user_id UUID NOT NULL REFERENCES users(user_id),

  action_type VARCHAR(50) NOT NULL,
  authority VARCHAR(20) NOT NULL CHECK (authority IN ('patient_consent', 'human_review')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent_text TEXT,
  effect TEXT,
  proposed_by VARCHAR(10) NOT NULL CHECK (proposed_by IN ('agent', 'patient')),

  status VARCHAR(20) NOT NULL DEFAULT 'awaiting_consent' CHECK (status IN (
    'awaiting_consent', 'confirming', 'executed', 'lodged', 'declined', 'expired', 'refused', 'failed'
  )),
  result JSONB,

  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_care_agent_proposals_session ON care_agent_action_proposals (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_care_agent_proposals_pending ON care_agent_action_proposals (user_id) WHERE status = 'awaiting_consent';

-- Requests the team decides now carry the full proposal (preview figures,
-- preferred day, reason) and a link to the staff review case.
ALTER TABLE care_agent_manage_requests
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_queue_id INTEGER REFERENCES manual_review_queue(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
