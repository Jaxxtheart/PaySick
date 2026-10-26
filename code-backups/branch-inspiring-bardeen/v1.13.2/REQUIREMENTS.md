# Requirements & Specifications — PaySick v1.13.2

**Version**: 1.13.2
**Date**: 2026-09-21

Carries forward all requirements from v1.13.1 and its predecessors.

---

## New Requirements

### Legal entity naming

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-42 | Every legal/disclosure document referencing the registered company must name it as "Tech and Artery (Pty) Ltd", not "PaySick (Pty) Ltd" or "PaySick South Africa (Pty) Ltd" | Must Have |
| CA-43 | The PaySick brand/product name, used standalone (not suffixed "(Pty) Ltd"), must remain unaffected by the entity rename — a document may correctly read "Tech and Artery (Pty) Ltd, trading as PaySick" | Must Have |
| CA-44 | The server-generated disclosure text in `underwriting.service.js` and the transactional-email footer in `email.service.js` must match the entity name used in the corresponding static legal pages, so the two sources of truth don't drift apart | Should Have |

---

## Inherited Requirements

All requirements from v1.13.1 remain in effect. See
[v1.13.1/REQUIREMENTS.md](../v1.13.1/REQUIREMENTS.md).

---

## Deprecated Features

None. This is a naming/copy change only.
