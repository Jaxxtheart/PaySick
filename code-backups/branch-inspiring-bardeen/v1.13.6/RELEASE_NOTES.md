# Release Notes — v1.13.6

**Release Date**: 2026-09-21
**Version Type**: PATCH — bug fix (Care Agent opening message)

## Summary

Fixes the Care Agent's opening message, per explicit feedback ("the
opening message also needs some work"). Two problems, found together:

1. **The friendly greeting was dead code.** `POST /api/care-agent/sessions`
   built its reply as `nextQuestion(summary) || "Tell us what's
   happening..."`. For a brand-new session, `missingFieldsFor({})` always
   includes `quotedAmountCents`, so `nextQuestion({})` is never `null` —
   the fallback text could never actually fire. The message every new
   patient actually saw first was `nextQuestion()`'s bare amount
   question, with no greeting at all: *"Upload the quote if you have it,
   or tell me the quoted amount — I'll use it to work out the likely
   shortfall."*
2. That same string still had an **em dash** — missed by the site-wide
   em-dash removal (v1.13.1), because `backend/src/services/*.js` wasn't
   in that pass's file scope even though this particular string is
   genuinely rendered to patients on the page.

## Changed

- **`backend/src/routes/care-agent.js`**: `POST /sessions` now always
  returns a dedicated `OPENING_GREETING` constant — *"Hi, I'm the PaySick
  Care Agent. Tell me what's going on, the treatment, a quote you've
  received, or a bill you're dealing with, and I'll help you work out how
  to afford it."* — instead of routing through `nextQuestion()`.
  `nextQuestion()` remains exactly as before for every turn *after* the
  patient's first reply (`POST /sessions/:id/messages` and the
  resume path, `GET /sessions/:id`), where a narrower follow-up is the
  right tone once the conversation is already under way.
- **`backend/src/services/care-agent.service.js`**: removed the leftover
  em dash from the amount-question text (comma instead — no other
  wording change).

## Added

- `tests/unit/care-agent-opening-message.test.js` (4 assertions):
  confirms `nextQuestion({})` is never null (proving the old fallback was
  unreachable), confirms `POST /sessions` no longer derives its reply
  from `nextQuestion()`, confirms `OPENING_GREETING` exists and
  introduces the agent, and confirms every `nextQuestion()` string
  (across all three missing-field stages) is em-dash-free.

## Removed / Deprecated

None.

## Breaking Changes

None. `reply` is still a plain string in the same response shape;
only its content and how it's derived changed.

## Migration Notes

None. No schema or route removal.

## Environmental note (test execution)

Same sandbox constraint as every release since v1.9.0: no npm registry
access, no `node_modules`. `node --test tests/unit/*.test.js`: 844 tests,
842 pass, 2 fail — the same two pre-existing, unrelated failures
(`email-service.test.js` needs `nodemailer`; `marketplace-lender-gate.test.js`
needs `pg`). Both edited backend files syntax-checked with `node --check`.
`tests/integration/care-agent.test.js`'s existing `POST /sessions`
assertion (`typeof res.body.reply === 'string'`) was reviewed by hand and
confirmed unaffected — it doesn't assert exact reply text.
