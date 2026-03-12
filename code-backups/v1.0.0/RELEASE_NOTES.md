# Release Notes — v1.0.0

**Release Date**: 2026-03-09
**Version Type**: MAJOR — Initial Official Release
**Git Tag**: v1.0.0
**Snapshot**: [`code-backups/v1.0.0/snapshot/`](./snapshot/)

---

## Summary

First officially archived release of the PaySick South African healthcare payment platform. This version captures the complete platform as built across January–February 2026, including the core patient payment flow, multi-lender marketplace, proprietary healthcare risk scoring engine, full provider network, admin and lender dashboards, investor materials, and the complete backend API.

---

## What's Included in This Release

### Patient-Facing Features
- **Landing page** (`index.html`) — Marketing site with value proposition, how-it-works, provider search CTA
- **User registration & login** (`login.html`, `onboarding.html`) — SA ID-based registration with POPIA consent
- **Patient dashboard** (`dashboard.html`) — Payment plans overview, upcoming payments, quick actions
- **Marketplace offer comparison** (`marketplace-offers.html`) — Compare loan offers from multiple lenders
- **Marketplace application** (`marketplace-apply.html`) — Full application flow integrated with lender marketplace

### Lender-Facing Features
- **Lender dashboard** (`lender-dashboard.html`) — Review patient applications, manage offers, view portfolio

### Provider-Facing Features
- **Provider directory** (`providers.html`) — Public searchable directory of healthcare partners
- **Provider application** (`provider-apply.html`) — Multi-step onboarding for new healthcare providers

### Admin Features
- **Admin dashboard** (`admin-dashboard.html`) — Full platform overview, user management, risk portfolio section
- **Admin provider management** (`admin-providers.html`) — CRUD for provider network, stats, network partner management
- **Collections management** (`collections.html`) — Overdue payment cases management

### Investor Materials
- **Investor deck** (`investor-deck.html`) — 12-slide seed-stage fundraising presentation with PD/LGD risk models

### Backend API
- 6 route modules: users, applications, payments, providers, marketplace, risk
- 4 service modules: healthcare-risk, marketplace-auction, loan-approval-bridge, security
- Banking-grade security: opaque token auth (no JWT), AES-256-GCM encryption, bcrypt password hashing
- PostgreSQL database: 14+ tables, 3 migration files
- Vercel deployment ready

### Design System
- 29-icon custom SVG library (minimalist 2px stroke, "Steve Jobs & Jony Ive meets Airbnb" aesthetic)
- PaySick brand colors: #FF4757 to #E01E37
- Fully documented in `DESIGN_SYSTEM.md`

---

## Known Limitations at This Release

- Payment gateway not yet integrated (placeholder flows only)
- SMS/Email notifications not yet live (Twilio not wired)
- External data source APIs pending (Discovery, MedCredits SA, Bonitas) — currently placeholders
- Mobile app (React Native) not yet started
- Biometric authentication not yet implemented
- All credit decisions are in review state pending production risk calibration

---

## Breaking Changes

N/A — this is the initial release.

---

## Migration Notes

N/A — this is the initial release.

---

## Contributors / Development Timeline

| Date | Milestone |
|------|-----------|
| 2026-01-xx | Core platform, PostgreSQL schema, backend API, user auth |
| 2026-01-xx | Multi-lender marketplace (database, auction service, lender dashboard) |
| 2026-02-02 | Investor deck (12 slides, seed fundraising) |
| 2026-02-03 | Marketplace API fix — dynamic baseURL for Vercel production |
| 2026-02-03 | Custom SVG icon system (29 icons) replacing emoji icons |
| 2026-02-03 | Provider network pages restored (providers, admin-providers, provider-apply) |
| 2026-02-05 | Investor deck risk management slide — PD/LGD model detail |
| 2026-02-06 | Healthcare risk scoring engine — full PD/LGD/EL model, risk API routes, admin risk portfolio |
| 2026-03-09 | Official v1.0.0 archive created |
