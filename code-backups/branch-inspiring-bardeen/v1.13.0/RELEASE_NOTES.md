# Release Notes — v1.13.0

**Release Date**: 2026-09-21
**Version Type**: MINOR — new homepage feature (Google-style Care Agent search bar)

## Summary

Supersedes v1.12.1's CTA flip, per corrected product direction: that
release made "Ask PaySick" the hero's primary button and demoted the
traditional "Get Started" CTA to a text link. This release **reverts the
hero back to its original copy and CTA** — "Get Started" / "Learn More",
exactly as it read before v1.12.0 — and instead gives the Care Agent its
own **Google-style search bar**: a single prominent input, centered in the
hero, that a visitor can type into and submit to go straight into a
conversation with the Care Agent. The original call to action about what
PaySick is stays completely intact; the Care Agent gets an additional,
clearly-labelled entry point alongside it, not instead of it.

Submitting the search bar navigates to `care-agent.html?q=<the query>`.
`care-agent.html` now reads that `q` parameter once the conversation
session starts and sends it automatically as the visitor's first message —
the same outcome as if they'd typed it into the chat themselves, just
started one step earlier from the homepage. If the visitor isn't signed
in, they see the same locked state as always (Care Agent API auth is
unconditional per CLAUDE.md); the query is not persisted across the login
boundary in this release — no attempt is made to fake continuity there.

Built test-first per CLAUDE.md: `tests/unit/homepage-agent-first-cta.test.js`
was rewritten to assert the corrected requirements (original CTA restored
+ search bar added) and confirmed failing (7 of 8 assertions) against the
v1.12.1 hero, then the implementation was built until all 8 passed.

## Changed

- **`index.html` hero**: reverted to its pre-v1.12.0 CTA structure exactly
  — `<h1>Healthcare payments<br>made simple</h1>`, `Get Started` →
  `login.html` as `primary-btn`, `Learn More` → `#how-it-works` as
  `secondary-btn`. v1.12.1's rewritten paragraph and button swap are
  undone.
- **Hero paragraph copy**: "Split your medical bill into three easy
  monthly payments" → "Split your medical bill into a payment plan that
  works for you". Requested mid-release: the fixed "three" figure doesn't
  match the Care Agent's own flexible 3/6/12-month options (v1.12.0) or
  the wider marketplace's 3–60 month range (`marketplace.js`), so it's
  replaced with the same generic "payment plan" language already used
  elsewhere in the codebase (e.g. `fee.service.js`'s docstring, Shield's
  disclosure text). Scoped to the hero only — the "How It Works" step 3
  copy, the bottom CTA section, and the `<meta name="description">` still
  say "three months" and were intentionally left alone, not part of what
  was asked this round.
- **`.hero-alt-link` CSS removed**, replaced by `.agent-search` /
  `.agent-search-submit` / `.agent-search-hint` (Google-style search bar:
  white pill, subtle shadow, magnifying-glass icon, focus-ring, circular
  submit button).

## Added

- **Homepage search bar** (`#agent-search-form` / `#agent-search-input`):
  centered, pill-shaped, Google-homepage-style input in the hero, between
  the original paragraph and the original CTA buttons. Submitting (Enter
  or the circular arrow button) navigates to
  `care-agent.html?q=<encodeURIComponent(query)>`; an empty submit goes to
  `care-agent.html` with no query.
- **`care-agent.html` auto-send-from-query**: after `startSession()`
  resolves, reads `new URLSearchParams(window.location.search).get('q')`
  and, if present, calls the existing `sendMessage()` with it — no new
  API endpoint, reuses the same `/api/care-agent/sessions/:id/messages`
  path a normal typed message uses.
- `tests/unit/homepage-agent-first-cta.test.js` rewritten (8 assertions):
  original CTA text/styling/copy restored; search bar present with the
  right id/class; submission targets `care-agent.html?q=`; `care-agent.html`
  reads the `q` param.

## Removed / Deprecated

None as a product feature. v1.12.1's hero-CTA-flip is reverted (see
REQUIREMENTS.md — CA-01 is restored to its v1.12.0 wording, and v1.12.1's
amendment is itself superseded, not carried forward). No route, table, or
page was removed; `.hero-alt-link`'s CSS class is deleted since nothing
references it any more, but the traditional-application link it used to
style is still present in the hero (as the original `primary-btn`, not a
text link).

## Breaking Changes

None.

## Migration Notes

None. Frontend-only (`index.html`, `care-agent.html`), no backend/schema
change — `care-agent.html`'s new behavior calls the same existing
`/api/care-agent/sessions/:id/messages` endpoint v1.12.0 already shipped.

## Environmental note (test execution)

Same sandbox constraint as prior releases: no npm registry access, no
`node_modules`. `node --test tests/unit/*.test.js`: 738 tests, 736 pass, 2
fail — the same two pre-existing, unrelated failures noted in every
release since v1.9.0. The rendered hero was confirmed with a
headless-Chromium screenshot (pre-installed browser binary, not the
`playwright` npm package). Both inline `<script>` blocks
(`index.html`'s search-bar submit handler, `care-agent.html`'s
query-param auto-send) were extracted and syntax-checked with
`node --check`.
