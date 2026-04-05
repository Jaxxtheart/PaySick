# Architecture — PaySick v1.6.0

**Version**: 1.6.0
**Date**: 2026-04-05

---

## New: Customer Messaging Journey Architecture

### Service Layer

```
MessagingJourneyService          (messaging-journey.service.js)
│
├── MESSAGE_TYPES                 43 canonical message type keys
├── CHANNELS                      email | sms | in_app | push
├── JOURNEY_STAGES                10 lifecycle stages
├── COLLECTIONS_LADDER            13-rung escalation array (day 1–90)
│
├── getMessageTemplate(type, channel, data)
│     ├── EMAIL_TEMPLATES[type](data)   → { subject, body (HTML) }
│     ├── SMS_TEMPLATES[type](data)     → { message (≤320 chars) }
│     └── IN_APP_TEMPLATES[type](data)  → { title, message }
│
└── getTriggerRules()             → Array<{ type, event, channels, description }>

CollectionsMessagingService      (collections-messaging.service.js)
│
├── ESCALATION_STAGES             { pre_collections, collections_early, collections_mid, collections_late }
├── FULL_SEQUENCE                 13 sorted touchpoints (day 1–90)
│
├── getStrategyForDaysOverdue(days)
│     → { stage, messages, escalate, requiresHuman, description }
│
└── getFullSequenceForPayment({ daysOverdue })
      → Filtered, sorted array of future touchpoints

NotificationService              (notification.service.js)
│
├── send(userId, type, channel, data, opts)
│     ├── getMessageTemplate(type, channel, data)
│     ├── INSERT INTO notifications (status='pending')
│     ├── Dispatch via channel (email → sendJourneyEmail, sms → _sendSms)
│     └── UPDATE notifications status → 'sent' | 'failed'
│
├── sendAll(userId, type, data, opts)
│     └── getTriggerRules() → channels → send() for each
│
├── schedule(userId, type, channel, data, sendAt, opts)
│     └── INSERT INTO notifications (status='pending', created_at=sendAt)
│
├── getUserNotifications(userId, opts) → inbox rows (channel='in_app')
├── getUnreadCount(userId)             → integer
├── markRead(notificationId, userId)   → boolean
└── markAllRead(userId)                → rowCount
```

### API Layer (new)

```
GET  /api/notifications              → getUserNotifications()
GET  /api/notifications/unread-count → getUnreadCount()
PUT  /api/notifications/read-all     → markAllRead()
PUT  /api/notifications/:id/read     → markRead()
```

All `/api/notifications` routes are protected by `authenticateToken` middleware.

### Collections Escalation Flow

```
Payment missed
│
Day 1  → SMS (friendly reminder)                       [pre_collections]
Day 3  → SMS + Email (gentle follow-up)                [pre_collections]
Day 7  → SMS + Email (direct reminder)                 [pre_collections]
Day 8  → Email (formal request)                        [collections_early]
Day 14 → SMS + Email (escalation notice)               [collections_early]
Day 21 → SMS + Email (restructure offer) ← HUMAN REQ  [collections_early]
Day 30 → Email (final friendly notice)   ← HUMAN REQ  [collections_early]
Day 31 → Email (formal collections)      ← HUMAN REQ  [collections_mid]
Day 45 → SMS + Email (second formal)     ← HUMAN REQ  [collections_mid]
Day 60 → Email (final notice)            ← HUMAN REQ  [collections_mid]
Day 61 → Email (pre-legal notice)        ← HUMAN REQ  [collections_late]
Day 75 → Email (legal referral warning)  ← HUMAN REQ  [collections_late]
Day 90 → Email (legal action commenced)  ← HUMAN REQ  [collections_late]
```

### Customer Journey Lifecycle

```
Register → Verify Email → Welcome
         ↓
     Onboarding (incomplete nudges at 24h, 72h)
     + Banking details missing nudge
         ↓
     Apply → Received → Approved / Declined / More Info / Expired
         ↓
     Plan Activated
         ↓
     Payment reminders: 7d → 3d → 1d → Due Today
         ↓
     Payment Success ──────────────────────────────→ Outcome Surveys (Day 3, 30, 90)
         ↓
     Payment Failed → Retry → Retry Failed
         ↓
     Collections Ladder (Day 1–90, see above)
         ↓
     Resolution: Restructure Offer → Accepted
               / Payment Arrangement
               / Account Settled
               / Account Written Off
```

### Database (unchanged)

All notifications are persisted in the existing `notifications` table:
```sql
notifications (notification_id, user_id, type, channel, subject, message,
               status, sent_at, delivered_at, read_at,
               related_entity_type, related_entity_id, created_at)
```

---

## Unchanged from v1.5.x

All prior architecture (Shield framework, marketplace, payments, users, providers) is unchanged.
Refer to `code-backups/v1.5.4/ARCHITECTURE.md` for the core platform diagram.
