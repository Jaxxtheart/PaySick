# Requirements & Specifications: PaySick v1.21.0

**Version**: 1.21.0
**Date**: 2026-10-27

Carries forward all requirements from v1.20.0 and adds the following.

## New Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| KEHR-A01 | A patient can be pre-approved before treatment without typing their income: income is read from a bank feed or from an uploaded payslip or statement | Must Have |
| KEHR-A02 | Nothing is read without a consent for that source; each grant stores the exact purpose text shown; any consent can be withdrawn | Must Have |
| KEHR-A03 | Pre-approval needs the bureau consent and one income source; health history is optional and declining never counts against the patient | Must Have |
| KEHR-A04 | Identity is verified (ID + liveness) before any assessment; the selfie is never stored or returned | Must Have |
| KEHR-A05 | Documents are cross-checked against the identity and each other; a mismatch goes to a person and is never, alone, a decline | Must Have |
| KEHR-A06 | Pre-approval runs Shield Gates 5, 3 and 2, the hard floors (R4,000 income, 20% RTI, 55% DTI full procedure, R2,000 minimum gap) and risk model v1.1; Gates 1 and 4 are recorded as pending | Must Have |
| KEHR-A07 | Every assessment is written to `underwriting_audit_log` with its inputs, outcome, per-term trace and rule version | Must Have |
| KEHR-A08 | The pass has a unique code, a ceiling, a maximum term and a 90-day expiry; elective care over R15,000 waits 48 hours | Must Have |
| KEHR-A09 | The patient sees statuses only (pre-approved, checking, not available); never reasons, gates, scores or traces | Must Have |
| KEHR-A10 | Any patient can ask a person to review an outcome (POPIA s71) | Must Have |
| KEHR-A11 | A provider sees only the pass code, status, ceiling and expiry | Must Have |
| KEHR-A12 | Plan links are signed, bound to the patient's number, single use and expire after 7 days; the token carries no amount, name or phone | Must Have |
| KEHR-A13 | Conversion runs the full Shield decision (Gates 1 to 5) on the real bill and offers only the terms that pass; a bill over the ceiling or a different procedure goes to a person | Must Have |
| KEHR-A14 | A pass older than 30 days re-reads income before converting | Must Have |
| KEHR-A15 | DebiCheck mandates name Tech & Artery (Pty) Ltd as creditor (`KEHR*PLAN`), real-time TT1 first, TT2 on timeout | Must Have |
| KEHR-A16 | Risk model v1.0 stays bit-for-bit unchanged for existing paths (golden cases) | Must Have |
| KEHR-A17 | Plan links are refused in production until `KEHR_LINK_SECRET` is set | Must Have |
| KEHR-A18 | Assess, link redemption and pass checks have a tighter rate limit than the rest of `/api/kehr` | Must Have |

## Inherited Requirements
All requirements from v1.20.0 remain in effect. See [v1.20.0/REQUIREMENTS.md](../v1.20.0/REQUIREMENTS.md).

## Deprecated Features
None in this version.
