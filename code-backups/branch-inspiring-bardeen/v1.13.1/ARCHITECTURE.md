# Architecture — PaySick v1.13.1

**Version**: 1.13.1
**Date**: 2026-09-21

---

## Changes from v1.13.0

Two copy-only passes across the live site. No route, service, table, or
functional behavior changed.

```
Pass 1 — "payment plan" wording, site-wide
   index.html:    meta description, "3-Month Terms" feature card,
                   "Pay in 3 Months" step, bottom CTA, hero paragraph
                   (further trimmed)
   about.html:    stats-grid "3 Months" card
   README.md:     project description
   CUSTOM_SVG_ICONS.md: icon catalog entry (doc-only, matches renamed card)
   terms-of-service.html: UNCHANGED (see REQUIREMENTS.md CA-38)

Pass 2 — em dash (—) removal, whole site
   27 root *.html files + api-client.js + js/demo-data.js
   (every file that had one — see git log for the full list)

   Substitution rules applied (no blind find/replace):
     "Title — Subtitle"        -> "Title | Subtitle"   (title/meta separators)
     "Label — description"     -> "Label: description"  (label/description)
     "clause — clause."        -> "clause. Clause."     (two independent
                                                           clauses -> two
                                                           sentences)
     "noun — appositive."      -> "noun, appositive."   (appositive -> comma)
     ">—<"  /  return '—'      -> ">-<"  /  return '-'  ("empty value"
                                                           placeholder glyph)
     "// comment — more"       -> "// comment - more"   (code comments)
```

## Test topology

```
tests/unit/
   ├── site-wide-payment-plan-copy.test.js   [NEW] — asserts fixed
   │                                          "3 month" claims are gone
   │                                          from marketing copy, and
   │                                          that terms-of-service.html's
   │                                          real contractual clause is
   │                                          UNCHANGED (a guardrail, not
   │                                          just a forward assertion)
   ├── homepage-agent-first-cta.test.js      [CHANGED] — two more
   │                                          assertions for the further-
   │                                          trimmed hero paragraph
   └── no-em-dashes.test.js                  [NEW] — one assertion per
                                               live *.html file (dynamically
                                               enumerated via fs.readdirSync,
                                               so a future new page is
                                               covered automatically) plus
                                               the site's own client JS
```

Runner: `node --test tests/unit/*.test.js` — 787 tests, 785 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). Every HTML file's inline `<script>` blocks were extracted with a
small Python regex helper and syntax-checked via `node --check` (22
files touched by the em-dash pass, all clean); `api-client.js` and
`js/demo-data.js` were checked directly. The rendered hero was confirmed
with a headless-Chromium screenshot of the local file.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
