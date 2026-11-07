# Requirements & Specifications — PaySick v1.13.0

**Version**: 1.13.0
**Date**: 2026-09-21

Carries forward all requirements from v1.12.1 and its predecessors, with
CA-01 restored below and new requirements added for the search bar.

---

## Amended Requirement (reverts v1.12.1's amendment)

| ID | Requirement (v1.12.1, superseded) | Requirement (v1.13.0, current) |
|----|-------------------------------------|----------------------------------|
| CA-01 | The Care Agent must be the homepage hero's **primary** "get started" CTA. The traditional application journey must remain reachable, demoted to a secondary/text-link presentation | The homepage hero's original call to action about what PaySick is (headline, paragraph, "Get Started" as `primary-btn`, "Learn More" as `secondary-btn`) must be preserved unchanged. The Care Agent gets its own additional, clearly-labelled entry point (a search bar) — it does not replace or outrank the original CTA |

Rationale: corrected product direction. v1.12.1 read as "make the agent
the main thing" too literally, at the cost of the original marketing
promise. The actual ask was an additional entry point, not a
replacement — a Google-style search bar sitting alongside the untouched
original CTA.

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-31 | The homepage hero must contain a single-field search bar styled after Google's homepage search (centered, pill-shaped, magnifying-glass icon, subtle shadow) | Must Have |
| CA-32 | Submitting the search bar must route the typed text to `care-agent.html` as a `q` query parameter | Must Have |
| CA-33 | `care-agent.html` must read a `q` parameter, if present, and send it as the conversation's first message once the session has started — reusing the existing message endpoint, not a new one | Must Have |
| CA-34 | An empty search-bar submission must still navigate to `care-agent.html` (no dead-end, no client-side validation error blocking a curious visitor) | Should Have |
| CA-35 | The search bar must not require authentication to render on the homepage — only `care-agent.html`'s own API calls remain authenticated, per CA-24 | Must Have |
| CA-36 | The hero paragraph must describe payment flexibility as a "payment plan", not a hardcoded term length — the Care Agent offers 3/6/12-month options and the marketplace supports 3–60 months, so a fixed "three easy monthly payments" claim is inaccurate marketing copy | Must Have |

---

## Inherited Requirements

All requirements from v1.12.1 remain in effect except CA-01, restored
above. See [v1.12.1/REQUIREMENTS.md](../v1.12.1/REQUIREMENTS.md).

---

## Deprecated Features

None. No route, page, table, or documented feature was removed. The
`.hero-alt-link` CSS class introduced in v1.12.1 is deleted (nothing
references it after this revert), but the traditional-application link it
styled remains present in the hero, restored to its original `primary-btn`
presentation.
