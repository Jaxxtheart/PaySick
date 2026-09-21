# Architecture — PaySick v1.13.4

**Version**: 1.13.4
**Date**: 2026-09-21

---

## Changes from v1.13.3

Bug fix touching the Care Agent's Understand stage only. No new route,
table, or migration.

```
BEFORE:
  care-agent-nlp.service.js
    PROCEDURE_TYPE_KEYWORDS = { 'dental implants': 'dental_implants', ... }
    (flat phrase -> category map, ~14 exact phrases, no UI visibility)

  care-agent.service.js
    mergeCareSummary(existing, extracted)
    -> if extraction finds nothing, treatmentDescription stays missing
       forever -> nextQuestion() repeats the identical question -> LOOP

AFTER:
  care-agent-nlp.service.js
    PROCEDURE_CATEGORIES = [
      { id, label, keywords: [...] }, ...
    ]                                            [NEW — single source of truth]
    PROCEDURE_TYPE_KEYWORDS  <- derived from PROCEDURE_CATEGORIES  [unchanged shape]
    + 'aesthetic', 'nose job' added as 'cosmetic' synonyms          [NEW]

  routes/care-agent.js
    PROCEDURE_OPTIONS = PROCEDURE_CATEGORIES.map(({id,label}) => ({id,label}))
    -> included as `procedureOptions` in:
         POST /sessions            response                        [NEW field]
         POST /sessions/:id/messages response                       [NEW field]

  care-agent.html
    #procedure-options chip container                               [NEW]
    shown iff !readyToConfirm && missingFields.includes('treatmentDescription')
    chip click -> sendMessage(option.label)  (same path as typed text)
    "Not listed? Just describe it below." hint kept the free-text
    escape hatch visible                                            [NEW]

  care-agent.service.js
    mergeCareSummary(existing, extracted, rawMessage)                [NEW 3rd param]
    -> if treatmentDescription is the single top-priority missing
       field on `existing` (computed via missingFieldsFor, same
       priority nextQuestion() uses) AND extraction found nothing,
       falls back to rawMessage (trimmed, capped at 200 chars)
    -> never sets procedureTypeGuess from this fallback

  routes/care-agent.js (POST /sessions/:id/messages)
    mergeCareSummary(session.structured_summary || {}, extracted, message)
                                                           [message now passed]
```

Both fixes are independent and complementary: the chip UI resolves the
*reported* bug at the UX root (show the real list); the `rawMessage`
fallback is the safety net for whatever phrase isn't on that list anyway
— the procedure list can never be fully exhaustive, but the conversation
must never lock up regardless.

## Data flow: chip click to filled field

```
patient taps a chip (e.g. "Cosmetic / Aesthetic Procedure")
  │
  ▼
sendMessage(option.label)                        [care-agent.html]
  │
  ▼
POST /api/care-agent/sessions/:id/messages { message: option.label }
  │
  ▼
extractCareRequest(option.label)                 [care-agent-nlp.service.js]
  -> procedureTypeGuess: 'cosmetic', confidence: 'high'
  (guaranteed: every category label is itself a recognized keyword phrase
   — see care-agent-procedure-options.test.js's round-trip assertion)
  │
  ▼
mergeCareSummary(existing, extracted, message)   [care-agent.service.js]
  -> treatmentDescription filled from extraction directly;
     the rawMessage fallback never even triggers for a chip click
  │
  ▼
missingFieldsFor() no longer includes treatmentDescription
nextQuestion() moves on to the next field, or readyToConfirm
```

## Test topology

```
tests/unit/
   ├── care-agent-treatment-loop-bug.test.js        [NEW/UPDATED] — bug
   │                                                  repro + fix contract
   │                                                  + fallback edge cases
   ├── care-agent-procedure-options.test.js          [NEW] — PROCEDURE_CATEGORIES
   │                                                  shape, round-trip
   │                                                  recognition, regression
   │                                                  check on existing keywords
   ├── care-agent-route-procedure-options.test.js    [NEW] — route exposes
   │                                                  procedureOptions,
   │                                                  never leaks internal
   │                                                  `keywords`
   └── care-agent-procedure-chips-ui.test.js         [NEW] — frontend chip
                                                       contract (static-
                                                       content pattern, no
                                                       DOM runner available)
```

Runner: `node --test tests/unit/*.test.js` — 833 tests, 831 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). All touched backend files and `care-agent.html`'s inline script
were syntax-checked with `node --check`.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
