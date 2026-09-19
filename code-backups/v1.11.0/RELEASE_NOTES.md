# Release Notes — v1.11.0

**Release Date**: 2026-09-19
**Version Type**: MINOR — UX/trust fixes plus one new user-facing capability (late-fee preview, repeat-application banner)

## Summary

Ships the fixes from an executive UX/UI audit of the onboarding → daily-use
customer journey (register → verify-email → onboarding → dashboard →
make-payment → payment-success). The audit's finding, in one line: the
craft was solid, but the marketing promise, the onboarding promise, and
what the backend actually did were three different products, and that gap
is where trust — and revenue — leaks. This release closes every gap that
turned out to be real after verifying each finding directly against the
live code (two of the audit's original findings turned out to already be
fixed or to be dead code — see "Findings that needed no fix" below).

All six changes were built test-first per CLAUDE.md: a failing test was
written and confirmed to fail against the pre-fix code, then the
implementation was added until it passed.

This branch was developed off v1.10.0 and merged with `main` once open to
resolve conflicts against v1.10.1 and v1.10.2 (PATCH — marketplace/
lender-gate hardening), which had landed there in the meantime. That merge
is folded into this snapshot; none of v1.11.0's own changes touch the
marketplace/lender-gate code those two PATCHes fixed.

## Fixed

- **README.md overstated the product.** "Instant Approval up to R850" and
  "Complete in under 60 seconds" matched neither `marketplace.js` (the live
  endpoint `marketplace-apply.html` actually posts to, which accepts
  R1,000–R500,000) nor the real risk-assessment flow, which can resolve to
  approve, decline, or manual review — never a guaranteed instant outcome.
  Corrected to state the real amount range and a non-absolute decision
  time. (`README.md`; `tests/unit/readme-accuracy.test.js`)

- **onboarding.html fabricated identity data.** Any authenticated user who
  reached onboarding without having gone through `register.html` fell into
  a "legacy direct-onboarding path" that silently invented a placeholder
  email (`firstname.lastname@example.com`) and a fake 13-digit SA ID number
  (the phone number's digits, zero-padded) before POSTing to
  `/api/users/register`. This corrupted FICA/POPIA-regulated identity data.
  The path is removed; a user without real registration data is now sent
  back to `register.html` instead.
  (`onboarding.html`; `tests/unit/onboarding-identity-integrity.test.js`)

- **payment-success.html made an inaccurate claim.** It told every user
  "Your payment will reflect on your dashboard within 24 hours." In fact
  `dashboard.html` fetches plans and upcoming payments live via the API on
  every load, and `payments.js` marks a payment `paid` synchronously in the
  same request — there is no such lag. Copy corrected to say the dashboard
  already reflects the payment.
  (`payment-success.html`; `tests/unit/payment-success-accuracy.test.js`)

## Added

- **Late-fee preview surfaced before payment.** `GET /payments/:id/fee-preview`
  already existed server-side but nothing called it — a user only learned a
  5%-per-overdue-month late fee had been added after paying, on the
  receipt. Added `PaySickAPI.payments.getFeePreview()` to `api-client.js`
  and wired it into `make-payment.html`'s load path so an overdue payment
  shows the fee and new total *before* the user clicks Pay Now.
  (`api-client.js`, `make-payment.html`; `tests/unit/fee-preview-surfaced.test.js`)

- **Repeat-application CTA promoted to the main dashboard.** "Apply for
  Funding" previously lived only in the side menu, at the same visual tier
  as "Support" — for a good-standing customer (no active plan, or one
  nearly paid off) this is the platform's highest-LTV action and it was
  effectively invisible. Added a prominent banner on `dashboard.html`,
  above the stats grid, shown when the user has zero active plans or an
  active plan is ≥66% paid off, linking to `marketplace-apply.html`.
  (`dashboard.html`; `tests/unit/dashboard-repeat-application-cta.test.js`)

## Changed (hygiene)

- **Demo data isolated out of dashboard.html.** `loadDemoData()` and
  `getDemoNotifications()` hardcoded a fabricated financial dataset (fake
  balances, a fake provider name, a fake plan) directly in the same
  production file that renders real users' account data. Moved both into
  `js/demo-data.js`, loaded conditionally, so production rendering logic
  and demo fixtures are no longer interleaved in one file.
  (`dashboard.html`, `js/demo-data.js`; `tests/unit/dashboard-demo-data-isolation.test.js`)

## Findings that needed no fix

The original audit flagged two more items that turned out, on closer
verification against the live code, not to need changes in this release:

- **"No affordability data feeds the risk engine"** — true of the dead
  `/api/applications` endpoint (`backend/src/routes/applications.js`, which
  no live page calls), but the actual live application flow
  (`marketplace-apply.html` → `PaySickAPI.marketplace.submitApplication` →
  `marketplace.js`) already collects and submits `monthlyIncome`,
  `monthlyObligations`, `medicalAidCovered`, and `urgencyClassification`.
  No fix needed.
- **"NCA-avoidance language pattern in underwriting.js"** — this was a
  deliberate, already-completed legal/compliance decision (see
  [v1.5.5](../v1.5.5/RELEASE_NOTES.md): "Regulatory terminology compliance
  audit — remove false NCA credit provider claim"), not an oversight. Left
  unchanged.

## Removed / Deprecated

None. No route, table, or page was removed. The onboarding "legacy
direct-onboarding path" removed above was an unreleased internal fallback
that fabricated data — not a documented feature — so it carries no
deprecation notice.

## Breaking Changes

None.

## Migration Notes

None. All changes are frontend-only (HTML/JS) plus one doc fix; no schema
or API contract changes.
