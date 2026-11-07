# Release Notes — v1.12.0

**Release Date**: 2026-10-26
**Version Type**: MINOR — homepage repositioning plus one new frontend module (`js/interest-forms.js`)

## Summary

Repositions the paysick.co.za homepage. It used to present a generic, live
"Heal now, pay later" payments product; it now presents a **healthcare
financing platform in development**, developed by **Tech & Artery (Pty) Ltd**.
The work follows the owner's repositioning brief: approved copy only, no
suggestion that PaySick can lend today, no unsupported operational claims, and
detailed NCR / National Credit Act status kept on the Terms of Service page
rather than the homepage.

Everything was built test-first per CLAUDE.md. Both new suites were written
first and confirmed to fail against v1.11.0 (66/76 and 4/5 assertions
failing), and then the implementation was added until they passed.

## Changed

- **`index.html` — full content rewrite, same brand and layout system.**
  - New hero (eyebrow, H1, body), with CTAs that scroll on the page
    (`Explore how it works` → `#how-it-works`, `Partner with PaySick` →
    `#provider-interest`). A prelaunch disclosure sits beside the hero:
    *"Healthcare financing services are in development. Credit is not
    currently available through this website."*
  - The value proposition now has three pillars (Responsible by design,
    Clear from the beginning, Built for healthcare).
  - "How it will work" has four future-tense steps and an eligibility /
    affordability / credit-law note.
  - The provider section's four proposed capabilities are labelled
    **In development**.
  - New Technology and About sections. The About section names Tech &
    Artery (Pty) Ltd and carries the tagline *"Better access to
    healthcare."*
  - New final-conversion section with two interest forms (see Added).
  - New footer: "PaySick | A Tech & Artery venture", a prelaunch
    disclosure, and links to About, How it works, For providers, Research,
    Contact, Privacy and Terms. Copyright is now © 2026 Tech & Artery
    (Pty) Ltd.
  - Updated title and meta description. Added Open Graph tags and JSON-LD
    (`WebSite`, published by Tech & Artery (Pty) Ltd), all saying the
    platform is in development.
  - Accessibility: `<main>` landmark, steps as an ordered list, decorative
    SVGs `aria-hidden`, form labels, `aria-invalid`, live regions for
    errors and status, and `prefers-reduced-motion` support. Mobile gutter
    is 16px, and the page has no horizontal scroll at 375px (checked in
    Chromium).
- **`terms-of-service.html`**
  - New section **"Credit services and regulatory status"**
    (`#credit-status`), dated 26 October 2026 and marked as a draft for
    review by South African counsel. It says that no credit is offered and
    no applications are accepted through the site, and that any future
    consumer lending depends on NCR registration where the NCA requires it,
    plus other legal and operational requirements. It does not claim any
    filing, registration or established lending entity.
  - Names Tech & Artery (Pty) Ltd as the website operator and IP owner.
    The operator was previously "PaySick South Africa (Pty) Ltd".
  - Removed the statement "PaySick is not a credit provider … not regulated
    by the NCR". The new section replaces it.
  - Effective date is now 26 October 2026, version 1.4.
- **`backend/src/middleware/bot-blocker.js`**: this is the MINOR-bump
  blocklist review. Added `Perplexity-User`, `MistralAI-User`, `Claude-User`
  and `Webzio-Extended`. These are user-triggered AI fetchers with no
  "bot" token, so the generic patterns don't catch them. Rate limits were
  reviewed and left unchanged, because this release adds no routes.

## Added

- **`js/interest-forms.js`**: validation and honest-submission logic for the
  homepage interest forms. It loads in the browser and also as a Node module
  for tests.
  - Patient form: name and email only.
  - Provider form: practice name, contact name, business email, and an
    optional contact number.
  - Each form has a hidden honeypot field (`website`) for spam, plus
    length limits and format checks.
  - **No approved backend exists for interest registrations**, so
    `SUBMISSION_ENDPOINT` is `null`. A valid submission is not sent or
    stored. The visitor is told so plainly and pointed to
    hello@paysick.co.za, and the page never shows a success message. Each
    form also carries a visible "Preview" banner saying this.
- `tests/unit/homepage-repositioning.test.js` (81 assertions)
- `tests/unit/bot-blocklist-review-v1-12.test.js` (5 assertions)

## Removed (from the homepage)

- "Heal Now, Pay Later" tagline, "Healthcare payments made simple" H1
- "Get Started" CTAs into `login.html`; "Join Our Network" into
  `provider-apply.html`; "Browse Provider Directory"
- Claims: "Instant Setup", "immediate access to care", "3-Month Terms",
  "Wide Network … nationwide", "verified in minutes", "24-hour settlements",
  "Zero collection burden", "Available at leading South African healthcare
  providers"
- The routes behind those CTAs still exist and are unchanged. They are just
  no longer linked from the homepage (see Known issues).

## Test results

- `node --test tests/unit/*.test.js`: 778 tests, 776 pass. The 2 failures
  (`email-service.test.js`, `marketplace-lender-gate.test.js`) are suites
  that can't load because `nodemailer` / `pg` are not installed in the
  build sandbox. They fail the same way on v1.11.0 and are not touched by
  this release.

## Known issues / flagged, not fixed (out of scope for a homepage repositioning)

- Other public pages still describe a live product: `about.html`,
  `providers.html`, `provider-apply.html`, `contact.html`, `register.html`,
  `login.html`, `marketplace-apply.html`, `onboarding.html`,
  `investor-deck.html` and `privacy-policy.html`. They still say
  "Heal now, pay later", or use "Get Started" / "apply" flows, or name
  "PaySick South Africa (Pty) Ltd". They are reachable by direct URL.
- `contact.html` shows "Thank you…" even when `/api/contact` fails, and that
  route does not exist. This is a false confirmation and should be fixed
  next as a PATCH.
- The body of `terms-of-service.html` (eligibility, R500–R10,000 limits,
  fees, debit orders) still describes the earlier payment-facilitation
  service. The new section says those terms describe the proposed service
  only, but counsel should rewrite them.
- The homepage's main content still renders as static HTML. The CLAUDE.md
  "JavaScript rendering requirement" was not met by v1.11.0 either, and is
  not changed here.
