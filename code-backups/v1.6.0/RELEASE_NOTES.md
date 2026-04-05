# Release Notes — PaySick v1.6.0

**Version**: 1.6.0
**Date**: 2026-04-05
**Type**: MINOR — New feature: Customer Messaging Journey

---

## Summary

Introduces the complete customer messaging journey for PaySick — all permutations of outbound communications across the full customer lifecycle, with dedicated collections escalation strategies.

This release ships three new services, one new API route module, a `sendJourneyEmail` extension to the email service, and a comprehensive test suite (173 new tests).

---

## Added

### `backend/src/services/messaging-journey.service.js`
Core messaging journey service exporting:
- `MESSAGE_TYPES` — enum of all 43 message type keys across every lifecycle stage
- `CHANNELS` — enum: `email`, `sms`, `in_app`, `push`
- `JOURNEY_STAGES` — 10 lifecycle stages: registration, onboarding, application, active_plan, outcome_survey, pre_collections, collections_early, collections_mid, collections_late, resolution
- `COLLECTIONS_LADDER` — 13-rung escalation ladder (day 1 → day 90) with tone, channel, requiresHuman, and action per rung
- `MessagingJourneyService` class:
  - `getMessageTemplate(type, channel, data)` — renders the correct email/SMS/in_app template for a given message type, with all fields interpolated
  - `getTriggerRules()` — the canonical rule set: which event fires which message type on which channels

### `backend/src/services/collections-messaging.service.js`
Collections escalation strategy service:
- `ESCALATION_STAGES` — maps stage names to day ranges
- `CollectionsMessagingService` class:
  - `getStrategyForDaysOverdue(days)` — returns stage, messages, escalate flag, requiresHuman flag, and description for any given overdue day count
  - `getFullSequenceForPayment({ daysOverdue })` — returns the complete forward-looking collection touchpoint schedule, filtered to start from the current overdue day

### `backend/src/services/notification.service.js`
Notification dispatcher and inbox manager:
- `NotificationService` class:
  - `send(userId, type, channel, data, opts)` — render, persist, and dispatch a single notification
  - `sendAll(userId, type, data, opts)` — send across all channels defined in trigger rules
  - `schedule(userId, type, channel, data, sendAt, opts)` — queue for scheduled delivery
  - `getUserNotifications(userId, opts)` — fetch in-app notification inbox
  - `getUnreadCount(userId)` — badge count for in-app
  - `markRead(notificationId, userId)` — mark single notification read
  - `markAllRead(userId)` — mark all as read

### `backend/src/routes/notifications.js`
New REST API: `/api/notifications`
- `GET  /api/notifications` — list in-app notifications (supports `?unread=true&limit=N`)
- `GET  /api/notifications/unread-count` — unread badge count
- `PUT  /api/notifications/read-all` — mark all as read
- `PUT  /api/notifications/:id/read` — mark one as read

### `tests/unit/messaging-journey.test.js`
173 unit tests covering:
- Module exports and completeness
- All 43 message types defined
- All 10 journey stages defined
- Email templates for every message type (subject, body, interpolation, tone compliance)
- SMS templates (length ≤ 320 chars, no legal language in early stage)
- In-app templates (title + message)
- Trigger rules (valid types, valid channels, multi-channel coverage)
- Collections ladder (structure, sort order, tone progression, legal thresholds)
- Collections strategy (all 4 stages, escalate/requiresHuman flags)
- Full sequence (filtered by daysOverdue, sorted, correct count)
- Channel coverage (payment_failed: email+sms; collections_day_1: sms; account_settled: email+in_app)
- South African compliance (POPIA, NCA tone, no abusive language, PaySick branding)

---

## Modified

### `backend/src/services/email.service.js`
- Added `sendJourneyEmail({ to, subject, html })` — generic email dispatch used by `NotificationService` for all journey email sends

### `backend/src/server.js`
- Imported `notificationRoutes`
- Registered `app.use('/api/notifications', notificationRoutes)`
- Added `notifications: '/api/notifications'` to root endpoint listing

---

## Collections Escalation Ladder (summary)

| Day | Stage | Channel(s) | Tone | Human Review |
|-----|-------|-----------|------|-------------|
| 1 | pre_collections | SMS | Friendly reminder | No |
| 3 | pre_collections | SMS + Email | Gentle reminder | No |
| 7 | pre_collections | SMS + Email | Direct reminder | No |
| 8 | collections_early | Email | Formal request | No |
| 14 | collections_early | SMS + Email | Escalation notice | No |
| 21 | collections_early | SMS + Email | Restructure offer | Yes |
| 30 | collections_early | Email | Final friendly notice | Yes |
| 31 | collections_mid | Email | Formal collections | Yes |
| 45 | collections_mid | SMS + Email | Second formal notice | Yes |
| 60 | collections_mid | Email | Final notice before legal | Yes |
| 61 | collections_late | Email | Pre-legal notice | Yes |
| 75 | collections_late | Email | Legal referral warning | Yes |
| 90 | collections_late | Email | Legal action commenced | Yes |
