# Architecture — PaySick v1.13.6

**Version**: 1.13.6
**Date**: 2026-09-21

---

## Changes from v1.13.5

One route handler, one string. No new route, table, or migration.

```
BEFORE:
  POST /sessions
    reply = nextQuestion(summary) || "Tell us what's happening..."
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                       UNREACHABLE: nextQuestion({}) is
                                       never null, so this never fires.
    -> patient's actual first message: nextQuestion({})'s bare amount
       question, with an em dash, no greeting.

AFTER:
  OPENING_GREETING = "Hi, I'm the PaySick Care Agent. Tell me what's
                       going on, the treatment, a quote you've received,
                       or a bill you're dealing with, and I'll help you
                       work out how to afford it."

  POST /sessions
    reply = OPENING_GREETING                    [always, unconditional]

  POST /sessions/:id/messages     -> nextQuestion(merged)   [unchanged]
  GET  /sessions/:id (resume)     -> nextQuestion(summary)  [unchanged]

  care-agent.service.js
    nextQuestion()'s amount-question text: em dash -> comma
```

`nextQuestion()` keeps its existing role entirely: narrower, field-
specific follow-ups from the patient's first reply onward. Only the very
first message a brand-new session sends is no longer derived from it.

## Test topology

```
tests/unit/
   └── care-agent-opening-message.test.js   [NEW] — proves the old
                                              fallback text was dead code,
                                              proves the new greeting is
                                              unconditional and self-
                                              introduces the agent, and
                                              re-checks every
                                              nextQuestion() string stays
                                              em-dash-free
```

Runner: `node --test tests/unit/*.test.js` — 844 tests, 842 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). Both edited backend files syntax-checked with `node --check`.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
