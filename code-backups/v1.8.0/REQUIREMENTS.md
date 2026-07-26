# Requirements & Specifications — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-07-26

Carries forward all requirements from v1.7.5 with the following additions.

---

## New Requirements

### Daily Provider Outreach Agent

| ID | Requirement | Priority |
|----|-------------|----------|
| OUT-01 | A daily pipeline must source target practices for the active vertical × each target metro via Google Places, dedupe on `place_id`, and honour a configurable daily source cap and the `do_not_contact` suppression flag | Must Have |
| OUT-02 | Sourced leads must be enriched with website, phone, rating, and ratings_count; a public business email must be derived only from the practice's own public website. No email → route to the `linkedin`/`call` channel | Must Have |
| OUT-03 | Each enriched lead must receive a transparent 0–100 `fit_score`; the top-scored leads (within the daily draft cap) are drafted | Must Have |
| OUT-04 | Drafts must be generated via the Anthropic Messages API using the fixed compliance system prompt, returning JSON `{subject, email_body, linkedin_dm}` parsed defensively | Must Have |
| OUT-05 | Every draft must pass the terminology linter before it can be queued. A draft containing any denied term (`credit, loan, lend/lending, borrow/borrower, interest, apr, debt/debtor, default, repayment, financing`) is flagged `compliance_hold`, not `draft` | Must Have |
| OUT-06 | The agent must never send autonomously. Touches are created only in `draft`/`compliance_hold`. Approving a draft in the admin Approve Queue is the ONLY path that sets `status='sent'` | Must Have |
| OUT-07 | A `compliance_hold` touch cannot be approved until edited to clear all denied terms | Must Have |
| OUT-08 | The follow-up scheduler must generate the next sequence step (days 0/3/7/14) for `contacted` leads with no inbound reply whose `next_action_at` is due; a `replied` lead never advances | Must Have |
| OUT-09 | The daily cron route (`/api/outreach/daily`) must be guarded by `CRON_SECRET` and registered as a Vercel Cron entry; a local dry-run must run the full pipeline without sending anything | Must Have |
| OUT-10 | Each run must write one `outreach_runs` summary row (leads sourced, drafts created, follow-ups due, compliance holds, errors) | Must Have |
| OUT-11 | The Approve Queue must reuse existing admin auth (`authenticateToken` + `requireAdmin`) and brand tokens (navy `#1B2A4A`, pink `#EF476F`, Arial), and offer Approve / Edit / Reject / Mark-replied plus a funnel snapshot | Must Have |
| OUT-12 | The daily brief must compile new leads (top 5 by fit), drafts awaiting approval (with deep links), follow-ups due, replies needing a personal response, and a funnel snapshot; delivery reuses the existing SMTP email service | Must Have |
| OUT-13 | Sourcing must draw public business contact details only (POPIA); every lead records a `consent_basis` | Must Have |
| OUT-14 | The pre-onboarding pipeline must reference the existing `providers(provider_id)` entity, not duplicate it; signing sets `outreach_providers.provider_id` | Must Have |
| OUT-15 | Switching `activeVerticals` (e.g. to `["fertility"]`) must change targeting with no other code change | Must Have |

---

## Inherited Requirements

All requirements from v1.7.5 remain in effect. See
[v1.7.5/REQUIREMENTS.md](../v1.7.5/REQUIREMENTS.md) for the full set.

---

## Deprecated Features

None removed in this version — v1.8.0 is fully additive.
