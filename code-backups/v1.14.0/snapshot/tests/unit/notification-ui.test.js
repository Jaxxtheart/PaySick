/**
 * Unit Tests — Notification UI Integration
 *
 * Tests the api-client.js notifications namespace and the notification
 * rendering/behavioral logic that powers the dashboard notification bell.
 *
 * Run: node --test tests/unit/notification-ui.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── api-client notifications namespace ──────────────────────────────────────
// We test the shape of the notification helpers exported for the dashboard.
// These are pure-JS functions (no DOM), so they can run in Node.

const {
  formatTimeAgo,
  getNotificationIcon,
  getNotificationPriority,
  getNotificationCTA,
  groupNotifications
} = require('../../backend/src/helpers/notification-ui.helpers');

// ─── formatTimeAgo ───────────────────────────────────────────────────────────

describe('formatTimeAgo', () => {

  test('returns "Just now" for timestamps under 60 seconds ago', () => {
    const now = new Date();
    assert.strictEqual(formatTimeAgo(now.toISOString()), 'Just now');
  });

  test('returns "X min ago" for timestamps under 60 minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    assert.match(formatTimeAgo(fiveMinAgo), /5 min ago/);
  });

  test('returns "Xh ago" for timestamps under 24 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    assert.match(formatTimeAgo(threeHoursAgo), /3h ago/);
  });

  test('returns "Xd ago" for timestamps under 30 days ago', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.match(formatTimeAgo(sevenDaysAgo), /7d ago/);
  });

  test('returns formatted date for timestamps over 30 days ago', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = formatTimeAgo(sixtyDaysAgo);
    // Should be a date string, not "Xd ago"
    assert.ok(!result.includes('d ago'), 'Over 30d should return a date, not "Xd ago"');
  });

});

// ─── getNotificationIcon ─────────────────────────────────────────────────────

describe('getNotificationIcon', () => {

  test('returns a success icon for payment_success', () => {
    const icon = getNotificationIcon('payment_success');
    assert.ok(icon.symbol, 'Must have a symbol');
    assert.ok(icon.color, 'Must have a color');
    assert.match(icon.color, /green|#2ED573/i);
  });

  test('returns a warning icon for payment_failed', () => {
    const icon = getNotificationIcon('payment_failed');
    assert.match(icon.color, /red|#FF4757/i);
  });

  test('returns an info icon for welcome', () => {
    const icon = getNotificationIcon('welcome');
    assert.ok(icon.symbol);
  });

  test('returns a collections icon for collections types', () => {
    const icon = getNotificationIcon('collections_day_1');
    assert.ok(icon.symbol);
    assert.match(icon.color, /orange|amber|#FF9F40/i);
  });

  test('returns a default icon for unknown types', () => {
    const icon = getNotificationIcon('some_unknown_type');
    assert.ok(icon.symbol);
    assert.ok(icon.color);
  });

});

// ─── getNotificationPriority ─────────────────────────────────────────────────

describe('getNotificationPriority', () => {

  test('payment_failed is critical priority', () => {
    assert.strictEqual(getNotificationPriority('payment_failed'), 'critical');
  });

  test('payment_failed_retry is critical priority', () => {
    assert.strictEqual(getNotificationPriority('payment_failed_retry'), 'critical');
  });

  test('collections_day_1 is high priority', () => {
    assert.strictEqual(getNotificationPriority('collections_day_1'), 'high');
  });

  test('collections_mid_45d is high priority', () => {
    assert.strictEqual(getNotificationPriority('collections_mid_45d'), 'high');
  });

  test('payment_upcoming_1d is medium priority', () => {
    assert.strictEqual(getNotificationPriority('payment_upcoming_1d'), 'medium');
  });

  test('payment_success is low priority', () => {
    assert.strictEqual(getNotificationPriority('payment_success'), 'low');
  });

  test('welcome is low priority', () => {
    assert.strictEqual(getNotificationPriority('welcome'), 'low');
  });

});

// ─── getNotificationCTA ──────────────────────────────────────────────────────

describe('getNotificationCTA', () => {

  test('payment_failed returns a CTA with label and URL', () => {
    const cta = getNotificationCTA('payment_failed');
    assert.ok(cta, 'payment_failed must have a CTA');
    assert.ok(cta.label, 'CTA must have a label');
    assert.ok(cta.url, 'CTA must have a URL');
    assert.match(cta.url, /make-payment/);
  });

  test('collections_day_1 returns a CTA pointing to make-payment', () => {
    const cta = getNotificationCTA('collections_day_1');
    assert.ok(cta);
    assert.match(cta.url, /make-payment/);
  });

  test('application_approved returns a CTA to dashboard', () => {
    const cta = getNotificationCTA('application_approved');
    assert.ok(cta);
    assert.match(cta.url, /dashboard/);
  });

  test('restructure_offer returns a CTA with supportive label', () => {
    const cta = getNotificationCTA('restructure_offer');
    assert.ok(cta);
    assert.ok(cta.label.length > 0);
    assert.ok(cta.url);
  });

  test('welcome returns null (informational, no action needed)', () => {
    const cta = getNotificationCTA('welcome');
    assert.strictEqual(cta, null);
  });

  test('payment_success returns null (no action needed)', () => {
    const cta = getNotificationCTA('payment_success');
    assert.strictEqual(cta, null);
  });

});

// ─── groupNotifications ──────────────────────────────────────────────────────

describe('groupNotifications', () => {

  const now = new Date();
  const todayNotif = { notification_id: '1', type: 'payment_success', created_at: now.toISOString(), read_at: null };
  const yesterdayNotif = { notification_id: '2', type: 'welcome', created_at: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(), read_at: null };
  const weekAgoNotif = { notification_id: '3', type: 'plan_activated', created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), read_at: '2026-01-01' };

  test('groups notifications into today / yesterday / earlier', () => {
    const groups = groupNotifications([todayNotif, yesterdayNotif, weekAgoNotif]);
    assert.ok(Array.isArray(groups));
    assert.ok(groups.length >= 2, 'Should have at least 2 groups');
  });

  test('each group has a label and items array', () => {
    const groups = groupNotifications([todayNotif, yesterdayNotif, weekAgoNotif]);
    for (const group of groups) {
      assert.ok(group.label, 'Group must have a label');
      assert.ok(Array.isArray(group.items), 'Group must have items array');
      assert.ok(group.items.length > 0, 'Group must have at least one item');
    }
  });

  test('today group appears first', () => {
    const groups = groupNotifications([todayNotif, yesterdayNotif, weekAgoNotif]);
    assert.strictEqual(groups[0].label, 'Today');
  });

  test('returns empty array for empty input', () => {
    const groups = groupNotifications([]);
    assert.deepStrictEqual(groups, []);
  });

});
