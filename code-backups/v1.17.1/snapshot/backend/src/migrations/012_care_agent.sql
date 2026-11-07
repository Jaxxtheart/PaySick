-- =============================================
-- Migration 012: PaySick Care Agent
--
-- Backing tables for the AI-native Care Agent conversational surface
-- (backend/src/routes/care-agent.js). The Care Agent itself performs no
-- deterministic financial calculation of its own beyond what it reuses
-- from existing services (fee.service.js, patient-gate.service.js via
-- utils/affordability-policy.js) — these tables exist to hold the
-- conversation's running state and a full audit trail of every extraction,
-- confirmation, approval and execution, per the "always preserve an audit
-- trail" product principle.
--
-- care_agent_sessions.application_id deliberately has no foreign key: the
-- Care Agent hands its assembled payload to the existing, unchanged
-- POST /api/marketplace/applications endpoint (see routes/care-agent.js's
-- /approve handler) rather than writing to loan_applications itself, so
-- this column just records the id that endpoint returns.
-- =============================================

CREATE TABLE IF NOT EXISTS care_agent_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id),
  stage VARCHAR(20) NOT NULL DEFAULT 'need', -- need | understand | construct | approve | execute | manage
  structured_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  selected_term_months INTEGER,
  application_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_care_agent_sessions_user ON care_agent_sessions (user_id, created_at DESC);

-- Full audit trail: every extraction, question, confirmation, approval and
-- execution is written here so the conversation is traceable end to end.
CREATE TABLE IF NOT EXISTS care_agent_audit_log (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES care_agent_sessions(session_id),
  event_type VARCHAR(50) NOT NULL,
  actor VARCHAR(20) NOT NULL, -- 'patient' | 'agent' | 'system'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_care_agent_audit_session ON care_agent_audit_log (session_id, created_at ASC);

-- Stage 6 (Manage) requests the Care Agent cannot execute itself — e.g. a
-- payment-date change. Logged for human follow-up rather than silently
-- actioned, per the "separate recommendations from decisions" principle.
CREATE TABLE IF NOT EXISTS care_agent_manage_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES care_agent_sessions(session_id),
  request_type VARCHAR(50) NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_care_agent_manage_requests_open ON care_agent_manage_requests (status) WHERE status = 'OPEN';
