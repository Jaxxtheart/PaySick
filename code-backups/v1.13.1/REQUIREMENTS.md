# Requirements & Specifications — PaySick v1.13.1

**Version**: 1.13.1
**Date**: 2026-09-21

Carries forward all requirements from v1.13.0 and its predecessors.

---

## New Requirements

### Payment-term copy accuracy (extends CA-36 site-wide)

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-37 | No live page may claim a fixed "3 months" / "three months" payment term anywhere on the site — the platform's own established generic term is "payment plan" | Must Have |
| CA-38 | The core `terms-of-service.html` contractual clause describing the actual current product mechanic (three equal monthly instalments) is exempt from CA-37 — it is a legal description of real behavior, not marketing copy, and changing it requires a deliberate legal review | Must Have |

### Writing style — no em dashes

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-39 | No live site file (any root `*.html` page, `api-client.js`, `js/demo-data.js`, `js/security-utils.js`) may contain the em dash character (—, U+2014) | Must Have |
| CA-40 | Em-dash removal must preserve grammatical correctness — replace with whatever punctuation is correct in context (period, comma, colon, pipe, hyphen), not a blind find-and-replace | Must Have |
| CA-41 | Em-dash removal is scoped to the live site and its client-side JS only — internal project documentation (README.md is covered separately under CA-37; CLAUDE.md, PROGRESS.md, OUTREACH_AGENT_README.md), backend source comments, and frozen `code-backups/vX.Y.Z` snapshots are out of scope and must not be edited | Must Have |

---

## Inherited Requirements

All requirements from v1.13.0 remain in effect. See
[v1.13.0/REQUIREMENTS.md](../v1.13.0/REQUIREMENTS.md).

---

## Deprecated Features

None. No route, page, table, or documented feature was removed.
