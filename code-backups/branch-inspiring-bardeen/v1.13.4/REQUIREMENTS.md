# Requirements & Specifications — PaySick v1.13.4

**Version**: 1.13.4
**Date**: 2026-09-21

Carries forward all requirements from v1.13.3 and its predecessors.

---

## New Requirements

### Care Agent — finite lists must be shown, not guessed

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-46 | Wherever the Care Agent's next question has a finite, known set of valid answers (e.g. the recognized procedure list), that set must be presented to the patient as visible, tappable choices — never left as open-ended free text with an invisible list the patient must guess phrasing against | Must Have |
| CA-47 | A tappable choice's label must itself always be recognized by the extraction engine with high confidence — no round-trip surprise where clicking an option fails to register | Must Have |
| CA-48 | The free-text input must remain available and clearly signposted alongside any chip list, for anything not covered by the finite list | Must Have |
| CA-49 | The Care Agent conversation must never be able to loop indefinitely on an unanswerable question — a fallback path must exist for any field where extraction can legitimately find nothing, without fabricating a value | Must Have |
| CA-50 | A raw-text fallback value stored in the editable summary must be capped to a reasonable display length | Should Have |

---

## Inherited Requirements

All requirements from v1.13.3 remain in effect. See
[v1.13.3/REQUIREMENTS.md](../v1.13.3/REQUIREMENTS.md).

---

## Deprecated Features

None. This is a bug fix plus an additive UI/API capability.
