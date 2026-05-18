# Requirements — v1.8.0

## /api/v1 facilitation surface

### POST /api/v1/applications
- Accepts: `patientId`, `providerId`, `procedureCode`, `procedureDescription`,
  `procedureUrgency` ∈ {ELECTIVE, SEMI_URGENT, URGENT},
  `providerInvoiceAmount` (integer cents),
  `termMonths` ∈ [3, 36], `segment` ∈ {SEGMENT_1_GAP, SEGMENT_2_OOP}.
  Segment 1 also accepts `medicalAidScheme`, `medicalAidPlan`,
  `schemeReimbursementEstimate`.
- Rejects `SUSPENDED` / `TERMINATED` providers with `409 PROVIDER_UNAVAILABLE`.
- Persists application with status `SUBMITTED`.
- Returns `referenceNumber`, `estimatedDecisionMinutes`, `coolingOffRequired`,
  and `coolingOffExpiresAt` (if applicable).

### POST /api/v1/decisions/:applicationId
Runs the Shield 5-gate engine. Each gate stops processing on failure.

- **Gate 1 — Provider Gate**: status ACTIVE/DEVELOPING, billing agreement
  signed (Segment 1), book share < 5%, procedure-type share < 20%.
- **Gate 2 — Patient Affordability**: verified income < 90 days old, ratio
  ≤ 20% (0.15 if income via manual review, URGENT, or portfolio arrears > 6%).
  Hard block — override requires Head of Credit role.
- **Gate 3 — Urgency & Cooling-Off**: ELECTIVE > R15,000 → COOLING_OFF
  for 48h. URGENT skips cooling-off, applies 0.15 ratio.
- **Gate 4 — Tariff Control (Segment 1 only)**: facilitation = benchmark ×
  (1 − coverage), never from provider invoice. Invoice > benchmark × 1.30 →
  MANUAL_REVIEW. Non-DSP provider → `dspWarningRequired = true`.
- **Gate 5 — Circuit Breakers**: provider PD > 8% → DECLINED + suspend.
  Balance sheet > 40% → DECLINED. Portfolio arrears > 6% → tighten Gate 2.
  Reserve fund < 15% of monthly fees → fire `circuit_breaker.reserve_fund_triggered`.

### POST /api/v1/payouts/:applicationId
- **Stage 1 (PROVISIONAL)**: only after cooling-off expiry. Applies tier-based
  holdback if `provider.holdback_applications_remaining > 0`. Generates
  instalment schedule. Fires `payout.disbursed_provisional`.
- **Stage 2 (FINAL, Segment 1 only)**: requires `schemeActualPayment` from
  EOB. Final = MIN(provisional, invoice − schemeActual), capped at approved
  facilitation ceiling. Fires `payout.disbursed_final` and (if invoice
  exceeded ceiling) `invoice.exceeded_ceiling`.

### GET /api/v1/schedules/:applicationId
Returns the generated instalment schedule with line items and next-instalment
metadata.

## Provider tiers

| Tier | Cap (R) | Payout delay | Holdback |
|------|---------|--------------|----------|
| NEW | 10,000 | 5 days | 10% on first 20 applications |
| DEVELOPING | 25,000 | 3 days | 5% |
| ESTABLISHED | 50,000 | 2 days | 0% |
| PREMIUM | 100,000 | 24h | 0% |

Tier rules (rolling 90-day):
- PREMIUM: pd ≤ 2% and ≥ 100 applications
- ESTABLISHED: pd ≤ 3% and ≥ 50
- DEVELOPING: pd ≤ 5% and ≥ 20
- NEW: < 20 applications, or any case not matching above

Status rules:
- pd ≥ 8% → SUSPENDED
- pd ≥ 6% → THROTTLED
- THROTTLED → ACTIVE when pd < 4%

## Webhooks

Events fire to the `webhook_events` table; a worker (out of scope here)
drains the queue and POSTs to subscribers. Events:
`application.{approved,declined,manual_review,cooling_off}`,
`payout.disbursed_{provisional,final}`,
`repayment.{collected,missed}`,
`provider.{throttled,suspended}`,
`invoice.{flagged_above_tariff,exceeded_ceiling}`,
`circuit_breaker.{triggered,reserve_fund_triggered}`,
`holdback.released`.

## Compliance

- All money in integer cents.
- No floating-point math in any monetary path.
- Compliant terminology — prohibited terms (loan, lend, borrower, default,
  interest, credit agreement) never appear in API responses, error messages,
  or webhook payloads.
- All endpoints require authentication.
- `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` on
  every response.

## Deprecated Features

None in this release. The new v1 surface is additive; the existing
`/api/applications`, `/v2/shield/*`, and `/api/v1/underwriting/*` routes
continue to function unchanged.
