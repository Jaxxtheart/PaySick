# Release Notes — v1.15.0

**Release Date**: 2026-09-21
**Version Type**: MINOR — new capability (Care Agent becomes a real tool-calling LLM agent)

## Summary

"PaySick 2.0 as a harness for healthcare payments" — per explicit user
direction after v1.14.0's local trigram-similarity fallback ("Which means
it's not agentic as you imply. No I want the LLM. AGENTIC OPTION."), and
after choosing "Full tool-calling agent" when asked whether the model
should call PaySick's internal functions itself or only feed a
deterministic router: the Care Agent's primary reasoning engine is now a
real Anthropic Messages API tool-calling loop
(`backend/src/services/care-agent-llm.service.js`). The model reasons
about the conversation freely — deciding what to ask, when enough is
known, and which of PaySick's own deterministic functions to invoke and
when — while PaySick's code remains the harness: it defines the only
tools that exist, executes every one of them itself, and independently
re-validates every input before trusting it.

This is a genuine architecture shift, not a bigger prompt: the model no
longer just extracts fields from one message in isolation (the old
regex/trigram engines' job). It holds the whole conversation, decides its
own pacing, and actively triggers PaySick's shortfall/term-option
calculations mid-conversation rather than waiting for a fixed route to do
so after the fact.

**"AI reasons, PaySick controls" holds at a new boundary.** Three tools
exist, and no others:

- `update_care_summary` — record a field the patient stated. Every value
  is independently re-validated (non-negative integer amounts;
  `procedureTypeGuess` restricted to the fixed, existing
  `PROCEDURE_CATEGORIES` ids) before being trusted — an out-of-range or
  invented category is rejected and reported back to the model as an
  error, never silently accepted. A field already recorded on an earlier
  turn can never be overwritten (reuses `mergeCareSummary`, unchanged).
- `get_shortfall` / `build_term_options` — thin wrappers around the exact
  same `computeShortfallCents` / `buildTermOptions` pure functions the
  platform already had. They read PaySick's own server-side summary
  state, never the tool call's own input, so the model cannot assert a
  shortfall or payment figure that doesn't match what was actually
  recorded. The model triggers the arithmetic; it never performs it.

No tool exists — and the system prompt is explicit that none should be
inferred — for anything that moves money or finalizes an application.
`/confirm`, `/approve`, and `/execute` remain separate, deterministic,
explicit-human-consent-gated HTTP routes, completely untouched by this
change and unreachable from the tool loop (see
`tests/unit/care-agent-route-llm-wiring.test.js`, which statically proves
neither route references the LLM service at all).

**Resilience, not silent degradation.** When `ANTHROPIC_API_KEY` is not
configured (this dev sandbox has no outbound internet access to call a
live LLM at all — same constraint documented in
`outreach/claude.service.js`'s own header) or the API call errors for any
reason, `POST /sessions/:id/messages` falls back to the deterministic
engine shipped in v1.14.0 (exact-match, then local trigram similarity).
The patient is never left with no response either way, and which path ran
— and why, if it fell back — is recorded on every turn's audit log entry
(`usedLlm`, `fallbackReason`), never hidden.

## New Features

- `backend/src/services/care-agent-llm.service.js` — the tool-calling
  orchestration loop (`runCareAgentTurn`), the three tools
  (`CARE_AGENT_TOOLS`), their validated executor (`executeTool`), and the
  per-turn system prompt builder (`buildSystemPrompt`) that surfaces the
  fixed category list and the patient's already-known/still-missing
  fields so the model never re-asks for what it already recorded.
- `POST /sessions/:id/messages` reconstructs the conversation so far from
  the audit trail (`loadConversationHistory`) and sends it with every
  call, so the model has full context, not just the latest message.
- A hard cap of 6 tool-call round trips per patient message
  (`MAX_TOOL_ITERATIONS`) bounds latency/cost and guarantees the loop
  cannot run forever; hitting it still returns a usable reply rather than
  an empty one.

## Changed

- `POST /sessions/:id/messages` no longer calls `detectIntent` /
  `extractCareRequest` as its primary path — those are retained purely as
  the deterministic fallback. The response no longer includes an `intent`
  field (verified unused by `care-agent.html`, which never referenced it).
- `backend/.env.example`: `ANTHROPIC_API_KEY`'s comment now notes it is
  also required for the Care Agent's primary path, with the fallback
  behavior when unset.

## Removed / Deprecated

None. The deterministic engine (v1.13.4-v1.14.0) is retained in full, as
the resilience fallback — nothing was deleted.

## Breaking Changes

None for callers that only read `summary`, `missingFields`, `reply`,
`readyToConfirm`, `procedureOptions` from `POST /sessions/:id/messages` —
all present, same shapes as before. `reply` text is no longer one of a
handful of fixed strings (it is now the model's own conversational text
on the primary path), so any caller pattern-matching on exact reply
wording would need to loosen to substance-based assertions; the shipped
deterministic-fallback tests already do this correctly since that path's
wording is unchanged. The `intent` field, present but never consumed by
any code in this repository, is removed from the response.

## Migration Notes

None required to keep running on the deterministic fallback (no env
change needed). To enable the agentic path in an environment with
outbound internet access, set `ANTHROPIC_API_KEY` (and optionally
`ANTHROPIC_MODEL`) exactly as already documented for the outreach feature
in `backend/.env.example` — no new env var was introduced.

## Environmental note (test execution)

Same sandbox constraint as every release since v1.9.0: no npm registry
access, no `node_modules`, and — specific to this release — no outbound
internet access, so the live Anthropic API cannot be exercised here
either. `node --test tests/unit/*.test.js`: 889 tests, 887 pass, 2 fail
(the same two pre-existing, unrelated failures: `email-service.test.js`
needs `nodemailer`; `marketplace-lender-gate.test.js` needs `pg`). All
edited/new backend files syntax-checked with `node --check`.

New test-first coverage:
- `tests/unit/care-agent-llm.test.js` (25 assertions) — fully executable
  in this sandbox via an injected `fetchImpl` (the same test seam
  `outreach/claude.service.js`'s `generateDraft`/`generateOnboardingReply`
  already use), covering the full orchestration loop: tool-call chaining,
  invalid-input rejection surfaced back to the model as an error (never
  silently dropped, never thrown), the iteration cap, history
  reconstruction, and the "no tool can move money" guardrail.
- `tests/unit/care-agent-route-llm-wiring.test.js` (6 assertions) —
  static-source checks proving `/messages` wires in the new service with
  a fallback, and that `/approve`/`/execute` remain completely untouched.
- `tests/integration/care-agent.test.js` gains 2 jest tests (LLM success,
  LLM failure → fallback) for documentation of the intended contract;
  written test-first alongside the above but, like the rest of this file,
  not executable in this sandbox (no jest/supertest available).
