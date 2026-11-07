# Architecture: PaySick v1.21.0

**Version**: 1.21.0
**Date**: 2026-10-27

## Changes from v1.20.0
Adds Kehr Journey A (pre-approval before treatment) alongside the existing
Kehr conversation at `/api/care-agent`.

```
kehr-pass.html (patient)              provider-kehr.html (provider)
   │ PaySickAPI.kehr.*                    │ PaySickAPI.kehr.createPlanLink / checkPass
   ▼                                      ▼
/api/kehr/*  routes/kehr.js  (authenticateToken; provider: + requireProvider)
   │   kehrLimiter 60/15m · kehrAssessLimiter 10/15m (assess, redeem, pass check)
   ▼
kehr-preapproval-flow.service.js ──────────── kehr-repository.js ──▶ Postgres
   │                                             kehr_consents, kehr_preapprovals,
   │                                             kehr_passes, kehr_plan_links (014)
   │                                             underwriting_audit_log (RISK_v1.1)
   │                                             manual_review_queue (KEHR_*)
   ├─ consent.service.js          one consent per source
   ├─ identity-verification.adapter.js   ID + liveness (mock)
   ├─ income-verification.adapter.js     Stitch bank feed (mock)
   ├─ document-crosscheck.service.js     name, ID, payslip vs bank, arithmetic
   ├─ medical-scheme.adapter.js          cover + pre-auth (mock)
   ├─ preapproval.service.js
   │     ├─ shield-gates.runPatientGates   Gates 5, 3, 2   (1 and 4 pending)
   │     ├─ utils/affordability-policy     hard floors
   │     └─ risk-model.assessRisk          v1.1 PD × LGD
   ├─ plan-link.service.js        HMAC token, phone hash, 7 days
   └─ conversion: shield-gates.runShieldDecision (Gates 1 to 5) per term
         └─▶ handoff ▶ POST /api/marketplace/applications (existing)
                         └─▶ debicheck.adapter (Tech & Artery, KEHR*PLAN, TT1 → TT2)

healthcare-risk.service.js ──delegates──▶ risk-model.js v1.0 (unchanged)
```

Patient responses are patient views only (v1.19 rule). Decisions and
traces stay in `kehr_preapprovals.assessment` and `underwriting_audit_log`.

The rest is as in [v1.20.0/ARCHITECTURE.md](../v1.20.0/ARCHITECTURE.md).
