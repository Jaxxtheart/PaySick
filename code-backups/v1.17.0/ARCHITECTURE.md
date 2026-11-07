# Architecture — PaySick v1.17.0

**Version**: 1.17.0
**Date**: 2026-10-26

## Changes from v1.13.0

### Held Care Agent question
```
index.html search bar ──▶ care-agent.html?q=…
                              │ signed out
                              ├─ PaySickCareAgentPending.save(localStorage, q)   (24h, max 500 chars)
                              └─ "Your question is saved" ─▶ login.html / register.html
                                                                │
login.html redirectByRole(patient)                              │
  onboarding done + peek() ─▶ care-agent.html ◀─────────────────┘
  onboarding not done ─────▶ onboarding.html ── goToDashboard(): peek() ? care-agent.html : dashboard.html
  nothing held ────────────▶ dashboard.html (unchanged)

care-agent.html (signed in)
  ?q= present ─▶ sendMessage(q), strip ?q= from URL
  else take() ─▶ question placed in #message-input, user presses Send (never auto-sent)
```
`js/care-agent-pending.js` is a UMD module (browser global
`PaySickCareAgentPending`, or Node `require`). Every storage access is
guarded, so blocked storage never breaks login.

### Archive layout after the branch merge
```
code-backups/
  v1.0.0 … v1.11.0          shared history (identical on both lines)
  v1.12.0 v1.12.1 v1.12.2   this line
  v1.13.0                   this line (Care Agent port)
  v1.17.0                   this release
  branch-inspiring-bardeen/
    CHANGELOG.md            that branch's changelog, unchanged
    v1.12.0 … v1.16.0       that branch's archives, unchanged
```

The rest of the platform is as in [v1.13.0/ARCHITECTURE.md](../v1.13.0/ARCHITECTURE.md).
