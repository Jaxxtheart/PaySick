'use strict';

/**
 * NOTIFICATION UI HELPERS
 *
 * Pure functions that power the notification bell dropdown in the dashboard.
 * These are isomorphic — they run both server-side (for tests) and are
 * inlined into the dashboard page as client-side JS.
 *
 * HCI principles applied:
 * - Recency bias: "Just now" / "5 min ago" creates immediacy
 * - Color coding: red=critical, orange=warning, green=positive
 * - Priority sorting: critical first → loss aversion nudge
 * - Clear CTAs: one obvious action per notification → reduced decision fatigue
 * - Grouping: temporal clusters (Today / Yesterday / Earlier) → pattern recognition
 */

// ─── formatTimeAgo ───────────────────────────────────────────────────────────

function formatTimeAgo(isoString) {
  const now   = Date.now();
  const then  = new Date(isoString).getTime();
  const diffS = Math.floor((now - then) / 1000);

  if (diffS < 60)     return 'Just now';
  if (diffS < 3600)   return Math.floor(diffS / 60) + ' min ago';
  if (diffS < 86400)  return Math.floor(diffS / 3600) + 'h ago';
  if (diffS < 30 * 86400) return Math.floor(diffS / 86400) + 'd ago';

  // Older than 30 days — return a short date
  return new Date(isoString).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

// ─── getNotificationIcon ─────────────────────────────────────────────────────

const ICON_MAP = {
  // Success / positive
  payment_success:       { symbol: '\u2713', color: '#2ED573' },  // checkmark
  plan_activated:        { symbol: '\u2713', color: '#2ED573' },
  application_approved:  { symbol: '\u2713', color: '#2ED573' },
  account_settled:       { symbol: '\u2713', color: '#2ED573' },
  restructure_accepted:  { symbol: '\u2713', color: '#2ED573' },

  // Failure / critical
  payment_failed:        { symbol: '!',  color: '#FF4757' },
  payment_failed_retry:  { symbol: '!',  color: '#FF4757' },
  application_declined:  { symbol: '\u2715', color: '#FF4757' },  // X

  // Collections / warning — orange to signal urgency without panic
  collections_day_1:     { symbol: '\u25B2', color: '#FF9F40' },  // triangle
  collections_day_3:     { symbol: '\u25B2', color: '#FF9F40' },
  collections_day_7:     { symbol: '\u25B2', color: '#FF9F40' },
  collections_early_8d:  { symbol: '\u25B2', color: '#FF9F40' },
  collections_early_14d: { symbol: '\u25B2', color: '#FF9F40' },
  collections_early_21d: { symbol: '\u25B2', color: '#FF9F40' },
  collections_early_30d: { symbol: '\u25B2', color: '#FF9F40' },
  collections_mid_31d:   { symbol: '\u25B2', color: '#FF9F40' },
  collections_mid_45d:   { symbol: '\u25B2', color: '#FF9F40' },
  collections_mid_60d:   { symbol: '\u25B2', color: '#FF9F40' },
  collections_late_61d:  { symbol: '\u25B2', color: '#FF4757' },
  collections_late_75d:  { symbol: '\u25B2', color: '#FF4757' },
  collections_late_90d:  { symbol: '\u25B2', color: '#FF4757' },

  // Payment reminders — blue/info
  payment_upcoming_7d:   { symbol: '\u23F0', color: '#3498DB' },  // clock
  payment_upcoming_3d:   { symbol: '\u23F0', color: '#3498DB' },
  payment_upcoming_1d:   { symbol: '\u23F0', color: '#FF9F40' },  // orange — closer = more urgent
  payment_due_today:     { symbol: '\u23F0', color: '#FF4757' },

  // Info / general
  welcome:               { symbol: '\u2605', color: '#3498DB' },  // star
  restructure_offer:     { symbol: '\u2764', color: '#FF9F40' },  // heart — supportive tone

  // Security
  security_alert_new_device:    { symbol: '\u26A0', color: '#FF4757' },
  security_alert_failed_logins: { symbol: '\u26A0', color: '#FF4757' },
};

const DEFAULT_ICON = { symbol: '\u2022', color: '#8A8A8A' };  // bullet

function getNotificationIcon(type) {
  return ICON_MAP[type] || DEFAULT_ICON;
}

// ─── getNotificationPriority ─────────────────────────────────────────────────
// Used for sort order + visual weight. Loss aversion: critical items surface first.

function getNotificationPriority(type) {
  // Critical: failed payments — immediate financial consequence
  if (/^payment_failed/.test(type)) return 'critical';
  if (/^security_alert/.test(type)) return 'critical';

  // High: all collections messages — overdue debt
  if (/^collections_/.test(type)) return 'high';
  if (type === 'restructure_offer') return 'high';
  if (type === 'application_declined') return 'high';

  // Medium: upcoming reminders, action-required items
  if (/^payment_upcoming/.test(type)) return 'medium';
  if (type === 'payment_due_today') return 'medium';
  if (type === 'application_more_info') return 'medium';
  if (/^onboarding_/.test(type)) return 'medium';

  // Low: confirmations, informational
  return 'low';
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// ─── getNotificationCTA ──────────────────────────────────────────────────────
// One clear call-to-action per notification. Reduces decision paralysis.
// Returns null for informational-only (no action needed).

function getNotificationCTA(type) {
  // Payment failures → pay now (urgency)
  if (type === 'payment_failed' || type === 'payment_failed_retry')
    return { label: 'Pay Now', url: 'make-payment.html' };

  // Collections → pay now
  if (/^collections_/.test(type))
    return { label: 'Resolve Payment', url: 'make-payment.html' };

  // Restructuring → view options (supportive framing)
  if (type === 'restructure_offer')
    return { label: 'View Options', url: 'dashboard.html' };

  // Application approved → view plan
  if (type === 'application_approved')
    return { label: 'View My Plan', url: 'dashboard.html' };

  // Application declined → see details
  if (type === 'application_declined')
    return { label: 'See Details', url: 'dashboard.html' };

  // More info needed → complete
  if (type === 'application_more_info')
    return { label: 'Provide Info', url: 'dashboard.html' };

  // Payment upcoming → view payments
  if (/^payment_upcoming/.test(type) || type === 'payment_due_today')
    return { label: 'View Payment', url: 'payments.html' };

  // Security → secure account
  if (/^security_alert/.test(type))
    return { label: 'Secure Account', url: 'forgot-password.html' };

  // Onboarding
  if (/^onboarding_/.test(type))
    return { label: 'Complete Profile', url: 'onboarding.html' };

  // Surveys
  if (/^survey_/.test(type))
    return { label: 'Take Survey', url: 'dashboard.html' };

  // Purely informational — no CTA (welcome, payment_success, profile_updated, etc.)
  return null;
}

// ─── groupNotifications ──────────────────────────────────────────────────────
// Temporal grouping: Today / Yesterday / Earlier. Leverages pattern recognition.

function groupNotifications(notifications) {
  if (!notifications || notifications.length === 0) return [];

  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterStart = todayStart - 86400000;

  const buckets = { Today: [], Yesterday: [], Earlier: [] };

  for (const n of notifications) {
    const t = new Date(n.created_at).getTime();
    if (t >= todayStart)       buckets.Today.push(n);
    else if (t >= yesterStart)  buckets.Yesterday.push(n);
    else                        buckets.Earlier.push(n);
  }

  const groups = [];
  for (const [label, items] of Object.entries(buckets)) {
    if (items.length > 0) groups.push({ label, items });
  }

  return groups;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  formatTimeAgo,
  getNotificationIcon,
  getNotificationPriority,
  getNotificationCTA,
  groupNotifications,
  PRIORITY_ORDER
};
