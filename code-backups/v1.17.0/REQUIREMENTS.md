# Requirements & Specifications — PaySick v1.17.0

**Version**: 1.17.0
**Date**: 2026-10-26

Carries forward all requirements from v1.13.0 and adds the following.

## New Requirements

### Versioning
| ID | Requirement | Priority |
|----|-------------|----------|
| VER-01 | A new version number must be higher than any `code-backups/vX.Y.Z` on any remote branch | Must Have |
| VER-02 | When merging a branch with colliding archive numbers, the target's archives stay as they are; the incoming diverged archives move, unchanged, to `code-backups/branch-<name>/` | Must Have |

### Legal entity
| ID | Requirement | Priority |
|----|-------------|----------|
| ENT-01 | The registered entity is written "Tech & Artery (Pty) Ltd" everywhere; "Tech and Artery" must not appear in live files | Must Have |
| ENT-02 | The privacy policy and tariff-gap disclosure carry registration number K2015/346764/07 | Must Have |

### Privacy (Care Agent)
| ID | Requirement | Priority |
|----|-------------|----------|
| PRIV-CA-01 | `privacy-policy.html` has a Care Agent section stating what is collected, that uploaded files are not stored, the Anthropic processing, the 24-hour browser hold, and that use is optional | Must Have |
| PRIV-CA-02 | Anthropic is listed as an operator and covered under cross-border transfers; the retention table has a Care Agent row | Must Have |
| PRIV-CA-03 | `care-agent.html` shows a notice at the message box linking to the policy's Care Agent section | Must Have |

### Held question
| ID | Requirement | Priority |
|----|-------------|----------|
| CA-HELD-01 | A question typed while signed out is held for up to 24 hours on the device and cleared once used or expired | Must Have |
| CA-HELD-02 | After login, or after onboarding, a patient with a held question returns to `care-agent.html`; with none, the existing redirects apply | Must Have |
| CA-HELD-03 | A held question is placed in the message box for review and is never sent automatically | Must Have |
| CA-HELD-04 | No URL-based redirect parameter is introduced | Must Have |

## Inherited Requirements
All requirements from v1.13.0 remain in effect. See [v1.13.0/REQUIREMENTS.md](../v1.13.0/REQUIREMENTS.md).

## Deprecated Features
None. The branch's v1.12.1 "agent-first hero CTA" was never on `main`, so it
needs no deprecation entry. Its archive is under
`code-backups/branch-inspiring-bardeen/v1.12.1/`.
