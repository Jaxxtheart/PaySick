# Architecture: PaySick v1.22.1

**Version**: 1.22.1
**Date**: 2026-11-07

## Changes from v1.22.0

Front-end styling only. No API, data or service changes.

```
index.html
  <section class="hero theme-blush" id="top">
     background: linear-gradient(#ffffff → #FFF1F3)    (was: plus pattern + gradient + 2 glows)
     └─ svg.pulse-line (heartbeat, unchanged)
  <section class="theme-light" id="features">
     └─ .divider-blush (#FFF1F3) continues the hero wash
```

The rest is as in [v1.22.0/ARCHITECTURE.md](../v1.22.0/ARCHITECTURE.md).
