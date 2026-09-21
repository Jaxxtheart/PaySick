# Requirements & Specifications — PaySick v1.13.5

**Version**: 1.13.5
**Date**: 2026-09-21

Carries forward all requirements from v1.13.4 and its predecessors.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-51 | The Care Agent must never silently discard a patient's typed message — if no session exists yet, it must attempt recovery and show the patient's message regardless of outcome | Must Have |
| CA-52 | A session-start failure must distinguish an expired login session (with a direct way to log in again) from a generic/transient failure (with a retry action) — never one indistinguishable dead-end message for both | Must Have |
| CA-53 | Any Care Agent failure state must offer an in-page recovery action (retry button, login link) rather than requiring a manual page reload as the only stated remedy | Must Have |

---

## Inherited Requirements

All requirements from v1.13.4 remain in effect. See
[v1.13.4/REQUIREMENTS.md](../v1.13.4/REQUIREMENTS.md).

---

## Deprecated Features

None.
