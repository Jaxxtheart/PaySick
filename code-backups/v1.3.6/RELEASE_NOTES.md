# Release Notes — PaySick v1.3.6

**Version**: 1.3.6
**Date**: 2026-03-13
**Type**: MINOR — Shield underwriting activation

---

## Summary

Activated the PaySick Shield underwriting framework on the live patient application flow. The Shield Patient Gate (Gate 2) was fully built but not connected to the marketplace application route. This release wires it in and adds the three form fields the underwriting engine needs to conduct a complete affordability assessment.

---

## Added

- **`marketplace-apply.html` — Step 3 new fields**:
  - **Existing monthly debt repayments** (`monthlyObligations`): Total R amount the applicant currently pays per month on any loans, credit cards, or store accounts. Used for Debt-to-Income (DTI) calculation. Defaults to 0 if blank.
  - **Medical aid cover amount** (`medicalAidCovered`): How much the applicant's medical aid covers toward the procedure, in rands. Used for borrower-profile classification (gap financing vs. full procedure) and gap-amount validation. Defaults to 0 if blank.
  - **Procedure urgency** (`urgencyClassification`): Required select — Elective / Planned / Semi-urgent / Urgent. Used for borrower-profile convenience vs. necessity scoring and the 48-hour cooling-off rule on elective procedures above R15,000.

- **`marketplace-apply.html` — Shield decline UI** (`showShieldDecline()`): When the backend returns `shield_declined: true`, the form transitions to a decline card instead of the success state. The card shows:
  - The decline rationale from the Shield engine (human-readable sentences)
  - An alternative loan suggestion (lower amount that fits within the 18% RTI ceiling) with a one-click "Apply for X instead" button
  - Buttons to adjust amount/term or go back to dashboard

- **`marketplace-apply.html` — Demo Shield simulation**: `buildDemoResponse()` now includes a `shield_assessment` object with computed RTI, DTI, disposable income, borrower profile, and risk tier derived from the demo user's inputs.

- **`backend/src/routes/marketplace.js` — Shield Gate 2 integration**: After existing field validation, every application that includes `monthlyIncome` is now run through `patientGateService.assessApplication()` before reaching the lender-matching logic. If the Shield engine returns `DECLINE`, the route returns `{ success: false, shield_declined: true, shield: <assessment> }` immediately. Amber and green outcomes proceed to marketplace matching as before. Shield assessment failures are non-fatal (logged, flow continues).

---

## Files Changed

| File | Change |
|------|--------|
| `marketplace-apply.html` | Added 3 Shield fields (urgency, obligations, medical aid) to Step 3; added `showShieldDecline()` and `applyWithAlternative()`; updated `buildDemoResponse()` with Shield simulation |
| `backend/src/routes/marketplace.js` | Imported `patientGateService`; added Shield Gate 2 call in POST `/applications` with early-return on DECLINE |
