# Requirements & Specifications — PaySick v1.6.0

**Version**: 1.6.0
**Date**: 2026-04-05

Carries forward all requirements from v1.5.6 with the following additions.

---

## New Requirements — Customer Messaging Journey

### Message Types

| ID | Requirement | Priority |
|----|-------------|----------|
| MSG-01 | The system must define a canonical set of message types (`MESSAGE_TYPES`) covering all 10 lifecycle stages: registration, onboarding, application, active plan, outcome surveys, pre-collections, early collections, mid collections, late/legal collections, and resolution | Must Have |
| MSG-02 | Every message type must have at least an email template. SMS and in_app templates are required for all operationally critical types (payment reminders, payment failure, collections day 1) | Must Have |
| MSG-03 | All email templates must include PaySick branding and contact information (`hello@paysick.co.za`) | Must Have |
| MSG-04 | SMS templates must not exceed 320 characters | Must Have |
| MSG-05 | Templates must interpolate customer-specific data: `firstName`, `amount`, `dueDate`, `outstandingBalance`, etc. | Must Have |

### Collections Strategy

| ID | Requirement | Priority |
|----|-------------|----------|
| COL-01 | Collections communications must follow a 13-rung escalation ladder from day 1 to day 90 | Must Have |
| COL-02 | No legal language ("legal action", "court", "attorney") may appear in communications before day 60 | Must Have |
| COL-03 | No threatening language (e.g., credit bureau listing, legal action) may appear in pre-collections messages (days 1–7) | Must Have |
| COL-04 | Human review (`requiresHuman = true`) must be enforced for all collections from day 30 onwards | Must Have |
| COL-05 | A restructuring/arrangement offer must be sent at day 21 (early collections) before formal referral | Must Have |
| COL-06 | All collections communications must use recovery-first, supportive language. Abusive terms ("defaulter", "delinquent", "criminal", "fraud") are prohibited | Must Have |
| COL-07 | `getFullSequenceForPayment` must return only future touchpoints (sendAtDay >= daysOverdue) — no past messages | Must Have |

### Notification Service

| ID | Requirement | Priority |
|----|-------------|----------|
| NOT-01 | All outbound notifications must be persisted to the `notifications` table before dispatch | Must Have |
| NOT-02 | Failed dispatch must update the notification status to `failed` without throwing to the caller | Must Have |
| NOT-03 | The in-app notification inbox must be accessible via `GET /api/notifications` (authenticated) | Must Have |
| NOT-04 | Unread badge count must be available via `GET /api/notifications/unread-count` | Must Have |
| NOT-05 | Notifications must be markable as read individually (`PUT /api/notifications/:id/read`) or in bulk (`PUT /api/notifications/read-all`) | Must Have |
| NOT-06 | SMS dispatch must check for a phone number and `SMS_API_KEY` before attempting delivery; it must degrade gracefully with a warning in development | Must Have |

### Compliance (South Africa)

| ID | Requirement | Priority |
|----|-------------|----------|
| COMP-01 | All customer-facing messages must be POPIA-compliant: no data shared without consent, all access logged | Must Have |
| COMP-02 | Collections messages must not threaten credit bureau listing before formal collections stage (day 31+) | Must Have |
| COMP-03 | Restructuring offers must use patient-first, recovery-oriented language per PaySick Shield protocol | Must Have |

---

## Carried Forward from v1.5.6

See `code-backups/v1.5.6/REQUIREMENTS.md` for all prior requirements including:
- Email production configuration (EMAIL-01 through EMAIL-05)
- Regulatory terminology compliance (REG-01 through REG-11)
