# Architecture — PaySick v1.17.1

**Version**: 1.17.1
**Date**: 2026-10-26

## Changes from v1.17.0
These are CSS and decorative markup changes in `index.html` only. Routes, links,
copy and scripts are unchanged, apart from a small scroll-reveal observer.

```
index.html  (theme class on each <section>)
  #top          theme-blush  ── pulse-line svg (heartbeat, animated)
  #features     theme-light  ── divider(blush) · eyebrow · cards[data-num, data-reveal]
  #how-it-works theme-dark   ── divider(light) · eyebrow · steps track · steps[data-reveal]
  #providers    theme-rose   ── divider(dark)  · eyebrow · provider-flow card
  #technology   theme-ink    ── divider(rose)  · tech-network svg · eyebrow · tech-chips
  #about        theme-cream  ── divider(dark)  · about-watermark svg · eyebrow · pull-quote tagline
  #start        theme-brand  ── divider(cream) · eyebrow · white buttons
  footer        (unchanged, dark)

Reveal: inline script ─▶ if IntersectionObserver && !reduced-motion
          html.js-reveal ─▶ [data-reveal] fade-up ─▶ .is-visible
```

The rest is as in [v1.17.0/ARCHITECTURE.md](../v1.17.0/ARCHITECTURE.md).
