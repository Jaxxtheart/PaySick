# Requirements & Specifications — PaySick v1.12.1

**Version**: 1.12.1
**Date**: 2026-10-26

Carries forward the v1.12.0 requirements, with the changes below.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| LNK-01 | The homepage repositioning changes wording only. Every link the homepage had in v1.11.0 must still be present and must resolve | Must Have |
| LNK-02 | The main nav keeps How it works, Features, the provider directory, About, and sign-in (`login.html`) | Must Have |
| LNK-03 | The provider section links to `provider-apply.html` and `providers.html`; the final CTA links to `login.html` and `provider-apply.html` | Must Have |
| LNK-04 | The homepage must not contain forms that look like they work but do not submit | Must Have |

## Changed Requirements

- POS-02 (v1.12.0) no longer bans "Get Started" or links into the login /
  provider-apply flows. The owner directed that these keep working. The
  other banned phrases and the disclosure requirements (POS-01, POS-03 to
  POS-09) stay in force.

---

## Inherited Requirements

All other requirements from v1.12.0 remain in effect. See
[v1.12.0/REQUIREMENTS.md](../v1.12.0/REQUIREMENTS.md).

---

## Deprecated Features

### Homepage preview interest forms (INT-01 to INT-05)
- Removed in: v1.12.1
- Last available in: v1.12.0 — see code-backups/v1.12.0/snapshot/ (`index.html`, `js/interest-forms.js`)
- Reason for removal: they had no backend and sent nothing, and the owner
  directed that the homepage's existing, working flows be kept instead.
- Replacement: the existing working pages, `login.html` (Get Started) and
  `provider-apply.html` (provider registration).
