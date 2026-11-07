# Architecture — PaySick v1.16.0

**Version**: 1.16.0
**Date**: 2026-10-12

---

## Changes from v1.15.1

Two new service files, one new route, one shared-module extraction, one
body-size-limit change. No new table or migration.

```
BEFORE:
  care-agent.html's #file-input change handler:
    addBubble('user', `Attached: ${file.name}`)
    addBubble('agent', "I can't read inside documents yet, so please
                         tell me the quoted amount and treatment from
                         it in your own words. I'll take it from there.")
                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                         Always this, regardless of the file -- the
                         upload itself went nowhere.

AFTER:
  care-agent.html's #file-input change handler:
    validate file.type / file.size client-side
    fileToBase64(file) -> PaySickAPI.careAgent.uploadDocument(...)
      |
      v
    POST /api/care-agent/sessions/:id/documents
      validate mediaType against ALLOWED_MEDIA_TYPES
      validate decoded size against MAX_DOCUMENT_BYTES
      if ANTHROPIC_API_KEY configured:
        try:
          extraction = extractFromDocument({ base64Data, mediaType })
                            |
                            v
          ┌──────────────────────────────────────────────────────┐
          │ care-agent-document.service.js                       │
          │                                                       │
          │ callAnthropicMessages({                               │
          │   system: DOCUMENT_SYSTEM_PROMPT,                     │
          │   tools: [DOCUMENT_EXTRACTION_TOOL],                  │
          │   tool_choice: forced -> extract_document_fields,     │
          │   messages: [{ role:'user', content: [                │
          │     { type: 'document'|'image', source: {...} },      │
          │     { type: 'text', text: 'Extract...' }               │
          │   ]}]                                                 │
          │ })                                                    │
          │                                                       │
          │ -> parses the ONE forced tool_use block               │
          │ -> { documentType, fields }                            │
          └──────────────────────────────────────────────────────┘
          outcome = executeTool('update_care_summary', fields, {summary})
                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                            SAME guardrail the conversational agent
                            (care-agent-llm.service.js) already uses --
                            independently re-validates every field,
                            never trusts the model's tool-call input.
          merged = mergeCareSummary(summary, outcome.summaryPatch)
          reply = describeExtraction({ documentType, recorded })
                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                            Deterministic sentence builder, not a
                            second LLM call just to phrase a reply.
        catch: fallbackReason = error.message
      else:
        fallbackReason = 'ANTHROPIC_API_KEY not configured'

      if fallbackReason:
        reply = "I can't read documents right now. Please tell me
                 the quoted amount and treatment from it in your
                 own words instead."

      UPDATE care_agent_sessions ...
      recordAudit('DOCUMENT_PROCESSED', { filename, mediaType,
                   documentType, recorded, rejected, fallbackReason })
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   Raw file bytes are never written anywhere --
                   only metadata and the validated extracted fields.
```

`care-agent-anthropic-client.js` is new: the raw fetch/signing/error-
handling primitive both `care-agent-llm.service.js` (conversational
agent) and `care-agent-document.service.js` (this release) now share,
rather than each owning its own copy. `runCareAgentTurn`'s own behaviour
is unchanged -- confirmed by its existing 25-assertion test suite passing
unmodified after the extraction.

## The trust boundary, precisely (extends v1.15.0's)

```
  Document extraction CAN:                 Document extraction CANNOT:
  ───────────────────────────────          ───────────────────────────────
  - classify what kind of document it is   - set a field the document
  - propose field values it read off          doesn't actually state
    the page, as a single forced tool       - set an out-of-enum
    call                                       procedureTypeGuess (schema
                                                + executeTool both reject it)
                                             - overwrite an already-recorded
                                                field (mergeCareSummary)
                                             - reply with free text instead
                                                of the structured tool call
                                                (tool_choice forces it)
                                             - call anything that moves
                                                money or finalizes an
                                                application (no such tool
                                                exists; /approve and /execute
                                                never reference this module)
                                             - persist its own raw bytes
                                                anywhere (route only ever
                                                reads the upload in memory
                                                to forward it to the API)
```

## Test topology

```
tests/unit/
   └── care-agent-anthropic-client.test.js       [NEW] -- 7 assertions,
                                                   the shared low-level
                                                   client, executable here
                                                   via an injected fetchImpl.
   └── care-agent-document.test.js                [NEW] -- 14 assertions,
                                                   tool schema, content-block
                                                   building, forced tool
                                                   choice, response parsing,
                                                   error propagation, the
                                                   deterministic reply builder.
   └── care-agent-route-documents-wiring.test.js  [NEW] -- 7 assertions,
                                                   static-source checks on
                                                   the new route.
   └── care-agent-document-upload-ui.test.js      [NEW] -- 7 assertions,
                                                   the stub is gone, the real
                                                   upload path is wired.
   └── care-agent-route-llm-wiring.test.js        [boundary fix] -- two
                                                   assertions' slice end
                                                   marker moved from
                                                   '/confirm' to the new
                                                   '/documents' route, which
                                                   now sits between
                                                   '/messages' and '/confirm'.
   └── care-agent-llm.test.js                     [unchanged, still green]
```

Runner: `node --test tests/unit/*.test.js` -- 928 tests, 926 pass, 2 fail
(both pre-existing, unrelated -- see RELEASE_NOTES.md's Environmental
note). All edited/new files syntax-checked with `node --check`, including
`care-agent.html`'s extracted inline `<script>`.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits. See
[v1.15.0/ARCHITECTURE.md](../v1.15.0/ARCHITECTURE.md) for the
conversational tool-calling agent this release's guardrail is shared
with.
