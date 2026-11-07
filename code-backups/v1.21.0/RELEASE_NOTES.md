# Release Notes: v1.21.0

**Release Date**: 2026-10-27
**Version Type**: MINOR: Kehr harness, Journey A (pre-approval before treatment)

## Summary
Owner direction: build the harness blueprint. Kehr reads what it needs
instead of asking for forms, and the journey now starts **before
treatment**. The patient is assessed once (underwriting, documents and
affordability through the Shield gates and the PD/LGD model). They leave
with a pass, and when the bill is ready a provider link converts the pass
into a plan.

As-built reference: [`KEHR_HARNESS.md`](./snapshot/KEHR_HARNESS.md).

## Added
- **Risk model v1.1** (`risk-model.js`): the PD/LGD model extracted from
  `healthcare-risk.service.js`. v1.0 is unchanged; 833 golden cases were
  captured before the extraction. v1.1 adds:
  - a neutral behavioural component, because there are no forms to read;
  - term-aware affordability;
  - `assessRisk`.
- **Pre-approval engine** (`preapproval.service.js`):
  - Shield Gates 5, 3 and 2 at pre-approval (`runPatientGates`), with Gates
    1 and 4 left pending.
  - The hard floors.
  - A term ladder of 12, 6 and 3 months.
  - A ceiling of the shortfall plus 5%.
  - The pass: an `XXX-XXX` code, valid for 90 days, with a 48-hour
    cooling-off for elective care over R15,000.
  - Conversion rules.
- **Consent wallet** (`consent.service.js`):
  - One revocable consent per source, storing the exact purpose text
    agreed to.
  - Health history is optional, and declining never counts against the
    patient.
- **Document cross-check** (`document-crosscheck.service.js`): checks name
  and ID against the identity, the payslip against the bank feed (10%
  tolerance) and statement arithmetic. A mismatch goes to a person.
- **Plan links** (`plan-link.service.js`): HMAC-signed and phone-bound,
  valid for 7 days, single use. The token carries no amount or phone.
- **Adapters (mocks with swap points):**
  - `identity-verification.adapter.js` (DHA + liveness; the selfie is
    never kept)
  - `medical-scheme.adapter.js` (cover and pre-authorisation)
- **Orchestration** (`kehr-preapproval-flow.service.js`) over
  `kehr-repository.js`. It writes `underwriting_audit_log` (`RISK_v1.1`)
  and `manual_review_queue` (`KEHR_*`).
- **Routes** `/api/kehr/*`: consents, pre-approvals (start, documents,
  assess, review), pass, link redemption, and the provider plan-link and
  pass check.
- **Migration** `014_kehr_harness.sql`: `kehr_consents`,
  `kehr_preapprovals`, `kehr_passes`, `kehr_plan_links`.
- **Pages:**
  - `kehr-pass.html`: the patient journey, the pass, and `?link=` landing.
    The token is removed from the address bar after landing.
  - `provider-kehr.html`: check a pass, send a link.
  - Entry links from `kehr.html` and `provider-dashboard.html`.
- `KEHR_HARNESS.md`.

## Changed
- `debicheck.adapter.js`:
  - The creditor is **Tech & Artery (Pty) Ltd**, shown as `KEHR*PLAN`.
    The sponsor is Standard Bank, to be confirmed.
  - Real-time TT1 approval, with `nextStepForResult` falling back to TT2
    on a timeout.
  - The existing interface is unchanged.
- `healthcare-risk.service.js` delegates to `risk-model.js` (v1.0). Its
  behaviour is unchanged.
- Privacy policy **v1.6**:
  - New section 4B, "Kehr pre-approval": the sources read, the separate
    consents, the selfie not being kept, the automated assessment and
    Section 71 review, what providers see, and the creditor name.
  - Two new operators: an open-banking provider and an identity
    verification partner.
  - A retention row for pre-approvals.
- `PRELAUNCH_COMPLIANCE_CHECKLIST.md`: Journey A items, including
  risk-owner sign-off on v1.1, Standard Bank DebiCheck and
  `KEHR_LINK_SECRET`.

## Security and bot review (MINOR bump)
- Rate limits:
  - `kehrLimiter`: 60 per 15 minutes.
  - `kehrAssessLimiter`: 10 per 15 minutes, on assess, link redemption and
    pass checks.
- Bot blocklist additions: `python-httpx`, `aiohttp`, `undici`,
  `Apache-HttpClient`, `Jina-Reader`, `Crawl4AI`, `Firecrawl`,
  `Manus-User`.
- Every new route requires authentication. Provider routes also need the
  provider role, with the provider id taken from the account. Both new
  pages carry the honeypot link and need JavaScript to render.

## Fixed during the build
- The provider plan link pointed to `kehr.html` instead of
  `kehr-pass.html`. The Chromium end-to-end run found it; a test was added
  first and fails without the fix.

## Tests
1471 unit tests, 1469 pass. The 2 failures predate this release: the
`nodemailer` and `pg` modules can't be installed in this environment.

New test files:
- `risk-model`
- `preapproval`
- `kehr-harness-services`
- `kehr-preapproval-flow`
- `kehr-wiring`
- `privacy-policy-kehr-preapproval`

A Chromium end-to-end run at 390px went from pre-approval to the pass, the
provider check and link, then plan setup, with link reuse refused. The
mock API ran the real flow service. It produced no console errors, leaked
no reasons and had no horizontal scroll.

## Removed
Nothing.
