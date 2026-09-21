# Requirements & Specifications — PaySick v1.12.1

**Version**: 1.12.1
**Date**: 2026-09-21

Carries forward all requirements from v1.12.0 and its predecessors, with
one amendment below.

---

## Amended Requirement

| ID | Requirement (v1.12.0, superseded) | Requirement (v1.12.1, current) |
|----|-------------------------------------|----------------------------------|
| CA-01 | The Care Agent must be reachable as an alternative entry point from the homepage, **without removing or materially changing the existing primary CTA** or traditional application journey | The Care Agent must be the homepage hero's **primary** "get started" CTA. The traditional application journey (`login.html`) must remain fully reachable from the hero, demoted to a secondary/text-link presentation — never removed |

Rationale: explicit product direction changed after v1.12.0 shipped —
the Care Agent, not the traditional form, is meant to be the landing
page's main invitation to start. "Never removed" from the original CA-01
still holds and is restated explicitly on the right, so a future release
cannot read the change as license to drop the traditional path.

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-27 | The hero's `primary-btn`-styled button must link to `care-agent.html` | Must Have |
| CA-28 | Exactly one `primary-btn`-styled element may appear in the hero at a time — no competing primary CTAs | Must Have |
| CA-29 | The traditional application link must appear in the hero, after the Care Agent CTA in document order, without `primary-btn` styling | Must Have |
| CA-30 | The persistent site navigation's own CTA is out of scope for this change — only the hero's relative CTA emphasis changes | Won't Have (this release) |

---

## Inherited Requirements

All requirements from v1.12.0 remain in effect except CA-01, amended
above. See [v1.12.0/REQUIREMENTS.md](../v1.12.0/REQUIREMENTS.md).

---

## Deprecated Features

None. No route, page, table, or documented feature was removed — CA-01's
change is a requirement amendment (a re-prioritization of an existing,
still-present CTA), not a feature removal.
