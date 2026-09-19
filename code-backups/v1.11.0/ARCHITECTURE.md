# Architecture — PaySick v1.11.0

**Version**: 1.11.0
**Date**: 2026-09-19

---

## Changes from v1.10.2

Frontend-only release. No new routes, tables, or services; no schema
migration. Six targeted fixes to the existing onboarding → daily-use
customer journey, found by an executive UX audit and verified against the
live code before implementing.

This branch was developed off v1.10.0 and merged with `main` after v1.10.1
and v1.10.2 landed there (both PATCH-level marketplace/lender-gate
hardening — see their own RELEASE_NOTES.md). This snapshot reflects that
merge; v1.11.0's own changes are entirely on the pages diagrammed below and
never touch `marketplace-auction.service.js`, `lender-gate.service.js`,
`marketplace.js`, or `server.js`.

```
register.html ──▶ verify-email.html ──▶ onboarding.html ──▶ dashboard.html
                                              │                    │
                                   [CHANGED]  │                    │ [CHANGED]
                                   no more    │                    │ repeat-apply
                                   fabricated │                    │ banner +
                                   identity   │                    │ demo-data.js
                                   fallback   ▼                    ▼
                                                            make-payment.html
                                                                    │
                                                          [CHANGED] │ fee-preview
                                                          shown pre-pay
                                                                    ▼
                                                          payment-success.html
                                                                    │
                                                          [CHANGED] │ accurate
                                                          dashboard-lag copy
```

## onboarding.html — legacy path removed

```
BEFORE:
  window.onload
     │
     ├─ fromRegister && regData  ──▶ pre-fill locked fields from register.html data
     │
     └─ else (no regData)        ──▶ [REMOVED] fabricate email/@example.com,
                                       fabricate SA ID from phone digits,
                                       POST /api/users/register anyway

AFTER:
  window.onload
     │
     ├─ onboardingComplete === 'true'  ──▶ redirect to dashboard/admin-dashboard
     ├─ !fromRegister || !regData      ──▶ redirect to register.html   [NEW]
     └─ fromRegister && regData        ──▶ pre-fill locked fields (unchanged)

  Submit handler: single path only (PUT /api/users/profile,
  POST /api/users/banking if bank method chosen). The POST
  /api/users/register call and all fabrication logic are deleted, not
  branched around — there is no live caller left that could reach it.
```

## make-payment.html — fee preview added to the load path

```
loadPaymentDetails()
   │
   ├─ PaySickAPI.payments.getPlans() / getPlan()   [UNCHANGED]
   │     → find payment, render amount/status/details
   │
   └─ if payment not already paid:
         PaySickAPI.payments.getFeePreview(paymentId)   [NEW]
            → GET /payments/:id/fee-preview   [EXISTING backend route,
                                                previously uncalled]
            → if late_fee_amount > 0: show #lateFeeNotice with days
              overdue, fee amount, and new total — before Pay Now is usable
            → failure is caught and logged, non-fatal to payment
```

`api-client.js` gains one wrapper, `payments.getFeePreview(paymentId)`,
alongside the existing `payments.*` methods (`getPlans`, `getPlan`,
`getUpcoming`, `getHistory`, `makePayment`, `getTransactions`) — no new
request pattern, same `PaySickAPI.request()` helper.

## dashboard.html — repeat-application banner + demo-data extraction

```
initDashboard()
   │
   ├─ isDemoMode()?  ──▶ loadDemoData() + getDemoNotifications()   [MOVED]
   │                      now defined in js/demo-data.js, not inline here
   │
   ├─ PaySickAPI.users.getDashboard()
   │     active_plans (hoisted to function scope)   [NEW — was block-scoped]
   │
   └─ PaySickAPI.payments.getPlans()
         │
         ├─ render activePlansList   [UNCHANGED]
         │
         └─ #repeatApplyBanner   [NEW]
               shown when: active_plans === 0
                        OR any active plan has
                           payments_made / number_of_payments >= 0.66
               → links to marketplace-apply.html
               → banner copy swaps between "no plan yet" and
                 "almost done, apply for your next one" phrasing
```

```
dashboard.html   <script src="api-client.js">
                 <script src="js/demo-data.js">     [NEW]
                 <script> ... initDashboard(), etc. (real logic only) </script>

js/demo-data.js  loadDemoData()            [MOVED from dashboard.html]
                 getDemoNotifications()    [MOVED from dashboard.html]
                 (both reference the same DOM ids / fmt() helper dashboard.html
                  defines; loaded before the inline script that calls them)
```

## README.md — documentation-only correction

No code path changed. "Instant Approval up to R850" / "under 60 seconds"
replaced with language matching `backend/src/routes/marketplace.js`'s real
R1,000–R500,000 range and the real (non-instant, three-outcome) decision
flow.

---

## Test topology

```
tests/unit/
   ├── readme-accuracy.test.js                    [NEW]
   ├── onboarding-identity-integrity.test.js       [NEW]
   ├── fee-preview-surfaced.test.js                [NEW]
   ├── payment-success-accuracy.test.js            [NEW]
   ├── dashboard-repeat-application-cta.test.js    [NEW]
   ├── dashboard-demo-data-isolation.test.js       [NEW]
   ├── marketplace-lender-gate.test.js             [from v1.10.1/v1.10.2, merged]
   └── ... (all v1.10.2 suites, unchanged)
```

Runner: `node --test tests/unit/*.test.js`. All 6 new suites were written
and confirmed failing before their corresponding fix, per CLAUDE.md. Full
suite re-run after merging v1.10.1/v1.10.2 into this branch: 692 tests,
690 pass, 2 fail — both pre-existing and unrelated (see note below).

**Environmental note (unchanged from v1.9.0 onward, worse in this
sandbox than in v1.10.2's)**: no `node_modules` are installed anywhere in
this repo (no npm registry access), so any test file requiring a package
that isn't vendored fails at `require()` time regardless of application
code: `tests/unit/email-service.test.js` (`nodemailer`) and
`tests/unit/marketplace-lender-gate.test.js` (`pg`, via
`backend/src/config/database.js`). v1.10.2 recorded only the `nodemailer`
failure because `pg` happened to be installed in the sandbox that cut that
release; it is not installed in this one. Both failures were reproduced
identically against the pre-merge tree, confirming neither is a regression
from this release's changes.

---

## Platform architecture (unchanged from v1.10.2)

See [v1.10.2/ARCHITECTURE.md](../v1.10.2/ARCHITECTURE.md) for the full
request path, Recovery Engine, bot-protection layer, and `/api/v1`
facilitation surface, which this release inherits without modification.
