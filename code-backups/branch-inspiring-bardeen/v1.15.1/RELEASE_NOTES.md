# Release Notes — v1.15.1

**Release Date**: 2026-09-22
**Version Type**: PATCH — bug fix (homepage search-bar hint text size)

## Summary

Fixes the homepage's search-bar caption ("Powered by the PaySick Care
Agent. Describe your situation and get help figuring out how to afford
it.") rendering far larger than intended, per explicit feedback: "Make
this writing smaller, it's currently bigger than the hero text."

**Root cause**: `.agent-search-hint` (`index.html`) declares
`font-size: 13px; color: #999999`, but the element is itself a `<p>` tag
inside `.hero`, so `.hero p`'s rule (`font-size: 24px; color: #4A4A4A`)
also matches it. `.hero p`'s selector (one class + one element,
specificity 0,1,1) is strictly higher than the bare `.agent-search-hint`
class alone (specificity 0,1,0), so `.hero p` was silently winning
regardless of CSS source order. The caption was rendering at the hero
paragraph's own 24px dark gray, not the intended 13px muted gray —
confirmed by a headless-Chromium screenshot before and after the fix.

## Fixed

- `index.html`: renamed the selector to `p.agent-search-hint`
  (specificity 0,1,1, tying `.hero p`) and kept it declared after
  `.hero p` in the stylesheet, so the CSS source-order tiebreak now
  correctly lets the intended small/muted styling win. Also added an
  explicit `line-height: 1.4` (previously inherited the hero paragraph's
  1.5 as a side effect of the same bug).

## Added

- `tests/unit/homepage-search-hint-font-size.test.js` (4 assertions):
  pins both halves of the fix — the selector must include the `p` type
  qualifier, and its rule must be declared after `.hero p`'s — so a
  future edit can't silently reintroduce the specificity collision.
  Confirmed failing against the pre-fix `index.html` (via `git show
  HEAD:index.html`) before the fix was applied, per CLAUDE.md's Bug
  Fixing Workflow.

## Removed / Deprecated

None.

## Breaking Changes

None — visual-only, one CSS selector rename.

## Migration Notes

None.

## Environmental note (test execution)

Same sandbox constraint as every release since v1.9.0: no npm registry
access, no `node_modules`. `node --test tests/unit/*.test.js`: 893 tests,
891 pass, 2 fail — the same two pre-existing, unrelated failures
(`email-service.test.js` needs `nodemailer`; `marketplace-lender-gate.test.js`
needs `pg`). Visually verified before/after with a headless Chromium
screenshot (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome
--headless --screenshot`) at 1400x1000.
