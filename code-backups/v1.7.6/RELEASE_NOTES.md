# Release Notes — PaySick v1.7.6

**Version**: 1.7.6
**Date**: 2026-04-20
**Type**: PATCH — investor deck copy update: Shield™ as AI-based proprietary risk IP, universal customer problem framing, two-part funding ask

---

## Summary

Updated `investor-deck.html` to align with the latest platform positioning and Shield underwriting framework as a key AI-based proprietary IP asset. The deck now opens with a universal customer problem framing before narrowing to the South African opportunity, elevates Shield™ as the headline AI risk engine across two dedicated slides, and restructures the funding ask into two clearly distinct capital tranches suited to different investor profiles.

---

## Changed

### `investor-deck.html` — HTML slides

- **Slide 2 (The Problem)**: Reframed from SA-specific "Healthcare is unaffordable" to a universal customer problem — "Healthcare costs arrive when patients are most vulnerable." Added universal context sentence before the SA statistics to broaden the narrative. Updated the three problem bullets to reflect the structural failure of existing payment products for all stakeholders.

- **Slide 8 (Risk Management → Shield™ AI Framework)**: Renamed section from "Risk Management" to "Proprietary AI Risk IP." Heading updated to "Shield™: AI-Powered Underwriting Framework." Content completely rewritten to surface the five Shield v5.0 Tariff Billing Controls (DSP Verification, Tariff-Anchored Ceiling, Provider Billing Agreement Gate, Tariff Disclosure Screen, EOB Reconciliation) and the four-gate patient assessment system. Added Shield Disbursement Architecture card describing the 80%/20% two-stage payout model and circuit breaker controls.

- **Slide 11 (Medical Risk Score → Shield™ Intelligence Engine)**: Renamed section tagline to "Shield AI Engine." Heading updated to "The Shield™ Intelligence Engine." Subtitle updated to reference tariff-level and provider-tier visibility before disbursement. Right-side card renamed from "PaySick Medical Risk Score" to "Shield™ Underwriting Engine." Closing quote updated to reference Shield's disbursement controls and AI risk models specifically.

- **Slide 14 (The Ask → Two-Part Capital Structure)**: Heading updated to "Capital Structure: Two-Part Ask." Single R25M raise restructured into two distinct tranches:
  - **Part 1 — R15M Institutional Disbursement Facility**: Senior debt / revolving facility for patient payment arrangement disbursements. ~3× capital turns per year. Non-dilutive. Suited to DFIs, impact capital, and institutional lenders.
  - **Part 2 — R10M Equity Seed Round**: Operational run-rate capital for product (40%), go-to-market (30%), regulatory & legal (20%), and operations (10%). 18-month runway.
  - Equity offered updated from 33% to 17% (reflecting only the R10M equity tranche against R50M pre-money).

### `investor-deck.html` — PPTX generation code

All four corresponding `downloadPPTX()` slide generation blocks updated to match the HTML slide content above (slides 2, 8, 11, and 14).

---

## Unchanged

All other slides (1, 3–7, 9–10, 12–13, 15), backend, and frontend application code unchanged.
