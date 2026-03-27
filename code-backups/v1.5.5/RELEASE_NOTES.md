# Release Notes — v1.5.5

**Type**: PATCH — Regulatory terminology compliance audit & update
**Date**: 2026-03-27

## Summary

Comprehensive regulatory positioning audit across all customer-facing, provider-facing, investor-facing, and internal documents. All prohibited terminology (credit provider, loan, lender, underwriting, insurance, medical scheme, APR, credit risk) has been replaced with approved payment facilitation language to ensure PaySick is consistently positioned as a **healthcare payment facilitation platform** — not a credit provider, medical scheme, or insurer.

## Changed

### about.html
- **CRITICAL FIX**: Removed false claim "We are a registered credit provider, ensuring all lending is conducted responsibly" (National Credit Act)
- Replaced with: PaySick is a payment facilitation platform regulated under CPA and POPIA, not NCR/CMS/FSCA

### terms-of-service.html
- Removed conditional NCA credit agreement reference ("Where a payment arrangement constitutes a credit agreement as defined under the National Credit Act...")
- Replaced with explicit non-credit disclaimer: PaySick is a payment facilitation platform, not a credit provider, medical scheme, or insurer; not regulated by NCR, CMS, or FSCA

### privacy-policy.html
- Removed NCA (National Credit Act) row from the South African Legal Framework table — PaySick does not operate as a credit provider
- Changed "claims history and benefit status" (insurance/scheme terminology) to "payment history and scheme status"

### index.html
- "eliminate credit risk for your practice" → "eliminate payment collection burden for your practice"
- "Zero credit risk — We handle collections and guarantees" → "Zero collection burden — We handle patient payment management"

### providers.html
- "Zero Credit Risk" heading → "Zero Collection Burden"
- "We assume all credit risk. Focus on patient care while we handle collections and payment guarantees." → "We handle all patient payment management. Focus on patient care while we manage payment arrangements and collections."

### provider-apply.html
- "PaySick assumes the credit risk — you get paid upfront, we collect from patients." → "PaySick handles all payment collection — you get paid upfront, we manage patient payment arrangements."
- "credit risk absorption" → "payment management"

### marketplace-offers.html
- "loan offer" → "payment arrangement offer"
- "your loan will be processed" → "your arrangement will be processed"
- "You haven't submitted any loan applications. Start by applying for medical financing." → payment arrangement language

### investor-deck.html (HTML slides + PPTX generation code)
- "The Future of Healthcare Finance" → "The Future of Healthcare Payment Facilitation"
- "A multi-lender marketplace" → "A healthcare payment facilitation platform"
- "Multi-Lender Marketplace" card → "Multi-Partner Marketplace"
- "underwriting" (all instances) → "affordability verification"
- "Underwrites Risk" timeline step → "Verifies Affordability"
- "Lenders Compete" → "Partners Compete"
- "lenders" → "funding partners" (all instances)
- "loans" / "loan volume" → "arrangements" / "arrangement volume"
- "loan" (Average Loan Size, Blended Revenue per Loan) → "arrangement" equivalents
- "Net Interest Margin" → "Net Service Fee Margin"
- "Balance sheet lending" → "balance sheet payment arrangements"
- "Healthcare Lending" → "Healthcare Payment Facilitation"
- "borrowers" → "committed patients"
- "credit risk" → "collection burden" / "arrangement sustainability risk"
- "healthcare financing" → "healthcare payment facilitation" / "payment arrangements"
- "Medical debt" → "Healthcare payment commitments"
- "no generic lender can access" → "no generic platform can access"
- "NCA amendments favor digital lending" → "Digital payment facilitation is increasingly supported"
- "R45K surgery underwriting" → "Assessing a R45K surgery arrangement"
- "NCA, POPIA, HPCSA" regulatory complexity card → removed NCA reference (PaySick not NCR-regulated)
- "lender partners" in roadmap → "funding partners"
- "AI underwriting engine" → "AI affordability verification engine"
- "Initial Lending" → "Initial Arrangements"
- "Balance sheet capital for first loans" → "Balance sheet capital for first payment arrangements"
- "Join us in building the future of healthcare finance" → "...healthcare payment facilitation"
- "Personal Loan Apps" competitor category → "Personal Finance Apps"
- PPTX generation code: updated all matching strings

### marketplace-apply.html
- "Estimate 22% APR" comment → "annualised service fee rate"
- "smaller loan" → "smaller payment arrangement"
- "Max loan amount" label → "Max arrangement amount"
- Apply button text updated to use arrangement language

## Not Changed

- Backend service/route variable names (internal code; would break API functionality)
- Legal indemnification clause in ToS Section 13 ("indemnify, defend, and hold harmless" is standard legal ToS language, not insurance indemnification)
- References to competitor products using credit/loan terminology (acceptable context — describing the market problem PaySick solves)
- "Pillar 2: Insurance Coordination Risk" in investor deck (describes medical aid coordination, not PaySick providing insurance)
- CSS class names and JS API field names that map to backend endpoints (functional code; changing would break app)
