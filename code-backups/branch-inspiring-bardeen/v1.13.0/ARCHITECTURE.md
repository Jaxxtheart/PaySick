# Architecture — PaySick v1.13.0

**Version**: 1.13.0
**Date**: 2026-09-21

---

## Changes from v1.12.1

```
BEFORE (v1.12.1):                        AFTER (v1.13.0):

hero                                      hero
 ├─ h1 "Healthcare payments                ├─ h1 "Healthcare payments
 │   made simple"          [unchanged]     │   made simple"                [unchanged]
 ├─ p  (Care Agent copy)                   ├─ p  (ORIGINAL 3-month-split
 ├─ hero-buttons                           │      copy — RESTORED)
 │   ├─ a.primary-btn → care-agent.html    ├─ form.agent-search             [NEW]
 │   │   "Ask PaySick"                     │   ├─ input#agent-search-input
 │   └─ a.secondary-btn → #how-it-works    │   └─ button.agent-search-submit
 │       "See How It Works"                ├─ p.agent-search-hint           [NEW]
 └─ p.hero-alt-link                        └─ hero-buttons                  [RESTORED]
     "Prefer to apply directly?                ├─ a.primary-btn → login.html
      Get Started — ..."                       │   "Get Started"
      → login.html                             └─ a.secondary-btn → #how-it-works
                                                    "Learn More"
```

## Search-bar → Care Agent data flow

```
index.html                              care-agent.html
────────────                            ─────────────────
visitor types a query into
#agent-search-input, submits
(Enter or the circular button)
        │
        ▼
agentSearchForm 'submit' handler
  e.preventDefault()
  navigate to
  care-agent.html?q=<encoded query>  ──▶  init()
                                            │
                                            ├─ isAuthenticated()? no ──▶ locked-card
                                            │                            shown, q is
                                            │                            NOT persisted
                                            │                            (no login-
                                            │                            boundary magic)
                                            │
                                            └─ yes:
                                               PaySickAPI.careAgent.startSession()
                                                 │
                                                 ▼
                                               new URLSearchParams(location.search)
                                                 .get('q')
                                                 │
                                                 ▼ (if present)
                                               sendMessage(q)
                                                 │
                                                 ▼
                                               POST /api/care-agent/sessions/:id/messages
                                               [EXISTING endpoint — v1.12.0, unchanged]
```

No new backend route, service, or table. The search bar is purely a
homepage UI addition that hands off to `care-agent.html`'s existing
message-sending code path.

## Test topology

```
tests/unit/
   └── homepage-agent-first-cta.test.js   [REWRITTEN] — now asserts the
                                            original hero CTA is restored
                                            AND the Google-style search
                                            bar is present and wired to
                                            care-agent.html?q=
```

Runner: `node --test tests/unit/*.test.js` — 738 tests, 736 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). Both inline `<script>` blocks touched by this release
(`index.html`'s search-bar submit handler, `care-agent.html`'s
query-param auto-send) were extracted with a small Python regex script
and syntax-checked via `node --check`, since neither file is itself
valid standalone JS. The rendered hero was confirmed with a
headless-Chromium screenshot of the local file.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
