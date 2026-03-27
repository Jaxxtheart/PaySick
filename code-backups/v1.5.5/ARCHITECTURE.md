# Architecture — PaySick v1.5.5

**Version**: 1.5.5
**Date**: 2026-03-27

No structural/code architecture changes in this release. All changes are documentation, copy, and terminology compliance updates.

---

## Unchanged from v1.5.4

Refer to `code-backups/v1.5.4/ARCHITECTURE.md` for the current architecture diagram, including:
- Auth middleware exports
- API route structure
- Database schema
- Vercel deployment configuration
- Backend service layer

---

## Regulatory Positioning Architecture

While no code architecture changed, this release formally establishes the **approved terminology map** used across all documents:

```
PaySick Platform Layer
├── Customer-Facing
│   ├── Positioning: "healthcare payment facilitation platform"
│   ├── NOT: credit provider / lender / insurer / medical scheme
│   └── Regulated by: Consumer Protection Act + POPIA
│
├── Provider-Facing
│   ├── PaySick role: "payment arrangement service"
│   ├── Provider receives: upfront procedure payment
│   └── PaySick manages: patient payment arrangements / collections
│
└── Investor-Facing
    ├── Business model: "service fees for payment arrangement facilitation"
    ├── Revenue: "arrangement fees" + "service fee margin" + "provider fees"
    ├── Risk model: "affordability verification" (NOT underwriting)
    └── Funding partners: "multi-partner marketplace" (NOT multi-lender)
```
