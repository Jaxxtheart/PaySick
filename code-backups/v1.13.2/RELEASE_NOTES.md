# Release Notes — v1.13.2

**Release Date**: 2026-09-21
**Version Type**: PATCH — legal entity rename

## Summary

Renames the registered company referenced throughout the site's legal
and disclosure documents from **PaySick (Pty) Ltd** to
**Tech and Artery (Pty) Ltd**, per explicit instruction. Both forms found
in the codebase were renamed — the short form ("PaySick (Pty) Ltd", used
in `tariff-disclosure.html` and backend disclosure/email templates) and
the fuller registered form ("PaySick South Africa (Pty) Ltd", used in
`terms-of-service.html`, `privacy-policy.html`, and `licenses.html`) —
since both refer to the same entity.

**Scope discipline**: only the company-name string ending in "(Pty) Ltd"
changed. The **brand/product name "PaySick" itself is untouched** —
"your PaySick account", "the PaySick platform", the trademark clause
("The name 'PaySick' ... are trade marks of..."), `paysick.co.za` email
addresses, and every other mention of PaySick as a product/brand remain
exactly as they were. This produces the standard, correct legal pattern
of "Entity Name (Pty) Ltd, trading as PaySick" — e.g.
`terms-of-service.html` now reads: "**Tech and Artery (Pty) Ltd**
("PaySick", "we", "us", "our") is a private company... PaySick provides
a digital healthcare payment facilitation service..." The instruction was
read narrowly (rename the registered entity, not the brand) because
nothing else about the request implied a full rebrand, and rewriting
every "PaySick" mention across the entire site would be a much larger,
unrequested change.

Built test-first per CLAUDE.md: `tests/unit/legal-entity-rename.test.js`
was written and confirmed failing (14 of 16 assertions) before any file
was edited.

## Changed

All 16 live occurrences of the entity name, across 7 files:

- `terms-of-service.html` (4): the binding-agreement intro, the "who we
  are" clause, the IP-ownership clause (§8), the indemnification clause
  (§13)
- `privacy-policy.html` (2): the "who we are" clause, the POPIA
  Information Officer postal address
- `licenses.html` (4): the platform-ownership clause, the IP-categories
  clause, the trademark clause, the footer copyright notice
- `provider-billing-agreement.html` (1): the agreement's opening clause
- `tariff-disclosure.html` (2): the disclosure heading, the footer
  registration line
- `backend/src/services/underwriting.service.js` (2): the same
  disclosure heading and footer line, generated server-side (the source
  `tariff-disclosure.html` renders from)
- `backend/src/services/email.service.js` (1): the transactional-email
  footer

## Note: registration numbers not touched

`backend/src/services/underwriting.service.js` and
`tariff-disclosure.html` pair the entity name with a company registration
number ("Registration No. 2023/123456/07") and "NCR Registration:
[Pending]" / "FSCA Registration: [Pending]" placeholders. These are left
exactly as they were — they were placeholder/example values before this
change too (see the `[Pending]` markers), and this release has no real
registration number for Tech and Artery (Pty) Ltd to substitute. If Tech
and Artery (Pty) Ltd's real registration number should appear here,
that's a follow-up with the correct number supplied.

## Removed / Deprecated

None.

## Breaking Changes

None.

## Migration Notes

None. Text-only change across static HTML and two backend service files
(the strings they generate); no schema, API contract, or route change.

## Environmental note (test execution)

Same sandbox constraint as prior releases: no npm registry access, no
`node_modules`. `node --test tests/unit/*.test.js`: 803 tests, 801 pass, 2
fail — the same two pre-existing, unrelated failures noted in every
release since v1.9.0. Both edited backend files
(`underwriting.service.js`, `email.service.js`) were syntax-checked with
`node --check`.
