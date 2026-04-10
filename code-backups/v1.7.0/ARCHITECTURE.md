# Architecture — PaySick v1.7.0

**Version**: 1.7.0
**Date**: 2026-04-10

---

## New: Shield Framework v5.0 Architecture

### Service Layer

```
UnderwritingService              (underwriting.service.js)
│
├── CONTROL 1 — DSP STATUS VERIFICATION
│   └── dspCheck(applicationId, providerHpcsaNumber, patientSchemeCode, patientPlanCode)
│         ├── SELECT FROM dsp_registry WHERE provider_hpcsa_number AND scheme_code
│         ├── Determine status: DSP | NON_DSP | UNKNOWN
│         │   ├── DSP:     upfrontIncrease=0, conservativeGap=false, disclosureRequired=false
│         │   ├── NON_DSP: upfrontIncrease=10%, conservativeGap=true, disclosureRequired=true
│         │   └── UNKNOWN: upfrontIncrease=5%, manualReview=true
│         ├── UPDATE applications SET dsp_status, dsp_verified_at, ...
│         ├── INSERT manual_review_queue (if UNKNOWN)
│         └── INSERT underwriting_audit_log
│
├── CONTROL 2 — FACILITATION CEILING
│   └── calculateCeiling(applicationId, procedureCode, metroRegion, coverageMultiplier, submittedAmount)
│         ├── SELECT FROM procedure_benchmarks WHERE procedure_code AND metro_region
│         │   └── No benchmark → INSERT manual_review_queue (NO_BENCHMARK) → return MANUAL_REVIEW
│         ├── ceiling = benchmark × (1 - coverageMultiplier)
│         ├── coverageMultiplier ≥ 1.0 → ceiling=0 → REJECTED (full scheme coverage)
│         ├── variancePercent = (submitted - benchmark) / benchmark × 100
│         │   ├── ≤ 30%: decision=APPROVED
│         │   └── > 30%: decision=MANUAL_HOLD, INSERT manual_review_queue (TARIFF_INFLATION_HOLD)
│         ├── INSERT facilitation_ceiling_calculations
│         ├── UPDATE applications SET facilitation_ceiling, on_manual_hold, above_30pct_threshold
│         └── INSERT underwriting_audit_log
│
├── CONTROL 3 — BILLING AGREEMENT GATE
│   └── checkBillingAgreement(providerId, segment)
│         ├── SEGMENT_2 → { gap_financing_eligible: true, segment_bypass: true } (bypass)
│         ├── SEGMENT_1 → SELECT FROM provider_billing_agreements WHERE provider_id
│         │   ├── No agreement: eligible=false, block_reason=...
│         │   ├── ACTIVE:       eligible=true
│         │   └── SUSPENDED:    eligible=false, suspension_reason=...
│         └── INSERT underwriting_audit_log
│
├── CONTROL 4 — TARIFF DISCLOSURE
│   ├── createDisclosure(applicationId, patientId, dspStatus, estimatedGap, providerAmount, benchmark)
│   │     ├── INSERT tariff_disclosures (acknowledged=false)
│   │     └── INSERT underwriting_audit_log
│   ├── acknowledgeDisclosure(disclosureId, applicationId, patientId, method, ip, ua, sessionId)
│   │     ├── UPDATE tariff_disclosures SET acknowledged=true, acknowledged_at, method, ip, ua, sessionId
│   │     ├── UPDATE applications SET disclosure_acknowledged=true, tariff_disclosure_id
│   │     └── INSERT underwriting_audit_log
│   └── checkDisclosureGate(applicationId)
│         └── SELECT disclosure_acknowledged, tariff_disclosure_id FROM applications
│               ├── Not acknowledged → { can_proceed_to_approval: false, reason: ... }
│               └── Acknowledged    → { can_proceed_to_approval: true }
│
└── CONTROL 5 — EOB PAYOUT RECONCILIATION
    ├── triggerProvisionalPayout(applicationId)
    │     ├── SELECT application (facilitation_ceiling, provider_id)
    │     ├── provisionalAmount = ceiling × 0.80
    │     ├── INSERT payout_stages (stage='PROVISIONAL', scheduled_amount=provisionalAmount)
    │     ├── UPDATE applications SET provisional_payout_id
    │     └── INSERT underwriting_audit_log
    ├── submitEob(applicationId, providerId, invoiceAmount, eobAmount, invoiceUrl, eobUrl, submittedBy)
    │     ├── INSERT eob_submissions
    │     └── UPDATE applications SET eob_submission_id
    └── reconcileEob(applicationId)
          ├── SELECT application (facilitation_ceiling, provider_id)
          ├── SELECT eob_submissions (scheme_residual_amount, provider_invoice_amount)
          ├── SELECT payout_stages (PROVISIONAL — actual/scheduled amount)
          ├── remaining_approved = ceiling - provisional_paid
          ├── finalPayout = MIN(remaining_approved, scheme_residual)
          ├── excessWithheld = MAX(0, provider_invoice - ceiling)
          ├── INSERT payout_stages (stage='FINAL', scheduled_amount=finalPayout)
          ├── UPDATE eob_submissions SET reconciliation_status='RECONCILED', final_payout_amount
          ├── UPDATE applications SET final_payout_id
          ├── INSERT notification_log (EXCESS_WITHHELD_NOTIFICATION or FINAL_PAYOUT_NOTIFICATION)
          └── INSERT underwriting_audit_log
```

