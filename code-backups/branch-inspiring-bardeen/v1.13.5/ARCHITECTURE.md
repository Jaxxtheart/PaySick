# Architecture — PaySick v1.13.5

**Version**: 1.13.5
**Date**: 2026-09-21

---

## Changes from v1.13.4

Frontend-only bug fix, one file. No route, service, table, or migration
changed.

```
BEFORE:
  init()
    try { startSession() ... }
    catch { addBubble('system', generic dead-end text); return; }
                                       │
                                       ▼
                          (no retry, no diagnosis)

  sendMessage(text)
    if (!message || !state.sessionId) return;   <- SILENT NO-OP if the
                                                     session never started

AFTER:
  startConversation()                              [NEW, reusable]
    try { startSession() ... ; return true }
    catch {
      expired-session error?  -> "log in again" message + link
      other error?             -> "couldn't reach PaySick" + Try-again
                                   button that re-calls startConversation()
      return false
    }

  init()
    const started = await startConversation();
    if (!started) return;

  sendMessage(text)
    if (!message) return;
    addBubble('user', message);                    <- ALWAYS shown
    if (!state.sessionId) {
      const recovered = await startConversation();
      if (!recovered) { addBubble('system', ...); return; }
    }
    ...proceeds to actually send `message` normally...
```

`startConversation()` is the single seam both call sites share, so a
patient who types something before the initial session finished (or
after it failed) gets the same recovery path `init()` itself uses,
instead of a second, different failure mode.

## Test topology

```
tests/unit/
   └── care-agent-init-recovery.test.js   [NEW] — static-content contract:
                                            startConversation() exists and
                                            is reused by both init() and
                                            sendMessage(); expired-session
                                            vs generic failure are
                                            distinguished; a retry action
                                            exists; the old silent
                                            `!state.sessionId` early-return
                                            is gone; the patient's message
                                            bubble always renders
```

Runner: `node --test tests/unit/*.test.js` — 840 tests, 838 pass, 2 fail
(both pre-existing, unrelated — see RELEASE_NOTES.md's Environmental
note). `care-agent.html`'s inline script was extracted and syntax-checked
with `node --check`; the page was rendered with headless Chromium to
confirm no visual regression.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
