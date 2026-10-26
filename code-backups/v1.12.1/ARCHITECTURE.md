# Architecture — PaySick v1.12.1

**Version**: 1.12.1
**Date**: 2026-10-26

---

## Changes from v1.12.0

This release changes `index.html` only. It also deletes `js/interest-forms.js`.
There are no route, table, or service changes.

```
                           index.html (v1.12.0 wording + disclosures)
 nav ── How it works (#how-it-works) · Features (#features)
     ── For providers ─────────────────────────────▶ providers.html
     ── About (#about) · Get Started ──────────────▶ login.html
 #top        Get Started ──────────────────────────▶ login.html
             Explore how it works (#how-it-works) · Partner with PaySick (#providers)
             availability notice ──────────────────▶ terms-of-service.html#credit-status
 #features   value pillars
 #how-it-works 4 steps
 #providers  Register your practice's interest ────▶ provider-apply.html
             Browse Provider Directory ────────────▶ providers.html
 #technology · #about
 #start      Get Started ──────────────────────────▶ login.html
             Become a provider partner ────────────▶ provider-apply.html
 footer      Product | Company (research, contact) | Legal (privacy, terms,
             licenses, accessibility)

 REMOVED: patient/provider preview forms + js/interest-forms.js
```

The downstream pages and backend are unchanged from v1.11.0. For the full
platform architecture, see [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md)
and its references.
