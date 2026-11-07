# Release Notes — v1.13.4

**Release Date**: 2026-09-21
**Version Type**: PATCH — bug fix (Care Agent treatment-question infinite loop)

## Summary

Fixes a reported bug: the Care Agent's "What treatment or procedure is
this for?" question looped forever for any answer that didn't exactly
match one of the ~14 hardcoded phrases in `care-agent-nlp.service.js`'s
keyword dictionary. A user typed "It's for a nose job", then "Nose
procedure", then "Aesthetic" — the identical question repeated every
time, with no way to escape. Root cause: `extractCareRequest()` returned
`treatmentDescription: null` on no match, `mergeCareSummary()` never
filled it, `missingFieldsFor()` kept reporting it missing, and
`nextQuestion()` kept returning the same string.

This repo's CLAUDE.md mandates a specific bug-fixing workflow: write a
failing test that reproduces the bug first, then use subagents to attempt
independent fixes, then prove the fix with a passing test. That was
followed here — `tests/unit/care-agent-treatment-loop-bug.test.js` was
written and confirmed failing before any fix was attempted, then two
subagents worked independently in isolated git worktrees to fix it.

## Two fixes shipped, addressing the bug from different angles

**1. A user follow-up refined the actual direction wanted**: *"If it's a
finite list then present all the options for the customer to choose from,
don't leave it open ended and assume they'll only pick from the invisible
list."* The recognized-procedure dictionary IS finite, so it's now
restructured into `PROCEDURE_CATEGORIES` (id + human label + matching
keywords per category) and exposed via the API as `procedureOptions` on
both `POST /api/care-agent/sessions` and
`POST /api/care-agent/sessions/:id/messages`. `care-agent.html` renders
these as tappable chips — the same UI pattern already used for the
Stage-1 suggested prompts — whenever the treatment question is the one
currently pending. Tapping a chip sends its exact label as an ordinary
message, which is guaranteed to be recognized (a dedicated test asserts
every category's label round-trips through extraction with high
confidence), so a tap always makes progress. The free-text input remains
available underneath with a "Not listed? Just describe it below." hint,
so nothing not on the list is a dead end.

  As part of the same restructure, "aesthetic" and "nose job" — the exact
  phrases from the bug report — were added as recognized synonyms of the
  existing `cosmetic` category, so those specific inputs are now
  recognized outright with no fallback needed at all.

**2. Both independent subagents converged on the same safety-net design**
for whatever the *next* unrecognized phrase turns out to be (the
procedure list can never cover every possible wording): `mergeCareSummary()`
gains an optional third `rawMessage` parameter. When `treatmentDescription`
is the single field the just-asked question was actually about (computed
from `missingFieldsFor(existing)`, before this turn's extraction is
folded in) and extraction found nothing for it, the raw message text is
used as a fallback — capped at 200 characters so a long ramble doesn't
become an unreadable value in the editable summary card (an idea from
attempt B, folded into the applied version). It never fabricates
`procedureTypeGuess`; that stays whatever extraction actually found.
`routes/care-agent.js`'s one call site now passes the raw `message`
through.

Together: the chip UI is the primary, honest fix (show the real list, per
the user's explicit direction); the raw-text fallback is the safety net
underneath it so the conversation can never lock up again regardless of
future input.

## Changed

- `backend/src/services/care-agent-nlp.service.js`: `PROCEDURE_TYPE_KEYWORDS`
  is now derived from a new `PROCEDURE_CATEGORIES` array (single source of
  truth); added "aesthetic" and "nose job" as `cosmetic` synonyms; every
  category label is itself a recognized keyword phrase.
- `backend/src/services/care-agent.service.js`: `mergeCareSummary()` gains
  the optional `rawMessage` fallback described above.
- `backend/src/routes/care-agent.js`: exposes `procedureOptions` (id/label
  pairs only — never the internal `keywords` matching phrases) in two
  response payloads; passes `message` through to `mergeCareSummary()`.
- `care-agent.html`: new `#procedure-options` chip container, shown
  exactly while the treatment question is pending; clicking a chip calls
  the existing `sendMessage()` path.

## Added

- `tests/unit/care-agent-treatment-loop-bug.test.js` (9 assertions) —
  reproduces the bug, defines the fix contract, proves it fixed. Updated
  once "nose job" itself became a directly-recognized phrase (no longer a
  useful example of "unrecognized text"), swapped to a still-genuinely
  unrecognized example so it keeps exercising the fallback path.
- `tests/unit/care-agent-procedure-options.test.js` (8 assertions) — the
  new `PROCEDURE_CATEGORIES` structure, the two bug-report phrases now
  resolving correctly, and a regression check that existing extraction
  behavior is unaffected.
- `tests/unit/care-agent-route-procedure-options.test.js` (4 assertions)
  — the route exposes `procedureOptions` without leaking internal
  `keywords`.
- `tests/unit/care-agent-procedure-chips-ui.test.js` (6 assertions) —
  pins the frontend contract (chip container, free-text escape hatch,
  correct show/hide conditions, click handler).

## Process note: two subagent attempts, both applied in spirit

Per CLAUDE.md's mandated workflow, two subagents worked independently in
isolated git worktrees against the same failing test file. Both converged
on an equivalent design (the `rawMessage` fallback parameter, same
priority-ordering logic to determine which field a reply was answering).
Attempt A's diff was applied as the base implementation; attempt B's
200-character length cap was folded in as a refinement. Neither attempt
committed or pushed anything themselves — this release is the reviewed,
combined, and verified result.

## Removed / Deprecated

None.

## Breaking Changes

None. `mergeCareSummary()`'s new third parameter is optional and
backward-compatible; `procedureOptions` is an additive response field.

## Migration Notes

None. No schema or route removal; `012_care_agent.sql`'s existing tables
are unaffected.

## Environmental note (test execution)

Same sandbox constraint as every release since v1.9.0: no npm registry
access, no `node_modules`. `node --test tests/unit/*.test.js`: 833 tests,
831 pass, 2 fail — the same two pre-existing, unrelated failures
(`email-service.test.js` needs `nodemailer`; `marketplace-lender-gate.test.js`
needs `pg`). All touched backend files were syntax-checked with
`node --check`; `care-agent.html`'s inline `<script>` was extracted and
syntax-checked the same way. The chip UI's rendering logic could not be
exercised in a real browser/DOM in this sandbox (no jest/DOM test runner
available) — its contract is pinned by static-content assertions
consistent with this repo's existing `*-ui.test.js` pattern, not a live
render. `tests/integration/care-agent.test.js` (Jest/Supertest, not
executable here — see that file's own environmental note) was reviewed by
hand to confirm the new additive `procedureOptions` field doesn't break
its existing `toEqual` assertion, which targets only `missingFields`, not
the full response body.
