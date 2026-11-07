# Release Notes — v1.17.0

**Release Date**: 2026-10-26
**Version Type**: MINOR — branch reconciliation, privacy policy update, Care Agent held-question fix

## Why v1.17.0
Two lines of work cut overlapping version numbers:

| Line | Versions it cut |
|------|-----------------|
| This line (homepage repositioning) | v1.12.0, v1.12.1, v1.12.2, v1.13.0 |
| `claude/inspiring-bardeen-b97kat` (original Care Agent) | v1.12.0, v1.12.1, v1.13.0 to v1.13.6, v1.14.0, v1.15.0, v1.15.1, v1.16.0 |

v1.17.0 is the first number above everything either line used, so every
version number on `main` is unique from here on.

## Branch reconciliation
`claude/inspiring-bardeen-b97kat` is now merged with a real git merge, so its
history is preserved and the branch can be deleted.
- **Kept from this line:** the Care Agent services and tests (the v1.13.0 port,
  with its fixes for current Claude models), `index.html`, and
  `terms-of-service.html`.
- **Taken from the branch (owner approved):**
  - the legal entity rename on privacy, licenses, tariff disclosure,
    provider billing agreement, and the email and underwriting text
  - registration number K2015/346764/07
  - the site-wide payment-plan wording
  - the em-dash cleanup (also applied to the Terms)
- **Entity spelling:** normalised to the owner-confirmed **"Tech & Artery
  (Pty) Ltd"**. The branch used "Tech and Artery".
- **Dropped:** `homepage-agent-first-cta.test.js`, which asserted the branch's
  old hero. `homepage-care-agent.test.js` supersedes it. A meta-description
  assertion in `site-wide-payment-plan-copy.test.js` was narrowed; the
  owner-approved homepage copy is governed by `homepage-repositioning.test.js`.
- **Archives:** `code-backups/vX.Y.Z/` is exactly as on this line. The branch's
  13 diverged archives are kept unchanged, with its CHANGELOG, under
  `code-backups/branch-inspiring-bardeen/`. The archives from v1.11.0 down
  are shared history and identical on both lines.
- `VERSIONING_GUIDE.md` gains a rule: check every remote branch's archives
  before choosing a number, and how to merge colliding archives.

## Privacy policy (`privacy-policy.html` v1.4, 26 October 2026)
- **New section 4A, the PaySick Care Agent:** what it collects (conversation;
  treatment and cost details; details read from an uploaded quote, invoice or
  scheme statement; an audit trail). It also says:
  - the uploaded file itself is not stored
  - a pre-sign-in question is held in the browser for up to 24 hours
  - messages and documents are processed by Anthropic
  - the AI does not decide eligibility or move money
  - using the Care Agent is optional
- Section 5 (special personal information) covers Care Agent health details.
- Section 7.1 lists **Anthropic, PBC** as an operator, and section 8 covers the
  transfer to the USA.
- Retention: a Care Agent row.
- Section 1: the responsible party is Tech & Artery (Pty) Ltd, registration
  number K2015/346764/07.
- **`care-agent.html`** has a point-of-collection notice under the message box,
  linking to section 4A.

## Bug fix: the Care Agent question survives login
- **Before:** a signed-out visitor's search-bar question was lost when
  `login.html` redirected by role.
- **Now:** `js/care-agent-pending.js` holds the question in `localStorage` for
  up to 24 hours, and clears it once it is used or expires.
  - `care-agent.html` saves the question when signed out and says it is
    saved.
  - `login.html` and `onboarding.html` send a patient with a held question
    back to `care-agent.html`. There is no `?next=` parameter, so there is no
    open redirect.
  - After sign-in, the held question is put in the message box to be
    reviewed and sent. It is **not** sent automatically, because on a
    shared device it may have been typed by someone else.
  - A fresh `?q=` from the search bar is still sent at once, and is
    removed from the URL so a reload doesn't resend it.
- Process: the failing test was written first, the fix was attempted by a
  subagent per CLAUDE.md, and the shared-device hardening was test-first on
  top.

## MINOR-bump review
- **Rate limits:** unchanged. No routes were added.
- **Bot blocklist:** reviewed, no change.

## Test results
- `node --test tests/unit/*.test.js`: 1053 tests, 1051 pass. The 2 failures are
  the unchanged `email-service` / `marketplace-lender-gate` suites (they can't
  load `nodemailer` / `pg` in the sandbox).
- **Chromium, held-question flow:** homepage search (signed out), then the
  question is saved, then login sends the patient to the Care Agent, then
  the question is in the message box (not sent) and storage is cleared. With
  nothing held, login still goes to the dashboard. A fresh `?q=` is sent
  once, and not on reload. The Care Agent API was stubbed in the browser
  for the signed-in steps.

## Not done here
- Counsel review of the privacy policy, and the other items in
  `PRELAUNCH_COMPLIANCE_CHECKLIST.md`.
- `tests/integration/care-agent.test.js` still can't run: the npm registry
  is blocked in this environment.
