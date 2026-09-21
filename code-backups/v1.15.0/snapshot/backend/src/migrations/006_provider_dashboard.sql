-- =============================================
-- Migration 006: Provider Dashboard
--
-- Adds provider_user_link table (maps user accounts to providers),
-- and dashboard-optimised views for provider self-service analytics.
-- =============================================

-- Link providers to their user accounts (providers log in as users with role='provider')
CREATE TABLE IF NOT EXISTS provider_user_link (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(provider_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_user_link_user ON provider_user_link(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_user_link_provider ON provider_user_link(provider_id);

-- ─── Provider Dashboard: Overview Stats ──────────────────────────────────────

CREATE OR REPLACE VIEW vw_provider_dashboard_overview AS
SELECT
    pr.provider_id,
    COUNT(DISTINCT a.user_id)                                                   AS total_patients,
    COUNT(DISTINCT a.application_id)                                            AS total_applications,
    COALESCE(SUM(CASE WHEN a.status = 'approved' THEN a.approved_amount ELSE 0 END), 0)
                                                                                AS total_revenue,
    COUNT(DISTINCT CASE WHEN pp.status = 'active' THEN pp.plan_id END)         AS active_plans,
    COUNT(DISTINCT CASE WHEN p.status IN ('overdue', 'failed') AND p.due_date < CURRENT_DATE
                         THEN p.payment_id END)                                 AS overdue_count,
    ROUND(AVG(CASE WHEN a.status = 'approved' THEN a.risk_score END), 0)       AS avg_risk_score,
    CASE WHEN COUNT(a.application_id) > 0
         THEN ROUND(
              COUNT(CASE WHEN a.status = 'approved' THEN 1 END)::NUMERIC
              / COUNT(a.application_id) * 100, 2)
         ELSE 0
    END                                                                         AS approval_rate
FROM providers pr
LEFT JOIN applications a  ON pr.provider_id = a.provider_id
LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
LEFT JOIN payments p       ON pp.plan_id = p.plan_id
GROUP BY pr.provider_id;

-- ─── Provider Dashboard: Patient List ────────────────────────────────────────

CREATE OR REPLACE VIEW vw_provider_dashboard_patients AS
SELECT
    a.provider_id,
    u.full_name,
    a.treatment_type,
    a.bill_amount,
    COALESCE(pp.status, a.status)       AS plan_status,
    a.risk_score,
    COALESCE(pp.payments_made, 0)       AS payments_made,
    COALESCE(pp.outstanding_balance, 0) AS outstanding_balance,
    a.created_at                        AS application_date
FROM applications a
JOIN users u ON a.user_id = u.user_id
LEFT JOIN payment_plans pp ON a.application_id = pp.application_id
WHERE a.provider_id IS NOT NULL
ORDER BY a.created_at DESC;

-- ─── Provider Dashboard: Payment Performance ─────────────────────────────────

CREATE OR REPLACE VIEW vw_provider_payment_performance AS
SELECT
    a.provider_id,
    COUNT(p.payment_id)                                                         AS total_payments,
    COUNT(CASE WHEN p.status = 'paid' THEN 1 END)                             AS on_time_count,
    COUNT(CASE WHEN p.status = 'failed' THEN 1 END)                           AS failed_count,
    COUNT(DISTINCT c.collection_id)                                             AS in_collections_count,
    ROUND(AVG(
        CASE WHEN p.status = 'paid' AND p.payment_date IS NOT NULL
             THEN EXTRACT(EPOCH FROM (p.payment_date - p.due_date::timestamp)) / 86400
        END
    ), 1)                                                                       AS avg_days_to_pay
FROM applications a
JOIN payment_plans pp ON a.application_id = pp.application_id
JOIN payments p ON pp.plan_id = p.plan_id
LEFT JOIN collections c ON p.payment_id = c.payment_id
WHERE a.provider_id IS NOT NULL
GROUP BY a.provider_id;

-- ─── Provider Dashboard: Monthly Revenue ─────────────────────────────────────

CREATE OR REPLACE VIEW vw_provider_monthly_revenue AS
SELECT
    a.provider_id,
    TO_CHAR(a.created_at, 'YYYY-MM')                                           AS month,
    COALESCE(SUM(a.approved_amount), 0)                                         AS gross,
    COALESCE(SUM(a.approved_amount) * 0.95, 0)                                  AS net,
    COUNT(DISTINCT a.user_id)                                                   AS patient_count
FROM applications a
WHERE a.status = 'approved'
  AND a.provider_id IS NOT NULL
GROUP BY a.provider_id, TO_CHAR(a.created_at, 'YYYY-MM')
ORDER BY month DESC;