### API Layer (new routes under `/api`)

```
POST /api/v1/underwriting/dsp-check                (authenticateToken)
POST /api/v1/underwriting/calculate-ceiling         (authenticateToken)
GET  /api/v1/underwriting/procedure-benchmark       (authenticateToken)
POST /api/admin/procedure-benchmarks               (authenticateToken, requireAdmin)
GET  /api/v1/providers/:providerId/billing-agreement-status  (authenticateToken)
POST /api/admin/providers/:providerId/billing-agreement      (authenticateToken, requireAdmin)
POST /api/admin/providers/:providerId/billing-agreement/suspend    (requireAdmin)
POST /api/admin/providers/:providerId/billing-agreement/reinstate  (requireAdmin)
POST /api/v1/underwriting/disclosure/create         (authenticateToken)
POST /api/v1/underwriting/disclosure/:id/acknowledge (authenticateToken)
GET  /api/v1/underwriting/disclosure/gate-check/:id  (authenticateToken)
POST /api/v1/payouts/trigger-provisional            (authenticateToken)
POST /api/v1/payouts/submit-eob                    (authenticateToken)
POST /api/v1/payouts/reconcile                     (authenticateToken, requireAdmin)
GET  /api/admin/underwriting/review-queue          (authenticateToken, requireAdmin)
POST /api/admin/underwriting/review-queue/:id/resolve  (requireAdmin)
GET  /api/admin/eob-reconciliation                 (authenticateToken, requireAdmin)
GET  /api/admin/benchmarks                         (authenticateToken, requireAdmin)
```

### Database Schema (new tables)

