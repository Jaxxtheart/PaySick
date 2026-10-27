# Kehr harness: Journey A, pre-approval (v1.21.0)

Kehr reads what it needs instead of asking the patient to fill in forms.
Journey A runs **before treatment**: the patient is assessed once and
leaves with a **pass** (code, amount, maximum term, expiry). When the bill
is ready, the provider sends a **plan link**; the patient chooses a term
and approves the debit order in their banking app.

The standards are the ones PaySick already uses. Nothing in Kehr decides
on its own.

## The journey

| Step | Patient sees | Backend does |
|------|--------------|--------------|
| 1. Treatment | Treatment, quoted amount, urgency, medical aid (optional) | `POST /api/kehr/preapprovals` |
| 2. What we'll read | One switch per source, with the exact purpose text | `POST/DELETE /api/kehr/consents`, one row per grant in `kehr_consents` |
| 3. Confirm it's you | A selfie | Liveness token to the verification partner; the photo is never kept |
| 4. Check | "You're pre-approved", "We're checking a few details", or "We can't pre-approve this right now" with "Ask a person" | `POST /api/kehr/preapprovals/:id/assess` (below) |
| 5. Pass | Code, up to R amount, up to N months, from R/month, valid until | `kehr_passes` |
| 6. Provider | (provider) checks the code, sends a link | `GET /api/kehr/provider/passes/:code`, `POST /api/kehr/provider/plan-links` |
| 7. Plan link | Amount, affordable terms only, "Set up my plan" | `POST /api/kehr/plan-links/redeem`, then the existing `POST /api/marketplace/applications` |
| 8. Bank app | Approve `KEHR*PLAN` (Tech & Artery (Pty) Ltd) | DebiCheck TT1, TT2 on timeout |

## What `assess` does

`kehr-preapproval-flow.service.js`, in order:

1. **Consents.** Needs `bureau` plus one income source (`bank_income_once`
   or `document_upload`). Otherwise it returns `needs_consent` and reads
   nothing.
2. **Identity.** `identity-verification.adapter.js` (DHA + liveness). If
   this fails, the case goes to a person (`KEHR_IDENTITY_UNVERIFIED`).
3. **Income.** A bank feed (`income-verification.adapter.js`, Stitch), plus
   an uploaded payslip or statement if that consent is on.
   `document-crosscheck.service.js` checks them against the identity and
   against each other: name, ID, payslip vs salary credits (10%), and
   statement arithmetic. A mismatch goes to a person, never a decline.
4. **Scheme cover.** `medical-scheme.adapter.js`, only with `scheme_cover`
   consent. The shortfall is the estimate less cover.
5. **Assessment.** `preapproval.service.js`:
   - Shield Gates 5, 3 and 2 (`runPatientGates`) at each of 12, 6 and 3
     months.
   - The hard floors in `affordability-policy.js`.
   - Risk model v1.1 (PD × LGD, expected loss).

   The ceiling is the largest amount that passes, up to the shortfall plus
   5%. Gates 1 (provider) and 4 (tariff) are recorded as pending.
6. **Record.** `underwriting_audit_log` (`KEHR_PREAPPROVAL_ASSESSED`,
   rule version `RISK_v1.1`) holds every input fact, the outcome and the
   per-term trace. Review cases go to `manual_review_queue`.
7. **Pass.** It is issued only when the outcome is `pre_approved`. It is
   valid for 90 days. An elective case over R15,000 waits 48 hours first.

The patient response is always a patient view: no reasons, gates, scores
or traces (v1.19 rule).

## Conversion (the plan link)

- The token is `base64url(payload).HMAC-SHA256`. The payload holds the
  link id, provider id, a phone hash and an expiry: no phone, name or
  amount.
- The link is bound to the patient's number, expires after 7 days and can
  be redeemed once.
- `evaluateConversion` handles these cases:
  - A pass that has expired or is cooling off.
  - A different procedure, or a bill above the ceiling: reassessed by a
    person.
  - A pass older than 30 days: income is re-read first.
- The **full** `runShieldDecision` (Gates 1 to 5) runs on the real bill for
  each term the pass allows. Only the terms that pass are offered. A pass
  that already served its cooling-off is not made to wait again.
- The plan itself is created by the existing marketplace endpoint, as in
  the Care Agent flow.

## Risk model v1.1

`risk-model.js` holds both versions. v1.0 is unchanged and is still used by
`healthcare-risk.service.js`; 833 golden cases prove the extraction changed
nothing. v1.1 is used only by Kehr pre-approval:

- **Behavioural component fixed at a neutral 50.** v1.0 reads form-filling
  behaviour, and Kehr has no forms. This is conservative: about +0.8 pp PD
  for a typical applicant.
- **Term-aware affordability.** It uses the instalment for the term on
  offer, not amount / 3.
- **Neutral provider at pre-approval.** Provider score is the model
  default and network partnership is false, so borderline cases go to a
  person.

**Both changes need risk-owner sign-off before launch**
(PRELAUNCH_COMPLIANCE_CHECKLIST.md).

## DebiCheck

- Creditor: **Tech & Artery (Pty) Ltd**, shown as `KEHR*PLAN`.
- Sponsor bank: **Standard Bank** (to be confirmed).
- The mandate starts as TT1, approved in the banking app in real time.
  `nextStepForResult` decides what happens next:
  - Approved: create the plan.
  - Rejected: tell the patient.
  - TT1 timeout: re-issue as TT2.
  - TT2 timeout: offer the secure form.

