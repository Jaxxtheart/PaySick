# PaySick v1.11.0 — Release Notes

**Date**: 2026-08-04
**Type**: MINOR — deck slide removed, inbound reply webhook hardened
**Previous**: [v1.10.1](../v1.10.1/) (2026-08-04)

---

## Summary

Two things, both stemming from the same discovery: the outreach agent has been
sending real email for some time, and the deck said it had not.

1. The "Outreach at Scale" slide added in v1.10.0 is **deleted**. It asserted
   that sending was blocked and that no message had ever been sent. Over 40
   outreach emails had in fact been sent. The claim was wrong, so the slide goes
   rather than gets rewritten.
2. The **inbound reply webhook** was never connected, which is worse than inert:
   it means the follow-up sequence has been advancing on providers who already
   replied. The configuration is the operator's to do, but one genuine code
   defect on that path is fixed here so that connecting it does not fail
   silently.

---

## Removed

### Investor deck slide 12, "Outreach at Scale"

The slide claimed:

> "The provider acquisition agent is built, tested and scheduled. It has never
> sent a message, because sending is blocked on DNS and a set of API keys, not
> on engineering."

and carried a scenario row reading "Blocked today, no verified sending domain,
20 sourced, 0 sent".

**Both statements are false.** Nothing in the code gates a send. `POST
/api/outreach/touches/:id/approve` checks the touch is in `draft`, re-runs the
compliance linter, and calls the email service directly. There is no DNS check,
no domain-verification check and no feature flag anywhere in the path. The only
gate is a human clicking Approve.

The underlying error was one of inference: the deliverability section of
`OUTREACH_AGENT_README.md` says to configure DMARC/SPF/DKIM *before sending at
volume*, and that was converted into "sending is blocked", which is a different
and unsupported claim. DMARC/SPF/DKIM affect **inbox placement**, not the ability
to send, and the Google/Yahoo bulk-sender enforcement thresholds sit around 5,000
messages a day, far above current volume.

Deck returns to 20 slides. Counters renumbered 01 through 20 with no gap.

The four other slides added in v1.10.0 (pricing, unit economics, provider
economics, capability value) are unaffected and remain correct: each is derived
from `fee.service.js` or from the shipped service modules, not from an assumption
about deployment state.

**One consequential edit:** the capability slide previously valued each module
"at the exit run-rate of the outreach plan", which pointed at the deleted slide.
It now states its own reference scale directly: 273 active providers doing 13,104
arrangements a year, R242M facilitated. The figures are unchanged; only their
stated basis is now self-contained.

---

## Fixed

### Inbound webhook verified against a re-serialised body

`checkInboundSignature` fell back to `JSON.stringify(req.body)` when the raw
request body was unavailable:

```js
const raw = req.rawBody != null
  ? req.rawBody.toString('utf8')
  : JSON.stringify(req.body || {});   // ← cannot match the signed bytes
```

A Svix signature covers the **exact bytes** Resend sent. A re-serialised body is
a different byte string in all but the luckiest case: key order, unicode
escaping, and whitespace all differ. Verifying against it produces a signature
mismatch that presents identically to a wrong secret, which is precisely the
wrong thing to send an operator chasing. Serverless runtimes that pre-parse the
request body are exactly the environment where this bites.

Replaced with `inboundAuthResult()`, which never re-serialises and returns a
distinct code per failure mode:

| Code | Meaning |
|---|---|
| `NO_WEBHOOK_SECRET` | `RESEND_WEBHOOK_SECRET` unset in production |
| `MISSING_SIGNATURE_HEADERS` | No `svix-id` / `svix-timestamp` / `svix-signature` |
| `RAW_BODY_UNAVAILABLE` | Raw body not captured; the request pipeline is at fault, not the secret |
| `SIGNATURE_MISMATCH` | Headers and body present, HMAC does not match |

Each is returned on the 401 and logged server-side. The reason text names a
configuration fault and never a secret, so returning it is safe and saves a round
trip through the logs during setup.

The `x-webhook-secret` shared-secret fallback is retained and now checked first,
because it does not depend on the raw body at all, which makes it the usable
escape hatch on any runtime that consumes the request stream.

---

## Added

- `tests/unit/outreach-inbound-wiring.test.js` — 17 assertions covering each
  auth outcome, real Svix signature construction and verification, the raw-body
  capture hook in `server.js`, and payload parsing against Resend's actual
  nested `data` envelope.
- `tests/unit/investor-deck-outreach-slide-removed.test.js` — 9 assertions
  pinning the slide's removal, the absence of its false claims and its orphaned
  figures, and deck structure at 20 slides.
- **`OUTREACH_AGENT_README.md`**: ordered setup steps for the inbound webhook, a
  diagnosis table keyed by response code, and a warning that an unwired webhook
  causes follow-ups to chase people who already replied.

## Changed

- `tests/unit/investor-deck-business-case.test.js`: outreach-plan section
  removed along with the slide it covered; structural counts 21 → 20.
- `tests/unit/investor-deck.test.js`, `tests/unit/investor-deck-shield.test.js`:
  structural counts 21 → 20; `01 / 21` added to the superseded-content ban list.

---

## What is still the operator's to do

The code is ready; the wiring is not, and cannot be done from the repository.

1. Add the webhook endpoint in Resend: `POST https://paysick.co.za/api/outreach/inbound`,
   subscribed to the inbound email event. Inbound receiving also needs an MX
   record on the receiving domain. **Sending and receiving are separate setups:**
   a verified sending domain does not give you inbound.
2. Copy the `whsec_…` signing secret into `RESEND_WEBHOOK_SECRET` in Vercel, and
   redeploy. Without a redeploy the running function keeps the old environment.
3. Confirm `SMTP_FROM` and the address Resend receives inbound mail for are the
   same mailbox. Replies land on the `From` address; a reply to an address Resend
   is not receiving for never reaches the webhook, and nothing downstream can
   compensate.
4. Verify end to end: send through the Approve Queue, reply, and check the lead
   flips to `replied` and an onboarding draft appears.

---

## Test results

```
node --test tests/unit/*.test.js
# tests 695
# pass  694
# fail  1
```

26 new assertions, all written and confirmed failing before the implementation.

The single failure is `tests/unit/email-service.test.js`, which cannot resolve
`nodemailer` from the repository root because it is a `backend/` dependency. It
fails identically on a clean checkout and predates this release.

---

## Note on the removal

During implementation the first attempt at deleting the slide's PPTX builder cut
six unrelated slide blocks, because the `// Slide N:` comments in
`downloadPPTX()` are not in sequence and the naive end-boundary matched a much
later comment. It was caught immediately by the slide-count assertion
(`addSlide` returned 14 where 20 was expected), reverted, and redone against
explicit line boundaries. Recorded here because the comment numbering in that
function is genuinely misleading and will catch the next person too.
