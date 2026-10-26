# Requirements & Specifications — PaySick v1.16.0

**Version**: 1.16.0
**Date**: 2026-10-12

Carries forward all requirements from v1.15.1 and its predecessors.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-70 | A patient must be able to upload a quote, invoice, or medical-scheme statement (PDF/JPG/PNG) and have its fields extracted automatically, rather than retyping them | Must Have |
| CA-71 | Document extraction must force a single structured tool call (never a free-text reply) so the result is always parseable, never ambiguous prose | Must Have |
| CA-72 | Fields extracted from a document must be re-validated through the same guardrail (`executeTool('update_care_summary', ...)`) the conversational agent already uses — never trusted directly, never allowed to invent a procedure category or a negative amount, never overwriting an already-confirmed field | Must Have |
| CA-73 | `schemeContributionCents` must only ever be set from a document that explicitly states a medical-scheme contribution — never inferred from a quote alone | Must Have |
| CA-74 | An uploaded document's raw bytes must never be persisted — only the extracted, validated fields and audit metadata (filename, media type, document type, which fields were recorded/rejected) | Must Have |
| CA-75 | Upload size and media type must be validated before any network call is spent on extraction | Must Have |
| CA-76 | When the LLM path is unavailable or errors, the route must fall back to asking the patient to type the figures, honestly, rather than failing the request or pretending to have read the file | Must Have |
| CA-77 | Every processed document must be written to the audit trail | Must Have |

---

## Inherited Requirements

All requirements from v1.15.1 remain in effect. See
[v1.15.1/REQUIREMENTS.md](../v1.15.1/REQUIREMENTS.md).

---

## Deprecated Features

None. The prior stub behavior (a canned "I can't read inside documents
yet" reply) is replaced by real functionality, not removed as a feature.