```
system_config                    (key-value config store)
  ├── provisional_payout_percent = '80'
  ├── final_payout_percent_max = '20'
  ├── eob_submission_deadline_days = '30'
  └── segment1_minimum_deposit_percent = '10'

dsp_registry                     (DSP registry cache)
  ├── provider_hpcsa_number
  ├── scheme_code
  └── dsp_effective_from / dsp_effective_to

procedure_benchmarks             (procedure cost reference)
  ├── procedure_code + metro_region + effective_from (UNIQUE)
  └── benchmark_cost_100pct (ZAR at 100% NHRPL)

facilitation_ceiling_calculations (ceiling audit trail)
  ├── application_id
  ├── calculated_ceiling
  ├── variance_percent
  └── hold_triggered / hold_reason

provider_billing_agreements      (provider contract records)
  ├── provider_id
  ├── status (ACTIVE | SUSPENDED | PENDING_SIGNATURE)
  └── billing_cap_multiplier (default 3.00)

tariff_disclosures               (patient disclosure audit trail)
  ├── application_id + patient_id
  ├── disclosure_version + disclosure_text (snapshot)
  ├── dsp_status_at_disclosure
  └── acknowledged / acknowledged_at / acknowledgement_method

payout_stages                    (two-stage payout records)
  ├── stage (PROVISIONAL | FINAL)
  ├── status (PENDING | PAID | FAILED)
  └── scheduled_amount / actual_amount_paid

eob_submissions                  (EOB documentation)
  ├── provider_invoice_amount
  ├── scheme_residual_amount
  ├── reconciliation_status (PENDING | RECONCILED)
  └── final_payout_amount

manual_review_queue              (human review workflow)
  ├── review_type (DSP_UNKNOWN_STATUS | NO_BENCHMARK | TARIFF_INFLATION_HOLD)
  ├── priority (CRITICAL | HIGH | STANDARD)
  └── sla_hours / sla_deadline

underwriting_audit_log           (Shield v5.0 decisions)
  ├── event_type
  ├── actor
  ├── input_data / output_decision / output_data (JSONB)
  └── rule_version = 'SHIELD_V5'
```

### Frontend Pages (new)

```
admin-review-queue.html          Manual review queue dashboard
  ├── Filters: priority, review_type, status
  ├── SLA countdown badges (overdue/urgent/ok)
  └── Approve/Reject/Escalate modal actions

admin-billing-agreements.html    Provider billing agreements
  ├── Status badges (ACTIVE/SUSPENDED/PENDING)
  └── Suspend/Reinstate actions

admin-benchmarks.html            Procedure benchmark CRUD
  ├── Filters: procedure_code, metro_region
  └── Create/Edit modal (benchmark cost, effective date)

admin-eob-reconciliation.html    EOB reconciliation dashboard
  ├── Variance display (invoice vs ceiling)
  └── One-click reconcile button

admin-circuit-breaker.html       Segment 1 circuit breaker monitor
  ├── Tariff inflation chart (table-based, no charting lib)
  └── Active circuit breaker events

provider-billing-agreement.html  Provider onboarding (sign agreement)
  ├── Full agreement text display
  ├── Provider/HPCSA details form
  └── Digital signature with checkbox confirmations

tariff-disclosure.html           Patient tariff gap disclosure
  ├── Full-screen disclosure text
  ├── DSP status notice (DSP/NON_DSP/UNKNOWN)
  ├── Gap breakdown summary
  └── Three-checkbox confirmation (disabled until checked)
```

### Security Controls

```
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
  └── Applied globally in server.js security middleware
  └── Also applied per-router in underwriting routes middleware

Authentication
  └── All underwriting endpoints: authenticateToken required
  └── Admin endpoints: requireAdmin required
  └── No unauthenticated access to any underwriting data

Audit Trail
  └── Every underwriting decision logged in underwriting_audit_log
  └── Input/output stored as JSONB for full traceability
```

---

## Inherited Architecture

All components from v1.6.0 remain unchanged. See [v1.6.0/ARCHITECTURE.md](../v1.6.0/ARCHITECTURE.md) for the full inherited architecture.

### Full Server Route Registration (v1.7.0)

```
app.use('/api/users',         userRoutes)
app.use('/api/applications',  applicationRoutes)
app.use('/api/payments',      paymentRoutes)
app.use('/api/providers',     providerRoutes)
app.use('/api/marketplace',   marketplaceRoutes)
app.use('/api/risk',          riskRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/v2/shield',         shieldRoutes)     (Shield v2 — existing)
app.use('/api',               underwritingRoutes) (Shield v5 — NEW)
```
