# Architecture — PaySick v1.20.0

**Version**: 1.20.0
**Date**: 2026-10-27

## Changes from v1.19.0
A brand and routing change only. The backend is unchanged except for
patient-visible strings.

```
index.html  "Ask Kehr" ──▶ kehr.html?q=…
login.html / onboarding.html (held question) ──▶ kehr.html
care-agent.html (stub: noindex, honeypot) ──▶ location.replace('kehr.html' + search)

kehr.html   Kehr lockup · --kehr-* tokens (PaySick CI) · .bubble.kehr
   │  PaySickAPI.careAgent.*   (internal name unchanged)
   ▼
/api/care-agent/*   OPENING_GREETING "Hi, I'm Kehr from PaySick."
care-agent-llm.service.js   SYSTEM_PROMPT "You are Kehr, PaySick's …"

Brand source: KEHR_BRAND.md (built on DESIGN_SYSTEM.md)
```

The rest is as in [v1.19.0/ARCHITECTURE.md](../v1.19.0/ARCHITECTURE.md).
