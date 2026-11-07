# Architecture — PaySick v1.15.1

**Version**: 1.15.1
**Date**: 2026-09-22

---

## Changes from v1.15.0

One selector renamed in `index.html`'s `<style>` block. No route,
service, table, or migration touched.

```
BEFORE:
  .hero p              { font-size: 24px; color: #4A4A4A; ... }  (line ~127)
  ...
  .agent-search-hint   { font-size: 13px; color: #999999; }      (line ~231)
                          ^^^^^^^^^^^^^^^^
                          specificity (0,1,0) -- LOSES to .hero p's
                          (0,1,1), regardless of appearing later in the
                          file. <p class="agent-search-hint"> renders at
                          24px/#4A4A4A, not the intended 13px/#999999.

AFTER:
  .hero p              { font-size: 24px; color: #4A4A4A; ... }  (line ~127)
  ...
  p.agent-search-hint  { font-size: 13px; color: #999999;        (line ~231)
                          line-height: 1.4; }
                          ^^^^^^^^^^^^^^^^^^^^
                          specificity (0,1,1) -- TIES .hero p's (0,1,1);
                          declared later in the file, so it wins the
                          source-order tiebreak as intended.
```

## Test topology

```
tests/unit/
   └── homepage-search-hint-font-size.test.js   [NEW] -- 4 assertions,
                                                  confirmed failing against
                                                  the pre-fix index.html
                                                  (git show HEAD:index.html)
                                                  before the fix, per
                                                  CLAUDE.md's Bug Fixing
                                                  Workflow. Pins both
                                                  halves of the fix so a
                                                  future edit can't
                                                  silently reintroduce the
                                                  specificity collision.
```

Runner: `node --test tests/unit/*.test.js` -- 893 tests, 891 pass, 2 fail
(both pre-existing, unrelated -- see RELEASE_NOTES.md's Environmental
note). Verified visually with a headless Chromium screenshot before and
after.

---

## Platform architecture (unchanged from v1.12.0)

See [v1.12.0/ARCHITECTURE.md](../v1.12.0/ARCHITECTURE.md) for the Care
Agent's full six-stage request path, data model, and the platform
architecture it in turn inherits.
