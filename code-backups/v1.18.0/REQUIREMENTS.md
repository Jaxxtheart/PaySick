# Requirements & Specifications — PaySick v1.18.0

**Version**: 1.18.0
**Date**: 2026-10-27

Carries forward all requirements from v1.17.1 and adds the following.

## New Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| CAV-01 | Every Care Agent action has exactly one authority tier (autonomous, patient_consent, human_review, prohibited), set by a frozen registry and never by the model or the request | Must Have |
| CAV-02 | Only read-only actions run without the patient; every write needs an explicit consent tick and confirm | Must Have |
| CAV-03 | Any change to plan terms (date, restructure, hardship, dispute, adjustment, cancellation) goes to a person via `manual_review_queue`; the agent never reports it approved | Must Have |
| CAV-04 | Banking details are never handled in chat; free text containing them is refused, and the patient is sent to the secure form | Must Have |
| CAV-05 | Amounts in a proposal come from PaySick (plan, fee service, offer on file), never from params | Must Have |
| CAV-06 | Confirming re-checks live data and refuses if the amount changed since consent; proposals expire after 30 minutes; a proposal executes at most once | Must Have |
| CAV-07 | The agent's next-best-action decisions use the Recovery Engine's thresholds, carry a reason code and rationale, are written to the audit log, and are shown to the patient | Must Have |
| CAV-08 | The patient can see a log of everything the agent read, decided, prepared and did, tagged by who acted | Must Have |
| CAV-09 | Paying an instalment through the agent uses the same service as the Make Payment page | Must Have |
| CAV-10 | A missed payment under 30 days can be self-cured (pay or promise); from 30 days restructure needs a person; from 91 days no new promises | Must Have |
| CAV-11 | An open hardship request suppresses every payment prompt | Must Have |
| CAV-12 | Funder offers are ranked by total to repay; the agent marks the lowest and never accepts one itself | Must Have |
| CAV-13 | Income given at confirmation reaches Shield Gate 2 at submission, and a Shield decline is shown as a decision | Must Have |
| CAV-14 | Confirming an action has its own rate limit, tighter than the conversation's | Must Have |

## Inherited Requirements
All requirements from v1.17.1 remain in effect. See [v1.17.1/REQUIREMENTS.md](../v1.17.1/REQUIREMENTS.md).

## Deprecated Features
None. `POST /api/care-agent/sessions/:id/manage/payment-date-change` remains
available but the page no longer calls it.
