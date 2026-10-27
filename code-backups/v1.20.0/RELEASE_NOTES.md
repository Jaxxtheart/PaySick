# Release Notes — v1.20.0

**Release Date**: 2026-10-27
**Version Type**: MINOR — Kehr brand identity for the harness (replaces "Care Agent")

## Summary
Owner direction: replace "Care Agent" with a new brand identity that aligns
with PaySick's CI, called **Kehr**, as the identity for the harness.

Kehr is a sub-brand endorsed by PaySick ("Kehr by PaySick"). It uses the
PaySick CI palette, type and components unchanged, and adds its own mark,
wordmark and voice:
- **Mark**: the PaySick mark (halo, rounded bars, white-ringed centre dot)
  with the cross's arms turned 45° to form a K. The name comes from the
  German *kehren*, "to turn".
- **Wordmark**: "Kehr" in weight 400 with "by PaySick" in weight 300, the
  same treatment the PaySick wordmark gives "Pay" and "Sick".
- **Colour**: the PaySick CI values, plus one Kehr-only deep tone, Kehr Wine
  `#7A1426`.
- **Voice**: quiet and factual, outcomes only. It is never called an agent
  or an assistant.

Brand guide: [`KEHR_BRAND.md`](./snapshot/KEHR_BRAND.md).

## Added
- `KEHR_BRAND.md`: name, mark (SVG), wordmark and lockups, colour tokens,
  typography, voice, usage rules.
- `kehr.html`: the Kehr page, moved from `care-agent.html` with history kept.
  It has `--kehr-*` tokens, the lockup in the header and the "Kehr by PaySick"
  title.
- `care-agent.html`: now a redirect stub that keeps `?q=`. It is noindex,
  keeps the honeypot, and has a noscript link.

## Changed
- Homepage search bar: "Ask Kehr", opening `kehr.html`, with the hint "Kehr
  by PaySick".
- Login and onboarding return a held question to `kehr.html`.
- Privacy policy v1.5 (27 October 2026): section 4A is "Kehr by PaySick",
  with one "formerly called the PaySick Care Agent" note. The old
  `#care-agent` anchor is kept. Substance is unchanged.
- The greeting is now "Hi, I'm Kehr from PaySick. …". The model's prompt is
  "You are Kehr, PaySick's …", plus "Never call yourself an agent, an
  assistant or an AI".
- Patient-visible errors now say Kehr: the session-start failure and the
  rate-limit message.
- The chat bubble role class `agent` is renamed `kehr`.
- The workflow plan is renamed `KEHR_WORKFLOW_PLAN.md`; the published plan
  is renamed too.

## Not changed (deliberately)
Internal code names stay as they were, so nothing breaks: `care-agent.*`
services, `/api/care-agent/*` routes, `care_agent_*` tables,
`js/care-agent-pending.js` and `PaySickAPI.careAgent`. Patients never see
them.

## Tests
- Test-first: `kehr-brand.test.js` (20 tests) was written and seen failing
  first.
- Existing tests that read the page or assert the old name are updated to
  `kehr.html` and Kehr: homepage, privacy policy, opening message, pending
  question and UI tests. `static-bot-protection` now covers both
  `kehr.html` and the stub.
- 1307 unit tests, 1305 pass. The 2 failures are the existing
  missing-module ones (`nodemailer`, `pg`).
- Chromium: opening `care-agent.html` lands on `kehr.html`. The full
  account, pay and request flow works, with no page errors, and the lockup
  and mark render correctly.

## Security review (MINOR bump, per CLAUDE.md)
- The new page and the stub both carry the honeypot. The stub sets a robots
  `noindex` meta, and `vercel.json` still sets `X-Robots-Tag` on every
  static path.
- No new API routes. The bot blocklist and rate limits were reviewed (both
  updated in v1.18.0) and are unchanged; only the rate-limit message text
  changes.

## Open item
- Trade mark clearance for "Kehr" (added to `PRELAUNCH_COMPLIANCE_CHECKLIST.md`).