## Protection

- Every route needs authentication. The provider routes also need the
  provider role, and the provider id is resolved from the account, never
  taken from the request.
- Rate limits: `kehrLimiter` (60 per 15 minutes), plus `kehrAssessLimiter`
  (10 per 15 minutes) on assess, link redemption and pass checks.
- `X-Robots-Tag` on every response. Both new pages have a honeypot link and
  need JavaScript to render.
- Bot blocklist reviewed for v1.21.0: `python-httpx`, `aiohttp`, `undici`,
  `Apache-HttpClient`, `Jina-Reader`, `Crawl4AI`, `Firecrawl`, `Manus-User`.
- Plan links are refused in production until `KEHR_LINK_SECRET` is set.

## Mocks and production swap points

| Adapter | Mock | Production |
|---------|------|-----------|
| `identity-verification.adapter.js` | SA ID checksum; selfie token required | KYC partner (DHA + liveness) |
| `income-verification.adapter.js` | Seeded by patient id | Stitch open banking |
| `medical-scheme.adapter.js` | Deterministic cover by tier | Scheme switch or broker API |
| `debicheck.adapter.js` | `PENDING_AUTHENTICATION` | Standard Bank DebiCheck (TT1/TT2) |
| `whatsapp.adapter.js` | `mock_sent` | Meta WhatsApp Cloud API, template `kehr_plan_link` |
| `kehr-document-reader.service.js` | none (needs `ANTHROPIC_API_KEY`) | Anthropic Messages API |

## v1.22.0 additions

### Document reader
`kehr-document-reader.service.js` reads an uploaded payslip or bank
statement into figures.

- It makes one Anthropic call with the `extract_income_document` tool. The
  output is normalised before use: integer cents, a 13-digit ID and bounded
  names. Anything malformed makes the document "unreadable", never a guess.
- The figures go through the same cross-check as a bank feed. The file is
  never stored.
- Route: `POST /api/kehr/preapprovals/:id/documents/upload`. It needs the
  `document_upload` consent, accepts a PDF, JPG or PNG under 4MB, and uses
  the tight rate limit.
- Without `ANTHROPIC_API_KEY` the route returns 503, and the page suggests
  connecting the bank instead.

### WhatsApp delivery
`whatsapp.adapter.js` sends the plan link as the approved template
`kehr_plan_link` through the Meta Cloud API.

- It is live when `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
  are set; otherwise it is a mock, and the provider sees "Test mode: not
  sent".
- It sends only when the provider ticks that the patient agreed to
  WhatsApp. The message carries the provider name and the link token; no
  amount, patient name or health information.
- A failed send never loses the link. The send is audited as
  `KEHR_PLAN_LINK_SENT`, with no phone number.

### Passkeys
Passkey sign-in uses WebAuthn, verified with Node's crypto (no package):

- `utils/cbor.js`
- `webauthn.service.js`: ES256 and RS256, "none" attestation, user
  verification required, clone detection by signature counter.
- `passkey.service.js`: single-use challenges, valid 5 minutes and tied to
  a purpose and a user.
- `passkey-repository.js`
- Migration `015_passkeys.sql`

Routes, under `/api/auth/passkeys` with the auth rate limit:

- Register, list and remove need a signed-in user.
- The two sign-in routes are the authentication itself, like
  `/api/users/login`. A verified sign-in gets the same `createSession`
  as a password login, and only active accounts can sign in.

Configuration:

- `WEBAUTHN_RP_ID` (the site's domain) and `WEBAUTHN_ORIGINS`.
- In production, passkeys return 503 until both are set.

UI:

- "Sign in with a passkey" on `login.html`.
- "Add a passkey" on the pass.
- A plan link opened while signed out is held for the tab, and sign-in
  returns to it.

Tested end to end in Chromium with a virtual platform authenticator:
register, sign out, open the plan link, passkey sign-in, then plan.

## Files

- Services:
  - `consent.service.js`
  - `document-crosscheck.service.js`
  - `plan-link.service.js`
  - `preapproval.service.js`
  - `risk-model.js`
  - `kehr-preapproval-flow.service.js`
  - `kehr-repository.js`
- Adapters:
  - `identity-verification.adapter.js`
  - `medical-scheme.adapter.js`
  - `debicheck.adapter.js` (extended)
- Route: `routes/kehr.js`, mounted at `/api/kehr`.
- Migration: `014_kehr_harness.sql`.
- Pages:
  - `kehr-pass.html` (patient, including `?link=` landing)
  - `provider-kehr.html`
- Tests:
  - `risk-model`
  - `preapproval`
  - `kehr-harness-services`
  - `kehr-preapproval-flow`
  - `kehr-wiring`
  - `privacy-policy-kehr-preapproval`
- v1.22.0:
  - `kehr-document-reader.service.js`
  - `whatsapp.adapter.js`
  - `utils/cbor.js`
  - `webauthn.service.js`
  - `passkey.service.js`
  - `passkey-repository.js`
  - `routes/passkeys.js` (mounted at `/api/auth/passkeys`)
  - migration `015_passkeys.sql`
  - `js/passkey.js`
  - tests: `kehr-document-reader`, `kehr-whatsapp`, `kehr-passkeys`,
    `kehr-v1-22-wiring` and `privacy-policy-kehr-v1-22`
