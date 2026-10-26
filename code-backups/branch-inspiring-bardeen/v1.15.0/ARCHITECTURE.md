# Architecture — PaySick v1.15.0

**Version**: 1.15.0
**Date**: 2026-09-21

---

## Changes from v1.14.0 — "PaySick 2.0 as a harness for healthcare payments"

One new file, one route rewired. No new table, migration, or env var
(reuses `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`, already declared for the
unrelated outreach feature).

```
BEFORE (v1.14.0 -- single deterministic extraction call per message):

  POST /sessions/:id/messages
    extracted = extractCareRequest(message)      [exact match, then local
                                                    trigram similarity]
    merged = mergeCareSummary(summary, extracted, message)
    reply = nextQuestion(merged) || "..."         [one of a handful of
                                                    fixed strings]

AFTER (v1.15.0 -- the model reasons over the whole conversation and
       decides what to do):

  POST /sessions/:id/messages
    if ANTHROPIC_API_KEY configured:
      try:
        history = loadConversationHistory(sessionId)   [from audit log]
        turn = runCareAgentTurn({ summary, history, userMessage })
                    |
                    v
        ┌─────────────────────────────────────────────────────────┐
        │  runCareAgentTurn (care-agent-llm.service.js)            │
        │                                                          │
        │  loop (max 6 iterations):                                │
        │    call Anthropic Messages API with:                     │
        │      system  = buildSystemPrompt(summary)  [hard rules + │
        │                 known category list + known/missing      │
        │                 fields, refreshed every call]             │
        │      tools   = CARE_AGENT_TOOLS                          │
        │                  - update_care_summary                   │
        │                  - get_shortfall                         │
        │                  - build_term_options                    │
        │      messages = history + new user message                │
        │                                                          │
        │    if model calls a tool:                                │
        │      executeTool(name, input, { summary })                │
        │        -> independently validates input                  │
        │        -> calls the SAME pure functions from              │
        │           care-agent.service.js the old engine used        │
        │           (mergeCareSummary / computeShortfallCents /      │
        │            buildTermOptions) -- model triggers the         │
        │           arithmetic, never performs it itself             │
        │        -> returns a tool_result (ok or is_error)           │
        │      feed the result back, loop again                     │
        │                                                          │
        │    else: return the model's own text as the final reply   │
        └─────────────────────────────────────────────────────────┘
        merged = turn.summary; reply = turn.reply
      catch (llmError):
        fallbackReason = llmError.message
    else:
      fallbackReason = 'ANTHROPIC_API_KEY not configured'

    if no LLM result:                              [resilience fallback,
      extracted = extractCareRequest(message)        v1.14.0 unchanged]
      merged = mergeCareSummary(summary, extracted, message)
      reply = nextQuestion(merged) || "..."

    UPDATE care_agent_sessions ...
    recordAudit(CONVERSATION_TURN, { message, reply, usedLlm, toolCalls,
                                      fallbackReason })
```

`GET /sessions/:id` (resume) is unchanged -- still `nextQuestion(summary)`,
deterministic. `/confirm`, `/approve`, `/execute` are byte-for-byte
unchanged and never reference the LLM service at all (see
`tests/unit/care-agent-route-llm-wiring.test.js`).

## The trust boundary, precisely

```
  Model CAN:                          Model CANNOT:
  ─────────────────────────────       ─────────────────────────────
  - decide what to ask, and when      - state a Rand figure itself
  - call update_care_summary            (system prompt forbids it;
    with what it heard                  nothing enforces this in code
  - call get_shortfall /                beyond the prompt -- see
    build_term_options to               "Known limitation" below)
    trigger PaySick's own math        - set an out-of-enum
  - decide the conversation is          procedureTypeGuess (schema +
    "done" and stop asking              executeTool both reject it)
                                       - overwrite an already-recorded
                                         field (mergeCareSummary)
                                       - call anything that moves
                                         money or finalizes an
                                         application (no such tool
                                         exists)
                                       - assert a shortfall/term-option
                                         figure that doesn't match
                                         PaySick's own server-side
                                         state (get_shortfall /
                                         build_term_options read
                                         session state, not tool input)
```

**Known limitation, disclosed rather than hidden:** the "never state a
number yourself, only report tool output" rule lives in the system
prompt, not in a deterministic code-level check on the model's free text.
A sufficiently adversarial or confused model turn could still say a wrong
number in prose. This is mitigated, not eliminated, by keeping the
patient-facing summary card (the actual source of truth used at
`/confirm`) built from `structured_summary` -- the validated, tool-derived
state -- never from the chat transcript itself. Nothing the model says in
prose is trusted anywhere past this conversation; `/confirm` still
requires the patient to review the summary card built from
`structured_summary`, and `/approve` still requires explicit consent
before anything is submitted downstream.

## Test topology

```
tests/unit/
   └── care-agent-llm.test.js                [NEW] -- 25 assertions,
                                               written and confirmed
                                               failing before any
                                               implementation. Fully
                                               executable here via an
                                               injected fetchImpl (same
                                               seam as
                                               outreach/claude.service.js).
                                               Covers: tool schemas, the
                                               "no money-moving tool"
                                               guardrail, executeTool's
                                               independent validation for
                                               all 3 tools, the
                                               orchestration loop's
                                               multi-round tool chaining,
                                               invalid-input handling,
                                               the iteration cap, and
                                               history reconstruction.

   └── care-agent-route-llm-wiring.test.js   [NEW] -- 6 assertions,
                                               static-source checks that
                                               /messages wires in the new
                                               service with a fallback
                                               and that /approve,
                                               /execute are untouched.

tests/integration/
   └── care-agent.test.js                    [+2 tests] -- LLM success
                                               and LLM-failure-falls-back,
                                               documenting the route
                                               contract; not executable
                                               in this sandbox (no jest).
```

Runner: `node --test tests/unit/*.test.js` -- 889 tests, 887 pass, 2 fail
(both pre-existing, unrelated -- see RELEASE_NOTES.md's Environmental
note). All edited/new backend files syntax-checked with `node --check`.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits. See
[v1.14.0/ARCHITECTURE.md](../v1.14.0/ARCHITECTURE.md) for the local
trigram-similarity engine this release's resilience fallback reuses
unchanged.
