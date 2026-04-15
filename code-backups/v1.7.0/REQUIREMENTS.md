# Requirements & Specifications — PaySick v1.7.0

**Version**: 1.7.0
**Date**: 2026-04-10

Carries forward all requirements from v1.6.0 with the following additions.

---

## New Requirements — Shield Framework v5.0: Segment 1 Tariff Billing Risk Controls

### Control 1 — DSP Status Verification

| ID | Requirement | Priority |
|----|-------------|----------|
| DSP-01 | The system must look up a provider's DSP status against the `dsp_registry` table using HPCSA number and patient scheme code | Must Have |
| DSP-02 | A provider confirmed as DSP must receive standard gap calculation with no upfront deposit increase | Must Have |
| DSP-03 | A provider confirmed as NON_DSP must receive a conservative gap estimate, a 10% additional upfront deposit, and a tariff disclosure must be shown | Must Have |
| DSP-04 | A provider with UNKNOWN DSP status must receive a 5% additional upfront deposit and must be routed to the manual review queue | Must Have |
| DSP-05 | All DSP check results must be persisted to the `applications` table and logged in `underwriting_audit_log` | Must Have |
| DSP-06 | DSP checks must require authentication | Must Have |

### Control 2 — Tariff-Anchored Facilitation Ceiling

| ID | Requirement | Priority |
|----|-------------|----------|
| CEIL-01 | The facilitation ceiling must be calculated as: `ceiling = benchmark_cost_100pct × (1 - coverage_multiplier)` | Must Have |
| CEIL-02 | If the coverage multiplier equals 1.0 (full scheme coverage), the ceiling must be zero and the application rejected | Must Have |
| CEIL-03 | If the provider's submitted invoice is within 30% of the benchmark, the application proceeds with ceiling applied | Must Have |
| CEIL-04 | If the provider's submitted invoice exceeds the benchmark by more than 30%, the application must be placed on manual hold and a `TARIFF_INFLATION_HOLD` review queue entry created | Must Have |
| CEIL-05 | If no benchmark exists for a procedure code + region, the application must be routed to manual review with status `NO_BENCHMARK` | Must Have |
| CEIL-06 | All ceiling calculations must be persisted to `facilitation_ceiling_calculations` and logged in `underwriting_audit_log` | Must Have |

### Control 3 — Provider Billing Agreement Gate

| ID | Requirement | Priority |
|----|-------------|----------|
| BILL-01 | Segment 1 providers must have an ACTIVE billing agreement in `provider_billing_agreements` before gap facilitation can proceed | Must Have |
| BILL-02 | Segment 1 providers without any billing agreement must be blocked with a clear message | Must Have |
| BILL-03 | Segment 1 providers with a SUSPENDED billing agreement must be blocked; suspension reason must be returned | Must Have |
| BILL-04 | Segment 2 providers bypass the billing agreement gate entirely (segment bypass) | Must Have |
| BILL-05 | Billing agreement gate checks must be logged in `underwriting_audit_log` | Must Have |
| BILL-06 | Admins must be able to create, suspend, and reinstate provider billing agreements via admin-only API endpoints | Must Have |

### Control 4 — Tariff Disclosure Screen

| ID | Requirement | Priority |
|----|-------------|----------|
| DISC-01 | Before proceeding to approval, a tariff disclosure record must be created and presented to the patient | Must Have |
| DISC-02 | Disclosures must include: DSP status at time of disclosure, estimated gap amount, provider amount, benchmark amount, disclosure version, and full disclosure text | Must Have |
| DISC-03 | Patient acknowledgement must capture: method (CHECKBOX/OTP/BIOMETRIC), IP address, User-Agent, session ID, and timestamp | Must Have |
| DISC-04 | Applications without an acknowledged disclosure must not be permitted to transition to APPROVED | Must Have |
| DISC-05 | The disclosure gate check endpoint must be available to authenticated users | Must Have |
| DISC-06 | All disclosure events must be logged in `underwriting_audit_log` | Must Have |
| DISC-07 | The patient-facing `tariff-disclosure.html` page must display the complete disclosure text and require explicit checkbox acknowledgement before proceeding | Must Have |

### Control 5 — Post-Procedure EOB/Payout Reconciliation

| ID | Requirement | Priority |
|----|-------------|----------|
| EOB-01 | Upon procedure completion, a provisional payout of 80% of the facilitation ceiling must be triggered to the provider | Must Have |
| EOB-02 | Providers must submit EOB documentation (invoice + scheme EOB) within 30 days of the procedure date | Must Have |
| EOB-03 | Final payout must be calculated as: `MIN(remaining_approved, scheme_residual)` where `remaining_approved = ceiling - provisional_paid` | Must Have |
| EOB-04 | If the provider's invoice exceeds the approved ceiling, the excess must be withheld and a notification sent to the provider | Must Have |
| EOB-05 | All payout stages must be persisted to `payout_stages`; EOB submissions to `eob_submissions` | Must Have |
| EOB-06 | Reconciliation must be an admin-only operation | Must Have |
| EOB-07 | All payout and reconciliation events must be logged in `underwriting_audit_log` | Must Have |

### Bot Crawling Prevention

| ID | Requirement | Priority |
|----|-------------|----------|
| BOT-01 | All new API routes must include `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` response header | Must Have |
| BOT-02 | Global server middleware must add `X-Robots-Tag` to all responses | Must Have |

### Language Compliance

| ID | Requirement | Priority |
|----|-------------|----------|
| LANG-01 | All user-facing code must use approved PaySick terminology: "payment plan", "facilitation amount", "monthly instalment", "facilitation fee" | Must Have |
| LANG-02 | The words "loan", "credit", "lend", "borrow", "interest rate", "principal" must not appear in any user-facing code, API response messages, or frontend pages | Must Have |

### Testing

| ID | Requirement | Priority |
|----|-------------|----------|
| TEST-01 | All five controls must have integration tests written before implementation (test-first policy) | Must Have |
| TEST-02 | Each control must have at least 5 integration tests covering: happy path, error conditions, missing fields (400), and authentication (401) | Must Have |

---

## Inherited Requirements

All requirements from v1.6.0 remain in effect. See [v1.6.0/REQUIREMENTS.md](../v1.6.0/REQUIREMENTS.md) for the full inherited set.

---

## Deprecated Features

None in this release.
