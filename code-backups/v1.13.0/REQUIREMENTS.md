# Requirements & Specifications — PaySick v1.13.0

**Version**: 1.13.0
**Date**: 2026-10-26

Carries forward all requirements from v1.12.2 and adds the following.

## New Requirements

### Care Agent entry point
| ID | Requirement | Priority |
|----|-------------|----------|
| CA-HOME-01 | The homepage hero has an "Ask PaySick" search bar that sends the typed query to `care-agent.html?q=` | Must Have |
| CA-HOME-02 | Adding the search bar must not change the hero's existing copy or CTAs | Must Have |
| CA-HOME-03 | `care-agent.html` reads `q`, shows a log-in prompt when signed out, and carries the honeypot anchor | Must Have |

### Care Agent behaviour (ported from claude/inspiring-bardeen-b97kat)
| ID | Requirement | Priority |
|----|-------------|----------|
| CA-01 | Every `/api/care-agent` route requires authentication and is rate-limited to 60 requests per 15 minutes | Must Have |
| CA-02 | The model never does arithmetic. Shortfall and term figures come only from PaySick's deterministic functions, and every tool input is re-validated | Must Have |
| CA-03 | No model tool can move money or finalise an application. confirm, approve and execute stay explicit, human-consented HTTP routes, and execution uses the existing marketplace application endpoint | Must Have |
| CA-04 | If there is no API key, or the model errors, refuses, or returns an empty reply, the deterministic engine answers instead | Must Have |
| CA-05 | Requests must be valid for current Claude models: no forced `tool_choice`, and `max_tokens` large enough for thinking | Must Have |
| CA-06 | Every Care Agent state transition is written to `care_agent_audit_log` | Must Have |

## Inherited Requirements
All requirements from v1.12.2 remain in effect. See [v1.12.2/REQUIREMENTS.md](../v1.12.2/REQUIREMENTS.md).

## Deprecated Features
None.
