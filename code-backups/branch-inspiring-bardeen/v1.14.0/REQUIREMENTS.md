# Requirements & Specifications — PaySick v1.14.0

**Version**: 1.14.0
**Date**: 2026-09-21

Carries forward all requirements from v1.13.6 and its predecessors.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-56 | Procedure-type extraction must attempt a fuzzy, local embedding-similarity match before giving up when no exact keyword phrase is present in the patient's message | Must Have |
| CA-57 | Every procedure-type guess must carry a numeric similarity score (`procedureTypeSimilarity`, 0-1) alongside its existing `'high'`/`'low'` confidence label — the extraction engine must never reduce its actual match strength to a hardcoded boolean alone | Must Have |
| CA-58 | An exact keyword-phrase match (including a tapped procedure chip's label, verbatim) must remain authoritative and score exactly 1 — the new fuzzy fallback only runs when no exact phrase is found | Must Have |
| CA-59 | The fuzzy matcher must never invent a procedure guess for text with no real signal for any category (score must fall below the acceptance threshold and yield `null`, not a weak guess) | Must Have |
| CA-60 | The embedding-similarity matcher must be fully local (no external API call, no new npm dependency, no pretrained model file) so it is testable in this sandbox and swappable behind the same function signature if a real embeddings API is ever wired in | Must Have |

---

## Inherited Requirements

All requirements from v1.13.6 remain in effect. See
[v1.13.6/REQUIREMENTS.md](../v1.13.6/REQUIREMENTS.md).

---

## Deprecated Features

None.
