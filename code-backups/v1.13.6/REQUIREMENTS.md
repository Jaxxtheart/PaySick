# Requirements & Specifications — PaySick v1.13.6

**Version**: 1.13.6
**Date**: 2026-09-21

Carries forward all requirements from v1.13.5 and its predecessors.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-54 | A brand-new Care Agent session must always open with an explicit greeting that introduces the agent, independent of `nextQuestion()`'s per-turn field-specific logic | Must Have |
| CA-55 | The em-dash-free rule (CA-39, v1.13.1) extends to backend-generated patient-facing strings (Care Agent question/reply text in `care-agent.service.js` and `routes/care-agent.js`), not only static HTML/site JS | Must Have |

---

## Inherited Requirements

All requirements from v1.13.5 remain in effect. See
[v1.13.5/REQUIREMENTS.md](../v1.13.5/REQUIREMENTS.md).

---

## Deprecated Features

None.
