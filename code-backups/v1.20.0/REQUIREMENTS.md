# Requirements & Specifications — PaySick v1.20.0

**Version**: 1.20.0
**Date**: 2026-10-27

Carries forward all requirements from v1.19.0 and adds the following.

## New Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| KEHR-01 | The harness's patient-facing identity is "Kehr by PaySick" on every surface: the page, title, homepage entry point, privacy policy and the assistant's own words | Must Have |
| KEHR-02 | Kehr's colour tokens use the PaySick CI values exactly; Kehr Wine `#7A1426` is the only addition | Must Have |
| KEHR-03 | Kehr uses the PaySick system font stack (no web fonts) | Must Have |
| KEHR-04 | The Kehr mark and lockup follow `KEHR_BRAND.md` (PaySick halo and bars, arms turned 45°, the "by PaySick" endorsement on first mention) | Must Have |
| KEHR-05 | Kehr is never called an agent, an assistant, a bot or an AI in patient-facing copy; the privacy policy still discloses AI processing | Must Have |
| KEHR-06 | The old address `care-agent.html` keeps working by forwarding to `kehr.html` with its query | Must Have |
| KEHR-07 | "Care Agent" appears nowhere a patient can see, except one "formerly called" note in the privacy policy | Should Have |

## Inherited Requirements
All requirements from v1.19.0 remain in effect. See [v1.19.0/REQUIREMENTS.md](../v1.19.0/REQUIREMENTS.md).

## Deprecated Features
### "PaySick Care Agent" name and the `care-agent.html` page
- Removed in: v1.20.0
- Last available in: v1.19.0 — see code-backups/v1.19.0/snapshot/
- Reason for removal: owner direction. The harness gets its own identity, Kehr, aligned with the PaySick CI.
- Replacement: Kehr by PaySick at `kehr.html`. `care-agent.html` forwards there.
