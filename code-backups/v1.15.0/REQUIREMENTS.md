# Requirements & Specifications — PaySick v1.15.0

**Version**: 1.15.0
**Date**: 2026-09-21

Carries forward all requirements from v1.14.0 and its predecessors.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-61 | The Care Agent's primary reasoning engine must be a real Anthropic Messages API tool-calling agent that reasons over the full conversation, not a single-message extraction call | Must Have |
| CA-62 | The agent must be given exactly three tools — `update_care_summary`, `get_shortfall`, `build_term_options` — and no tool that can move money, finalize an application, or otherwise bypass the existing `/confirm`/`/approve`/`/execute` human-consent gates | Must Have |
| CA-63 | `get_shortfall` and `build_term_options` must compute from PaySick's own server-side session state, never from the tool call's own input — the model must never be able to assert a figure that doesn't match what was actually recorded | Must Have |
| CA-64 | `update_care_summary` must independently re-validate every field (non-negative integer amounts; `procedureTypeGuess` restricted to the fixed known category ids) before accepting it, and must report an invalid value back to the model as an error rather than silently dropping or accepting it | Must Have |
| CA-65 | A field already recorded in the running summary must never be overwritten by a later tool call (same guarantee as v1.13.4's `mergeCareSummary`, reused unchanged) | Must Have |
| CA-66 | The tool-call loop must have a hard iteration cap and must never leave the patient with an empty reply, even if the cap is hit | Must Have |
| CA-67 | When the LLM path is unavailable (no API key configured) or errors, the route must fall back to the deterministic engine (v1.13.4-v1.14.0) rather than failing the request, and must record which path ran (and why, if it fell back) in the audit trail | Must Have |
| CA-68 | The money-moving routes (`/confirm`, `/approve`, `/execute`) must remain completely unreachable from the LLM tool-calling loop — verified by a static-source test asserting neither route references the LLM service | Must Have |

---

## Inherited Requirements

All requirements from v1.14.0 remain in effect. See
[v1.14.0/REQUIREMENTS.md](../v1.14.0/REQUIREMENTS.md).

---

## Deprecated Features

None. The deterministic engine (CA-56 through CA-60, v1.14.0) is retained
in full as the resilience fallback described in CA-67 above — nothing was
removed from the platform.
