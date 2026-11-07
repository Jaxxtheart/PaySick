# Release Notes — v1.16.0

**Release Date**: 2026-10-12
**Version Type**: MINOR — new capability (Care Agent document ingestion)

## Summary

Completes a piece of Care Agent functionality that had shipped as a
visible but non-functional stub since the conversational chip-UI work
(v1.13.4): the paperclip/attach control in `care-agent.html` accepted a
PDF or photo but always replied "I can't read inside documents yet, so
please tell me the quoted amount and treatment from it in your own
words." Per explicit direction ("Complete the functionality's of the care
agent eg the ability to ingest, read, extract patient underwriting
docs"), it now actually reads the file.

**What it does**: a patient attaches a quote, invoice, or medical-scheme
statement (PDF, JPG, or PNG, same types the input already declared). The
backend sends it straight to the Anthropic Messages API's native
document/image support and forces a single structured tool call
(`extract_document_fields`, via `tool_choice`) — the model can never
reply with free text instead, so every response is a real, parseable
field set or nothing at all.

**"AI reasons, PaySick controls" holds at the same boundary already built
for the conversational agent (v1.15.0), reused rather than
re-invented**: whatever the model extracts from the document is fed
through the *exact same* `executeTool('update_care_summary', ...)`
guardrail the conversational tool-calling agent already uses —
independently re-validating every field (non-negative integer amounts,
`procedureTypeGuess` restricted to the fixed known category ids), and
never overwriting a field the patient already confirmed. Document
ingestion adds no new trust boundary; it is simply a second way of
calling into the one that already existed.

**No local OCR fallback.** Unlike the conversational agent, which falls
back to a fully local, dependency-free extractor when `ANTHROPIC_API_KEY`
is unset or the call fails, there is no offline way to read a document in
this codebase. When the LLM path is unavailable, the route says so
plainly and asks the patient to type the figures instead — the same
honest fallback behaviour the old stub approximated, now clearly labelled
as a fallback rather than presented as the only option.

## New Features

- `backend/src/services/care-agent-document.service.js` — the extraction
  engine: `DOCUMENT_EXTRACTION_TOOL` (same field shape as the
  conversational agent's `update_care_summary`, plus a `documentType`
  classification), `extractFromDocument()` (forces the tool call, builds
  a `document` content block for a PDF or an `image` block for a
  JPG/PNG), and `describeExtraction()` (a deterministic, non-LLM
  confirmation sentence — no second model call just to phrase a reply).
- `POST /api/care-agent/sessions/:id/documents` — accepts the upload as
  base64 JSON (no multipart/`multer` dependency needed; it's the same
  shape the Anthropic API itself expects), validates media type and size
  before spending a network call, merges validated fields into the
  session's summary, and writes a `DOCUMENT_PROCESSED` audit entry
  (filename, media type, document type, which fields were recorded or
  rejected, and why it fell back, if it did) — the raw file bytes are
  never persisted, only the extracted, validated fields.
- `care-agent.html`: the attach control now actually uploads, with
  client-side type/size validation, a transient "Reading your
  document..." state, and the exact same summary-card/procedure-chip
  rendering path a chat reply already uses.
- `api-client.js`: `PaySickAPI.careAgent.uploadDocument()`.

## Changed

- `backend/src/services/care-agent-llm.service.js`: the raw Anthropic API
  call (fetch, signing, error handling) is extracted into a new shared
  module, `care-agent-anthropic-client.js`, used by both the
  conversational agent and the new document service rather than
  duplicating that boilerplate a second time. `runCareAgentTurn`'s own
  behaviour is unchanged — its existing test suite (25 assertions) passes
  unmodified after the extraction.
- `backend/src/server.js`: the global JSON body limit rises from 1mb to
  6mb, to fit a base64-encoded document (base64 adds ~33% overhead;
  `MAX_DOCUMENT_BYTES` stays a conservative 4MB with headroom to spare).
  Every route still enforces its own, usually smaller, expectations on
  top of this ceiling.

## Removed / Deprecated

None. The old stub text is gone, replaced by real behavior — not a
removed capability.

## Breaking Changes

None. `POST /sessions/:id/messages`'s contract, and every other existing
Care Agent route, are unchanged.

## Migration Notes

None required to keep running without this feature (no env change
needed — document ingestion shares the same `ANTHROPIC_API_KEY` the
conversational agent already uses, and falls back honestly without it).

## Environmental note (test execution)

Same sandbox constraint as every release since v1.9.0: no npm registry
access, no `node_modules`, and no outbound internet access, so the live
Anthropic API (including its document/vision support) cannot be
exercised here. `node --test tests/unit/*.test.js`: 928 tests, 926 pass,
2 fail — the same two pre-existing, unrelated failures
(`email-service.test.js` needs `nodemailer`; `marketplace-lender-gate.test.js`
needs `pg`). All edited/new backend and frontend files syntax-checked
(`node --check`, including the extracted inline `<script>` from
`care-agent.html`).

New test-first coverage, all written and confirmed failing before any
implementation code, per CLAUDE.md:
- `tests/unit/care-agent-anthropic-client.test.js` (7 assertions) — the
  newly-shared low-level Anthropic client, fully executable here via an
  injected `fetchImpl`.
- `tests/unit/care-agent-document.test.js` (14 assertions) — the
  extraction tool schema, content-block building for PDF vs. image,
  forced `tool_choice`, response parsing, error propagation, and the
  deterministic confirmation-sentence builder.
- `tests/unit/care-agent-route-documents-wiring.test.js` (7 assertions)
  — static-source checks proving the new route validates before
  extracting, falls back honestly, audits every document, re-validates
  through the existing guardrail, and that `/approve`/`/execute` remain
  untouched.
- `tests/unit/care-agent-document-upload-ui.test.js` (7 assertions) —
  the stub text is gone, the real upload path is wired, and client-side
  validation exists.
- `tests/unit/care-agent-route-llm-wiring.test.js` — two of its existing
  assertions had their slice boundary adjusted (the new `/documents`
  route now sits between `/messages` and `/confirm`, where that file's
  slicing helper used `/confirm` as the end marker); confirmed this was
  a boundary-only fix by re-running the file both before and after.
