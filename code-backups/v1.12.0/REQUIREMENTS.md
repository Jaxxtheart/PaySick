# Requirements & Specifications — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-08-04

Carries forward all requirements from v1.11.0 and its predecessors. This release
removes the four remaining business-case slides added in v1.10.0, completing the
revert of that addition.

---

## New Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| DECK-07 | Style rules added to serve a specific slide must be removed when that slide is removed; the deck must carry no CSS rule with no consumer | Must Have |
| DECK-08 | A guard against a superseded claim must outlive the slide that carried it. When a test file is deleted, any content ban it held must be migrated rather than dropped | Must Have |
| DECK-09 | Slide removal must be verified by asserting the surviving slides are present by id, not only by asserting a count. A count alone cannot distinguish the intended removal from a collateral one of the same size | Must Have |
| DECK-10 | The deck must not carry a pricing or business-model claim unless it is derived from `backend/src/services/fee.service.js`. Absence is preferable to a claim the code contradicts | Must Have |

---

## Deprecated Features

### Investor deck business-case slides (pricing, unit economics, provider economics, capability value)

- Removed in: v1.12.0
- Last available in: v1.11.0 — see
  `code-backups/v1.11.0/snapshot/investor-deck.html`, sections
  `id="slide-pricing"`, `id="slide-unit-economics"`,
  `id="slide-provider-economics"`, `id="slide-capability-case"`
- Reason for removal: removed at the founder's direction. No defect was found in
  their figures: each was derived from `fee.service.js` or from the shipped
  service modules, and the full derivation is preserved in the v1.10.0 release
  notes and in `code-backups/v1.11.0/snapshot/`.
- Replacement: none.
- Consequence: the deck now carries **no pricing or business-model slide**. The
  original "Business Model" slide was itself removed in v1.10.0 for contradicting
  `fee.service.js`, and is deliberately not restored, since doing so would
  reintroduce a known-false claim. See DECK-10.

### Ledger presentation styles

- Removed in: v1.12.0
- Last available in: v1.11.0 — see
  `code-backups/v1.11.0/snapshot/investor-deck.html`
- Reason for removal: `.ledger`, `.ledger-wrap`, `.assumption`, `.flag-good`,
  `.flag-bad` and `.pill` existed solely to style the removed slides. With no
  consumer they were dead rules. See DECK-07.
- Replacement: none. Any future figure table on the deck should reuse the
  existing `.competitors-table` styling or reintroduce a purpose-built rule.

---

## Withdrawn Requirements

The following are withdrawn because the slides they constrained no longer exist.
They are recorded rather than silently dropped, so that a future pricing or
economics slide is written against a deliberate decision rather than an absence.

- **PRICE-01 through PRICE-08** (v1.10.0). Pricing-slide content and the
  requirement that published rates match `fee.service.js`.

  **PRICE-08 is partially retained in effect**: its ban on the superseded claims
  (`R1,850 (10%)`, `2-4% arrangement fee`, the `N% of Revenue` splits,
  `Target CAC: R320`) is migrated into `tests/unit/investor-deck.test.js` and
  still enforced deck-wide. The principle behind PRICE-01 is preserved as
  DECK-10.

- **ECON-01 through ECON-09** (v1.10.0). Per-arrangement and per-provider
  economics content.

- **CAP-01 through CAP-04** (v1.10.0). Capability business-case content.
  CAP-01's principle, that a capability presented as an asset must exist in the
  repository, remains a live constraint on the Shield slide via SHIELD-06
  (v1.9.0), which is unaffected.

**OUT-01 through OUT-06** were already withdrawn in v1.11.0.

---

## Carried Forward

All requirements from v1.11.0 and earlier remain in force, including deck
integrity (DECK-01 through DECK-06), claims about deployment state (CLAIM-01
through CLAIM-03), the inbound reply webhook set (INB-01 through INB-08),
sequence integrity (SEQ-01, SEQ-02), route aliases (ROUTE-01 through ROUTE-06),
the Shield gate requirements (SHIELD-01 through SHIELD-06), and bot crawling
prevention (BOT-01 through BOT-08).
