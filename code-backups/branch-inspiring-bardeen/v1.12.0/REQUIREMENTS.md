# Requirements & Specifications — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-09-21

Carries forward all requirements from v1.11.0 and its predecessors, and
adds the requirements below for the new PaySick Care Agent surface.

---

## New Requirements

### Product surface

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-01 | The Care Agent must be reachable as an alternative entry point from the homepage, without removing or materially changing the existing primary CTA or traditional application journey | Must Have |
| CA-02 | The first screen must be a conversational entry point (free text, suggested prompts, file attach), never a long upfront form | Must Have |
| CA-03 | The conversation must progressively gather only the information needed for the next step, not recreate the full application form as a chatbot | Must Have |

### Honesty / uncertainty (product principle: "never hide uncertainty")

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-04 | Every extracted field must carry an explicit confidence indicator; the engine must never present a guess as a confirmed fact | Must Have |
| CA-05 | A financial figure (scheme contribution, shortfall) must never be estimated or fabricated — only computed from figures the patient explicitly stated or confirmed | Must Have |
| CA-06 | Extraction is a deterministic, in-repo regex/keyword engine, not a call to an external LLM. No behavior may be described as, or depend on, third-party AI/LLM capability that is not actually implemented | Must Have |
| CA-07 | An attached document's contents must not be silently parsed or fabricated — the current implementation has no OCR/extraction library, and the UI must say so and ask the patient to describe it instead | Must Have |

### Understand stage

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-08 | The system must generate an editable summary of the care request (provider, treatment, quoted amount, estimated scheme contribution, estimated shortfall) | Must Have |
| CA-09 | The patient must be able to Confirm or Edit the summary before it is used in any downstream calculation | Must Have |
| CA-10 | The system must never continue into option construction using unconfirmed extracted data | Must Have |

### Construct stage

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-11 | Constructed payment-term options must reuse the platform's existing zero-interest policy (fee.service.js), not invent a new interest/rate model | Must Have |
| CA-12 | Instalments must be rounded so a plan never under-collects the shortfall (consistent with restructure-offer.service.js's existing rounding rule) | Must Have |
| CA-13 | When affordability data is known, options must be captioned using the existing shared affordability comfort-zone threshold (utils/affordability-policy.js), not a new or duplicated threshold | Must Have |
| CA-14 | The authoritative approve/decline/refer-to-human recommendation must come from patientGateService (Shield Gate 2) — the Care Agent must never compute or state its own approval decision | Must Have |
| CA-15 | Option language must present options as fitting the patient's stated situation, not as a guaranteed "best" choice | Should Have |

### Approve stage

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-16 | Any material action (submitting a request, sharing data) requires explicit patient approval — no auto-submission | Must Have |
| CA-17 | The approval screen must state what data will be shared, with whom, and for what purpose, before consent is collected | Must Have |
| CA-18 | Approval without explicit data-sharing consent must be rejected by the API (400), not merely discouraged in the UI | Must Have |

### Execute stage

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-19 | Execution must go through the existing, unmodified `POST /api/marketplace/applications` endpoint — the Care Agent must not duplicate or bypass existing affordability, payment, or compliance controls | Must Have |
| CA-20 | The Care Agent must record which application id a conversation resulted in, for audit purposes, without owning execution itself | Must Have |

### Manage stage

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-21 | The conversation must remain available after an arrangement is created, and must be able to answer "when is my next payment?" from the same data source the existing loans/repayments endpoints use | Must Have |
| CA-22 | An action the Care Agent cannot perform itself (e.g. a payment-date change) must be logged for human follow-up and described as such, never silently actioned or silently dropped | Must Have |

### Audit trail

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-23 | Every extraction, question, confirmation, approval, and execution must be written to a durable audit log tied to the conversation | Must Have |

### API & bot-crawling compliance (existing platform-wide requirements, reaffirmed for this surface)

| ID | Requirement | Priority |
|----|-------------|----------|
| CA-24 | Every `/api/care-agent/*` endpoint must require authentication | Must Have |
| CA-25 | `/api/care-agent/*` must enforce its own per-IP rate limit | Must Have |
| CA-26 | care-agent.html must carry the same honeypot-link, JS-required-rendering, and `X-Robots-Tag` protections as every other entry-point page | Must Have |

---

## Inherited Requirements

All requirements from v1.11.0 remain in effect. See
[v1.11.0/REQUIREMENTS.md](../v1.11.0/REQUIREMENTS.md).

---

## Deprecated Features

None. This release is additive only. No route, page, table, or documented
feature was removed.
