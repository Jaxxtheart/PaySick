# Release Notes — v1.13.1

**Release Date**: 2026-09-21
**Version Type**: PATCH — site-wide copy cleanup

## Summary

Two copy-only changes, done back to back with nothing shipped in
between, so they're released together:

1. Extends v1.13.0's hero-paragraph fix ("three easy monthly payments" →
   "a payment plan that works for you") to every other place on the site
   that hardcoded a fixed "3 months" / "three months" claim, and trims the
   hero paragraph further per a follow-up request.
2. Removes every em dash (—, U+2014) from the live site — all root
   `*.html` pages plus the site's own client-side JS (`api-client.js`,
   `js/demo-data.js`) — replacing each with whatever plain punctuation
   reads correctly in context: a period for two independent clauses, a
   comma for an appositive, a colon or pipe for a title/label separator,
   a plain hyphen for an "empty value" placeholder glyph, or a light
   rewrite where none of those fit cleanly. `terms-of-service.html`'s
   *substantive* legal clause about "three equal monthly instalments"
   (§4.1) is unaffected — no em dash appeared there, so nothing needed
   changing on that specific clause. Purely cosmetic em-dash-only
   punctuation elsewhere in that same file (a regulator contact list)
   was normalized to colons, since that changes no legal meaning.

Built test-first per CLAUDE.md: `tests/unit/site-wide-payment-plan-copy.test.js`
was written and confirmed failing (6 of 7 assertions) before any file was
edited; `tests/unit/homepage-agent-first-cta.test.js` gained two more
assertions (the removed trailing sentence, confirmed failing 1 of 9)
before its corresponding edit.

## Changed

- **`index.html`**:
  - `<meta name="description">`: "Split your medical bills into 3 easy
    monthly payments" → "...into a payment plan that works for you"
  - Features section card: "3-Month Terms" → "Flexible Terms"; its copy
    no longer says "spread over three months"
  - How-it-works step 3: "Pay in 3 Months" → "Follow Your Payment Plan";
    its copy no longer says "split into three equal monthly payments"
  - Bottom CTA section: "three easy monthly payments" → "a payment plan
    that works for you" (same wording as the hero, for consistency)
  - Hero paragraph further trimmed per follow-up request: removed the
    trailing "Available at leading South African healthcare providers.
    No complicated terms, just straightforward payment solutions." The
    hero paragraph now reads: "Get the treatment you need today. Split
    your medical bill into a payment plan that works for you."
- **`about.html`**: stats-grid card "3 Months / Simple Payment Terms" →
  "Payment Plans / Simple, Flexible Terms"
- **`README.md`**: project description "...manageable 3-month payment
  plans..." → "...manageable payment plans..." (matches the tagline just
  above it, which already said "flexible payment plans")
- **`CUSTOM_SVG_ICONS.md`**: icon catalog entry "Calendar - 3-Month
  Terms" renamed to "Calendar - Flexible Terms" to stay consistent with
  the feature card it documents (icon documentation only, not live
  product copy — the icon asset itself is unchanged, a generic calendar
  glyph with no digit baked in)
- **Em dash removal** across 27 HTML pages plus `api-client.js` and
  `js/demo-data.js` (every file that had one): titles/labels like
  "X — Y" became "X | Y" or "X: Y"; independent-clause pairs became two
  sentences ("...the options — no long form up front." → "...the
  options. No long form up front."); appositives became commas
  ("PaySick's application processing — the same Shield-controlled
  process..." → "...processing, the same Shield-controlled process...");
  "empty value" table/stat placeholders (`>—<`, `'—'`) became a plain
  hyphen `-`; a handful of code comments became `-`-separated. Full
  per-file list is in the diff — every touched file is listed in this
  version's `git log`.

## Added

- `tests/unit/no-em-dashes.test.js` (41 assertions: one per live
  `*.html` page plus `api-client.js`/`js/demo-data.js`/`js/security-utils.js`)
  — scans each file for the literal U+2014 character. Confirmed failing
  (24 of 41) before any file was touched.

## Deliberately NOT changed (and why)

- **`terms-of-service.html` § 4.1** ("repayable in three equal monthly
  instalments") — this is the actual, current contractual mechanic of
  the core PaySick product, matching `backend/src/services/fee.service.js`'s
  documented policy ("bill amount split over 3 months"). It is not
  overclaiming marketing copy; it is a legal description of real product
  behavior. Rewording a Terms of Service clause needs a deliberate legal
  review, not a copy pass alongside marketing pages — left untouched, and
  pinned by a new test (`terms-of-service.html — legal contract terms
  deliberately left untouched`) so a future change here is a conscious
  decision, not an accidental drift.
- **`backend/src/services/fee.service.js`**'s docstring — same reasoning;
  it documents real backend policy, not marketing copy.
- **`PROGRESS.md`** and **`code-backups/CHANGELOG.md`**'s historical
  entries — these are development/release history logs; past entries are
  not rewritten to match current copy, the same way earlier
  code-backups/vX.Y.Z snapshots are never edited.
- **`marketplace-apply.html`**'s "Planned" dropdown option — its wording
  about procedure urgency/timing is unrelated to payment terms and was
  left as-is for the payment-plan copy pass. (It did lose an em dash in
  the second change below: "Planned — scheduled..." → "Planned: scheduled
  within the next 2-3 months" — a punctuation-only edit, not a wording
  change.)

## Note on a pre-existing inconsistency found, not fixed

While auditing every "3 month" mention, `terms-of-service.html` § 4.1
(3 fixed instalments, R500–R10,000 per payment plan) turned out to
describe different mechanics than `backend/src/routes/marketplace.js`
(the endpoint the traditional `marketplace-apply.html` journey actually
submits to: R1,000–R500,000, a 3–60 month `requestedTerm`). This predates
this release and is out of scope for a copy-wording pass — flagging it
here for visibility rather than silently leaving it undocumented.

## Removed / Deprecated

None.

## Breaking Changes

None.

## Migration Notes

None. Frontend/documentation copy only.

## Environmental note (test execution)

Same sandbox constraint as prior releases: no npm registry access, no
`node_modules`. `node --test tests/unit/*.test.js`: 787 tests, 785 pass, 2
fail — the same two pre-existing, unrelated failures noted in every
release since v1.9.0 (`email-service.test.js` needs `nodemailer`;
`marketplace-lender-gate.test.js` needs `pg`). The rendered hero was
confirmed with a headless-Chromium screenshot of the local file. Every
HTML file touched by the em-dash removal had its inline `<script>` blocks
extracted and syntax-checked with `node --check` (22 files, all clean);
`api-client.js` and `js/demo-data.js` were checked directly.
