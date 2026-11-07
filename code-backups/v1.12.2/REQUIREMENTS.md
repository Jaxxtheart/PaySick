# Requirements & Specifications — PaySick v1.12.2

**Version**: 1.12.2
**Date**: 2026-10-26

Carries forward the v1.12.1 requirements, with the changes below.

## Changed Requirements
- **POS-05 (v1.12.0)**: the availability disclosure is no longer required
  next to the hero (owner direction). It is still required in the footer,
  and the not-a-credit-application notice is still required near the final
  CTA.
- **POS-03 (v1.12.0)**: "24-hour settlement" and "zero collection burden"
  are no longer banned on the homepage, because the owner restored the
  v1.11.0 provider copy. The claims are pending substantiation and counsel
  approval (see `PRELAUNCH_COMPLIANCE_CHECKLIST.md`).

## New Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| PRV-01 | The homepage provider section uses the v1.11.0 wording, with Join Our Network → `provider-apply.html` and Browse Provider Directory → `providers.html` | Must Have |

## Inherited Requirements
All other requirements from v1.12.1 remain in effect. See
[v1.12.1/REQUIREMENTS.md](../v1.12.1/REQUIREMENTS.md).

## Deprecated Features
### Homepage hero availability disclaimer and provider "Proposed capabilities" panel
- Removed in: v1.12.2
- Last available in: v1.12.1 — see code-backups/v1.12.1/snapshot/index.html
- Reason for removal: owner direction
- Replacement: the original v1.11.0 provider section. The availability
  disclosure stays in the footer only.
