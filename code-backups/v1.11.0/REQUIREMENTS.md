# Requirements & Specifications — PaySick v1.11.0

**Version**: 1.11.0
**Date**: 2026-08-04

Carries forward all requirements from v1.10.1 and its predecessors, and adds the
requirements below. This release deletes a deck slide whose central claim was
false, and hardens the inbound reply webhook so that connecting it fails
diagnosably rather than silently.

---

## New Requirements

### Claims about deployment state

| ID | Requirement | Priority |
|----|-------------|----------|
| CLAIM-01 | The deck must not assert the operational state of a system (sent, blocked, live, never used) unless that state is verifiable from code or from a record the repository holds | Must Have |
| CLAIM-02 | A prerequisite documented as needed "before doing X at volume" must not be restated as a blocker on doing X at all; the two are different claims and only one of them is supported | Must Have |
| CLAIM-03 | Where a slide's figures depend on another slide, the dependency must be stated on its own terms, so removing one slide cannot leave the other citing something that no longer exists | Must Have |

### Inbound reply webhook

| ID | Requirement | Priority |
|----|-------------|----------|
| INB-01 | A webhook signature must be verified against the exact raw request bytes; a re-serialised body must never be used as a substitute | Must Have |
| INB-02 | When the raw body is unavailable, the request must be refused with a code identifying that specific fault, not with a generic signature failure | Must Have |
| INB-03 | Each authentication failure mode must return a distinct code: unset secret, missing signature headers, unavailable raw body, signature mismatch | Must Have |
| INB-04 | The failure reason must be logged server-side and returned to the caller; it must describe a configuration fault and must never disclose a secret or any part of one | Must Have |
| INB-05 | The shared-secret header fallback must be evaluated before signature verification, since it does not depend on raw-body capture and is therefore the usable path when capture is impossible | Must Have |
| INB-06 | `express.json()` must retain a `verify` hook storing the raw buffer on the request; a test must fail if it is removed | Must Have |
| INB-07 | An unset webhook secret must refuse requests in production and permit them outside it, and the two paths must be distinguishable by code | Must Have |
| INB-08 | Inbound payload parsing must handle Resend's nested `data` envelope, fall back from text to HTML, and return a null sender rather than throwing on a malformed payload | Must Have |

### Sequence integrity

| ID | Requirement | Priority |
|----|-------------|----------|
| SEQ-01 | A lead that has replied must never receive a further sequence step. The follow-up query already enforces this via the absence of an inbound touch row, so the inbound webhook is a correctness dependency of the sequence, not an optional enhancement | Must Have |
| SEQ-02 | Operator documentation must state that an unconnected inbound webhook causes follow-ups to be sent to providers who have already replied, so the consequence is visible before outreach is scaled | Must Have |

---

## Deprecated Features

### Investor deck "Outreach at Scale" slide

- Removed in: v1.11.0
- Last available in: v1.10.1 — see
  `code-backups/v1.10.1/snapshot/investor-deck.html` (section
  `id="slide-outreach-scale"`)
- Reason for removal: its central claim was false. The slide stated "It has
  never sent a message, because sending is blocked on DNS and a set of API keys",
  and carried a "Blocked today / 0 sent" scenario row. Over 40 outreach emails
  had been sent, and nothing in the code gates a send: the approve route calls
  the email service directly with no DNS or domain-verification check anywhere
  in the path. The error was one of inference from
  `OUTREACH_AGENT_README.md`'s deliverability section, which describes DNS
  records as prerequisites for sending *at volume*, not as a precondition of
  sending at all.
- Replacement: none. The slide was deleted rather than rewritten, at the
  founder's direction. The provider-acquisition argument it carried has no
  current home on the deck.
- Collateral change: the capability slide (`#slide-capability-case`) previously
  expressed its values "at the exit run-rate of the outreach plan". That
  reference now points at nothing, so it states its reference scale directly
  (273 active providers, 13,104 arrangements a year, R242M facilitated). The
  figures are unchanged.

---

## Amended Requirements

- **OUT-01 through OUT-06** (v1.10.0) are **withdrawn**. Every one of them
  constrained the content of the deleted slide (published funnel, scenario
  costing, named blockers, machine versus human cost, opportunity cost of the
  caps). With no slide to constrain, they have no subject. They are recorded here
  rather than silently dropped, so that a future outreach slide is written
  against a deliberate decision rather than an absence.

- **CAP-03** (v1.10.0), requiring capability values to be stated at a named run
  rate, remains in force and is now satisfied by the capability slide naming its
  own scale rather than borrowing one.

---

## Carried Forward

All requirements from v1.10.1 and earlier remain in force, including the pricing
and economics requirements (PRICE-01 through PRICE-08, ECON-01 through ECON-09,
CAP-01, CAP-02, CAP-04), deck integrity (DECK-01 through DECK-06), route aliases
(ROUTE-01 through ROUTE-06), and bot crawling prevention (BOT-01 through
BOT-08).
