# Release Notes: v1.22.0

**Release Date**: 2026-10-27
**Version Type**: MINOR: Kehr document reader, WhatsApp plan links, passkey sign-in

## Summary
Builds the three pieces v1.21.0 left out of Journey A:
- A patient who doesn't connect their bank can upload a payslip or
  statement; it is read into figures and the file is not kept.
- A provider can send the plan link on WhatsApp.
- A patient can sign in with a passkey (fingerprint, face or screen lock)
  instead of a password.

## Added
- **Document reader** (`kehr-document-reader.service.js`):
  - One Anthropic call with the `extract_income_document` tool.
  - Strict normalisation: integer cents, a 13-digit ID and bounded names.
    Anything else is "unreadable".
  - The figures go through the existing cross-check; the file is never
    stored.
  - `flow.readDocument` needs the `document_upload` consent.
  - Route: `POST /api/kehr/preapprovals/:id/documents/upload`. It accepts a
    PDF, JPG or PNG under 4MB, returns 503 without `ANTHROPIC_API_KEY`, and
    uses the tight rate limit.
  - An upload control on `kehr-pass.html`.
- **WhatsApp delivery** (`whatsapp.adapter.js`):
  - The Meta Cloud API template `kehr_plan_link` is used when
    `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set;
    otherwise it is a mock.
  - It sends only when the provider confirms the patient agreed.
  - The message carries the provider name and the link only.
  - A failed send keeps the link. The send is audited as
    `KEHR_PLAN_LINK_SENT`, with no phone number.
  - A checkbox and delivery status on `provider-kehr.html`.
- **Passkeys (WebAuthn), built on Node's crypto, with no package:**
  - `utils/cbor.js`
  - `webauthn.service.js`: ES256 and RS256, "none" attestation, user
    verification required, origin, relying-party and challenge checks,
    and clone detection by signature counter.
  - `passkey.service.js`: single-use challenges, valid 5 minutes and tied
    to a purpose and a user.
  - `passkey-repository.js`
  - Migration `015_passkeys.sql`
  - `routes/passkeys.js` at `/api/auth/passkeys`, behind the auth rate
    limit. Register, list and remove need a signed-in user. Sign-in issues
    the same session as a password login, and only for active accounts.
  - `js/passkey.js`
  - "Sign in with a passkey" on `login.html`, and "Add a passkey" on the
    pass.

## Changed
- `login.html`: after any sign-in, a plan link the patient opened while
  signed out takes them back to `kehr-pass.html`.
- Privacy policy **v1.7**, covering:
  - the AI reading of uploads, with the file not kept
  - WhatsApp, only with agreement and never the amount
  - passkeys: biometrics stay on the device, and we store a public key
    only
  - WhatsApp (Meta) as an operator and a cross-border transfer
- `KEHR_HARNESS.md` and `PRELAUNCH_COMPLIANCE_CHECKLIST.md`.

## Security and bot review (MINOR bump)
- Rate limits:
  - Upload: `kehrAssessLimiter` (10 per 15 minutes).
  - Passkey login and register: `authLimiter`.
  - Other thresholds are unchanged.
- Bot blocklist additions: `GoogleOther`, `Amzn-User`,
  `Gemini-Deep-Research`, `ChatGPT-Agent`, `meta-webindexer`,
  `Cloudflare-AutoRAG`.
- The two passkey sign-in routes are unauthenticated by nature, as
  `/api/users/login` is. They return a challenge or a session only, are
  rate limited, and log failures (`PASSKEY_LOGIN_FAILED`).

## Fixed
- `provider-kehr.html`: result labels ("Link", "WhatsApp") broke
  mid-word. Only the long link value now wraps.

## Tests
1554 unit tests, 1552 pass. The 2 failures predate this release: the
`nodemailer` and `pg` modules can't be installed here. The passkey tests
use real P-256 and RSA keys.

A Chromium end-to-end run at 390px used a virtual platform authenticator.
The mock API ran the real flow and passkey services, with a stubbed
document reader because Anthropic can't be reached from here. It covered:
- pre-approval by statement upload, then the pass
- adding a passkey
- the provider link with WhatsApp in test mode
- signing out and opening the link
- passkey sign-in, then the plan

The server's signature counter matched the authenticator's. There were no
console errors and no horizontal scroll.

## Removed
Nothing.
