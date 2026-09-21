# Architecture — PaySick v1.13.2

**Version**: 1.13.2
**Date**: 2026-09-21

---

## Changes from v1.13.1

Text-only rename, one string pattern, seven files. No route, service,
table, schema, or functional behavior changed.

```
OLD: "PaySick (Pty) Ltd"                }
     "PaySick South Africa (Pty) Ltd"   }  -> "Tech and Artery (Pty) Ltd"

terms-of-service.html            (4 occurrences)
privacy-policy.html              (2)
licenses.html                    (4)
provider-billing-agreement.html  (1)
tariff-disclosure.html           (2)
backend/src/services/underwriting.service.js  (2 — the disclosure text
                                                 tariff-disclosure.html
                                                 itself renders from)
backend/src/services/email.service.js         (1 — transactional email
                                                 footer)
```

The brand name "PaySick" (unsuffixed) is untouched everywhere — the
regex used (`PaySick(\s+South Africa)?\s*\(Pty\)\s*Ltd`) only matches the
registered-company form, never a bare "PaySick" mention. This produces
the standard "Entity Name (Pty) Ltd, trading as Brand" pattern already
implicit in the source documents' own phrasing (e.g. `terms-of-service.html`:
`Tech and Artery (Pty) Ltd ("PaySick", "we", "us", "our")`).

## Test topology

```
tests/unit/
   └── legal-entity-rename.test.js   [NEW] — per-file assertions that
                                       (a) the old entity string is gone,
                                       (b) the new one is present, and
                                       (c) the bare "PaySick" brand name
                                       and paysick.co.za addresses are
                                       untouched
```

Runner: `node --test tests/unit/*.test.js` — 803 tests, 801 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). Both edited backend files were syntax-checked with `node --check`.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
