# Requirements & Specifications — PaySick v1.5.5

**Version**: 1.5.5
**Date**: 2026-03-27

Carries forward all requirements from v1.5.4 with the following additions.

---

## New Requirements — Regulatory Terminology Compliance

| ID | Requirement | Priority |
|----|-------------|----------|
| REG-01 | All customer-facing, provider-facing, investor-facing, and internal documents must position PaySick as a "healthcare payment facilitation platform" — never as a credit provider, medical scheme, or insurer | Must Have |
| REG-02 | No document may claim PaySick is "a registered credit provider" or regulated by the NCR, CMS, or FSCA | Must Have |
| REG-03 | All documents must state PaySick is regulated under Consumer Protection Act 68 of 2008 and POPIA 4 of 2013 | Must Have |
| REG-04 | Credit-related terms (loan, borrower, debtor, lender, APR, credit risk, underwriting, credit approval) are prohibited in customer-facing and investor-facing documents; replace with approved payment facilitation equivalents | Must Have |
| REG-05 | Medical scheme terms (scheme membership, contributions, benefits, coverage, claimed benefits) are prohibited; replace with payment arrangement language | Must Have |
| REG-06 | Insurance terms (insurance policy, insurance provider, indemnify in insurance context, risk transfer, premium, claims in insurance context) are prohibited | Must Have |
| REG-07 | "Lender" must be replaced with "funding partner" in all public-facing and investor-facing materials | Must Have |
| REG-08 | "Underwriting" must be replaced with "affordability verification" in all public-facing and investor-facing materials | Must Have |
| REG-09 | "Loan volume" milestones must be described as "arrangement volume" in public materials | Must Have |
| REG-10 | Investor materials must describe the revenue model as "service fees from payment arrangement facilitation", not "interest income from loans" or "Net Interest Margin from balance sheet lending" | Must Have |
| REG-11 | Any new page, API route, or document added must be reviewed for prohibited terminology before merging | Must Have |

---

## Approved Terminology Reference

| Prohibited Term | Approved Replacement |
|-----------------|---------------------|
| credit provider | payment facilitation platform |
| credit facility / loan | payment arrangement / payment plan |
| credit agreement | payment arrangement agreement / service agreement |
| borrower / debtor | patient / customer / user |
| lender | payment facilitator / funding partner |
| interest rate / APR | service fee / arrangement fee |
| underwriting | affordability verification |
| credit approval | arrangement confirmation |
| credit risk | arrangement sustainability risk |
| medical scheme | healthcare payment facilitation platform |
| contributions | monthly instalments / monthly payments |
| benefits (scheme) | payment arrangement availability |
| coverage | payment arrangement eligibility |
| insurance policy | payment arrangement agreement |
| claims (insurance) | arrangement activations |
| premium (insurance) | service fee / arrangement fee |

---

## Carried Forward from v1.5.4

See `code-backups/v1.5.4/REQUIREMENTS.md` for the full requirements list.
