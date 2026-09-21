# Architecture — PaySick v1.12.1

**Version**: 1.12.1
**Date**: 2026-09-21

---

## Changes from v1.12.0

Copy/CTA-only change to `index.html`'s hero section. No route, service,
table, or non-homepage page changed.

```
BEFORE (v1.12.0):                       AFTER (v1.12.1):

hero
 ├─ h1 "Healthcare payments              hero
 │   made simple"                         ├─ h1 "Healthcare payments
 ├─ p  (describes 3-month split)         │   made simple"           [unchanged]
 ├─ hero-buttons                          ├─ p  (describes Care Agent  [CHANGED
 │   ├─ a.primary-btn → login.html       │      describe-your-situation copy]
 │   │   "Get Started"                    ├─ hero-buttons
 │   └─ a.secondary-btn → #how-it-works  │   ├─ a.primary-btn → care-agent.html
 │       "Learn More"                     │   │   "Ask PaySick"          [CHANGED]
 └─ p.ai-agent-teaser                     │   └─ a.secondary-btn → #how-it-works
     "Not sure where to start?           │       "See How It Works"     [CHANGED]
      Ask PaySick — ..."                 └─ p.hero-alt-link              [RENAMED
      → care-agent.html                      "Prefer to apply directly?  from
                                              Get Started — ..."         .ai-agent-
                                              → login.html                teaser]
```

The traditional journey's entry point (`login.html`) is never removed
from the hero — only demoted from `primary-btn` to a plain text link.
Everything downstream of `login.html` (register.html, marketplace-apply.html,
offers, payments) is untouched, as in v1.12.0.

## Test topology

```
tests/unit/
   └── homepage-agent-first-cta.test.js   [NEW] — asserts hero CTA
                                            precedence via static HTML
                                            parsing (no DOM/browser
                                            dependency, no third-party
                                            packages)
```

Runner: `node --test tests/unit/*.test.js` — 736 tests, 734 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note, consistent with every release since v1.9.0). The rendered result
was additionally confirmed with a headless-Chromium screenshot
(`chrome --headless --screenshot` against the local `index.html` file,
using the pre-installed browser binary at `/opt/pw-browsers`).

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
