# Release Notes — PaySick v1.3.5

**Version**: 1.3.5
**Date**: 2026-03-13
**Type**: PATCH — Bug fix / Demo hardening

---

## Summary

Made the demo site fully self-contained and independent of the backend API. Previously the demo login posted to `/api/users/demo-login`, which failed with a 404/HTML response on the hosted environment. Dashboard data and marketplace application submission also relied on live API calls. All three paths are now hardcoded to serve mock data without any network requests.

---

## Fixed

- **Demo login** (`demo-login.html`): Replaced the async `fetch('/api/users/demo-login', ...)` call with a synchronous local lookup from a hardcoded `DEMO_USERS` object. The function now writes directly to `localStorage` and redirects — no API call is made. The password gate and role-selection UI are preserved unchanged.
- **Demo dashboard** (`dashboard.html`): Added `isDemoMode()` helper that checks if the auth token starts with `'demo-'`. When in demo mode, `initDashboard()` now returns early and calls `loadDemoData()` instead of hitting the API. `loadDemoData()` populates all stat cards and renders a hardcoded active plan (Netcare Dental Centre, R18,500, 3-month term) and a hardcoded upcoming payment (R6,167 due 15 April 2026).
- **Demo marketplace application** (`marketplace-apply.html`): Added `isDemoMode()` helper and `buildDemoResponse()` function. When in demo mode, `submitApplication()` resolves synchronously with a preview response containing 3 calculated lender offers (MediFinance SA 16.5%, HealthCredit Plus 18.5%, CareCapital 19.5%) instead of calling the API. Monthly payments are computed from the user-selected loan amount and term using standard amortisation.

---

## Files Changed

| File | Change |
|------|--------|
| `demo-login.html` | Replaced API call with hardcoded `DEMO_USERS` lookup; synchronous localStorage write |
| `dashboard.html` | Added `isDemoMode()` + `loadDemoData()` with fully mocked stats and plan data |
| `marketplace-apply.html` | Added `isDemoMode()` + `buildDemoResponse()` with computed preview offers |
