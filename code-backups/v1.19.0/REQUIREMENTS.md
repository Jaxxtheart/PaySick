# Requirements & Specifications — PaySick v1.19.0

**Version**: 1.19.0
**Date**: 2026-10-27

Carries forward all requirements from v1.18.0, with the changes below.

## New Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| CAV-15 | The agent's decisions, reason codes, rationales, authority tiers, journey/recovery stages, offer ranking, affordability flags and review routing are backend-only and never sent to the patient | Must Have |
| CAV-16 | Every patient response is built from an allowlist (`care-agent-patient-view.service.js`) | Must Have |
| CAV-17 | Patient-facing text states facts and outcomes only. It never mentions rules, reviews, checks, decisions, stages, risk or a team deciding, never narrates the agent's work, and never explains why an option is or isn't offered | Must Have |
| CAV-18 | A sent request is shown to the patient only as "Received" until its outcome is known | Must Have |
| CAV-19 | Staff can read the agent's full decision log through an admin-only route | Must Have |

## Changed Requirements
- **CAV-07** (v1.18.0) now reads: the agent's decisions carry a reason code
  and rationale and are written to the audit log for staff. The words "and
  are shown to the patient" are removed.
- **CAV-08** (v1.18.0) now reads: staff, not the patient, can see a log of
  everything the agent read, decided, prepared and did.
- **CAV-12** (v1.18.0) now reads: offers are ranked by total to repay in the
  backend. The patient sees them in that order with no recommendation
  marked.

## Inherited Requirements
All other requirements from v1.18.0 remain in effect. See [v1.18.0/REQUIREMENTS.md](../v1.18.0/REQUIREMENTS.md).

## Deprecated Features
### Patient-facing agent decision display (journey bar, decision boxes, authority badges, "Lowest" offer marker, "Will change" text)
- Removed in: v1.19.0
- Last available in: v1.18.0 — see code-backups/v1.18.0/snapshot/
- Reason for removal: owner direction. Decisions belong in the backend; the patient should see confirmed statuses only, with no sense of an agent working in the background.
- Replacement: the account card shows facts and plain options, and the decisions are recorded in `care_agent_audit_log` for staff.

### Patient "What the agent did" log (`GET /api/care-agent/sessions/:id/decisions`, `PaySickAPI.careAgent.getDecisions`)
- Removed in: v1.19.0
- Last available in: v1.18.0 — see code-backups/v1.18.0/snapshot/
- Reason for removal: as above.
- Replacement: `GET /api/care-agent/admin/sessions/:id/decisions` (staff only).

### Affordability-pressure flag and Shield note on the plan options
- Removed in: v1.19.0
- Last available in: v1.18.0 — see code-backups/v1.18.0/snapshot/
- Reason for removal: these are backend assessments, not confirmed statuses.
- Replacement: still computed (`pressureWarning`) and still returned by `/confirm` for backend use; not shown on screen.
