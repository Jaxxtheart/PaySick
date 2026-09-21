# Release Notes — v1.12.1

**Release Date**: 2026-09-21
**Version Type**: PATCH — homepage hero copy/CTA change only

## Summary

Follow-up to v1.12.0 (PaySick Care Agent). That release added "Ask PaySick"
to the homepage hero as a small secondary teaser link below the existing
primary "Get Started" button. Per explicit product direction, this release
flips that emphasis: the Care Agent is now the hero's primary, main
"get started" action. The traditional apply-first journey (`login.html`)
is **not removed** — it remains one click away, demoted from a primary
button to a plain text link directly beneath the hero buttons.

No backend, route, service, or non-homepage page changed. This is a
copy/UI tweak confined to `index.html`'s hero section, so per
`code-backups/VERSIONING_GUIDE.md` it is a PATCH, not a MINOR.

Built test-first per CLAUDE.md: `tests/unit/homepage-agent-first-cta.test.js`
was written and confirmed failing (3 of 6 assertions) against the v1.12.0
hero before this change, then the hero markup was edited until all 6
passed.

## Changed

- **`index.html` hero section**:
  - Primary CTA (`.primary-btn`, the prominent red-gradient button) now
    links to `care-agent.html` ("Ask PaySick"), not `login.html`.
  - Secondary button ("See How It Works", was "Learn More") still scrolls
    to `#how-it-works`, unchanged destination.
  - The traditional application link (`login.html`, "Get Started") moved
    from the primary button into a plain text link below the hero
    buttons: "Prefer to apply directly? **Get Started** with the
    traditional PaySick application." — reachable, not primary-styled.
  - Hero paragraph copy rewritten to describe the Care Agent's
    describe-your-situation flow as the way to begin, replacing copy that
    only described the traditional 3-month-split mechanism.
  - The CSS class backing the small secondary hero link was renamed from
    `.ai-agent-teaser` to `.hero-alt-link` to match its new role (it now
    hosts the traditional-path link, not the agent teaser); its visual
    style (dashed-underline red link) is unchanged.
  - Site nav's own "Get Started" button (top-right, all pages) is
    **unchanged** — this release only touches the hero, not the
    persistent nav.

## Added

- `tests/unit/homepage-agent-first-cta.test.js` (6 assertions): the hero
  still links to both `care-agent.html` and `login.html`; the
  `care-agent.html` link carries `primary-btn` styling; the `login.html`
  link does not; the Care Agent link precedes the traditional link in
  document order; exactly one `primary-btn` exists in the hero (no
  competing primary CTAs).

## Removed / Deprecated

None. The traditional application journey and its entry point remain
fully intact and reachable from the homepage — only their visual
prominence relative to the Care Agent changed.

## Breaking Changes

None.

## Migration Notes

None. Frontend-only, one file (`index.html`) plus one new test file.

## Environmental note (test execution)

Same sandbox constraint as v1.12.0: no npm registry access, no
`node_modules`. `node --test tests/unit/*.test.js`: 736 tests, 734 pass, 2
fail — the same two pre-existing, unrelated failures noted in every
release since v1.9.0 (`email-service.test.js` needs `nodemailer`;
`marketplace-lender-gate.test.js` needs `pg`). The new
`homepage-agent-first-cta.test.js` suite (6/6) needs no third-party
dependency and was run directly in this sandbox. The visual result was
also confirmed with a headless-Chromium screenshot of the rendered hero
(`chrome --headless --screenshot` against the local file — the pre-installed
browser binary, not the `playwright` npm package, which is likewise not
installed here).
