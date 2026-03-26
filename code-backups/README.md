# PaySick Code Backups

This folder is the **official versioned archive** of the PaySick platform. It provides a complete snapshot of the platform at every significant release milestone, including full source code, requirements & specifications, architecture diagrams, and release notes.

---

## Purpose

- **Version Control**: Every major release is captured here as an immutable snapshot.
- **Archival Record**: Dropped features remain documented with their full specs and code, never lost.
- **Audit Trail**: Stakeholders, investors, and regulators can inspect any historical version of the platform.
- **Onboarding**: New engineers can understand what the platform looked like at any point in time.

---

## Folder Structure

```
code-backups/
├── README.md                        <- This file
├── VERSIONING_GUIDE.md              <- How to cut a new backup version
├── CHANGELOG.md                     <- Master changelog across all versions
│
├── v1.0.0/                          <- Initial official release (2026-03-09)
│   ├── RELEASE_NOTES.md             <- What changed in this version
│   ├── REQUIREMENTS.md              <- Full requirements & specifications
│   ├── ARCHITECTURE.md              <- Architecture & data-flow diagrams
│   └── snapshot/                    <- Full source code snapshot
│       ├── [all frontend HTML files]
│       ├── [all JS files]
│       ├── backend/
│       └── [all config & docs]
│
└── v1.x.x/                          <- Future versions follow same pattern
```

---

## Versioning Scheme

PaySick uses **Semantic Versioning (SemVer)**:

| Increment | When to use |
|-----------|-------------|
| **MAJOR** (v2.0.0) | Breaking changes to the platform — e.g. complete redesign, fundamental flow change, dropped core module |
| **MINOR** (v1.1.0) | New feature or module added — e.g. new dashboard, new API service, new page |
| **PATCH** (v1.0.1) | Bug fix, copy change, style tweak — no new functionality |

---

## How to Create a New Version

See [VERSIONING_GUIDE.md](./VERSIONING_GUIDE.md) for the full step-by-step process.

---

## Released Versions

| Version | Date | Summary |
|---------|------|---------|
| [v1.5.0](./v1.5.0/) | 2026-03-26 | Forgot password / reset password flow: backend routes, branded email, forgot-password.html, reset-password.html, "Forgot password?" link on login, 30 new tests (total: 97 unit tests) |
| [v1.4.4](./v1.4.4/) | 2026-03-26 | Fix login raw SyntaxError shown to user on non-JSON API response; add 8-test regression suite (total: 67 unit tests) |
| [v1.4.3](./v1.4.3/) | 2026-03-24 | Fix lender webhook HMAC: decrypt api_key_encrypted before using as signing secret (was using ciphertext, signatures always failed) |
| [v1.4.2](./v1.4.2/) | 2026-03-24 | Critical fix: removed process.exit(1) from server.js startup validation — was crashing Vercel serverless function and causing HTML 404 on all registration attempts |
| [v1.4.1](./v1.4.1/) | 2026-03-24 | Footer Company section removed site-wide (pending content); login page mobile layout improved with 768px/480px breakpoints and iOS zoom fix |
| [v1.4.0](./v1.4.0/) | 2026-03-16 | Fee model: 5% provider service fee on settlements; 0% patient interest; 5% late fee per overdue month; fee.service.js; fee disclosure in provider-apply.html and payments.html |
| [v1.3.6](./v1.3.6/) | 2026-03-13 | Shield activation: Gate 2 wired into marketplace applications; urgency, monthly obligations, and medical aid fields added to form; decline UX with rationale and alternative offer |
| [v1.3.5](./v1.3.5/) | 2026-03-13 | Bug fix: demo site hardcoded — demo login, dashboard, and marketplace-apply all serve local mock data with no API dependency |
| [v1.3.4](./v1.3.4/) | 2026-03-13 | UI fix: removed duplicate demo link on login page; single "Demo access" link repositioned below fold |
| [v1.3.3](./v1.3.3/) | 2026-03-13 | Bug fix: demo site broken after procedure type — dashboard Apply for Funding linked to onboarding (now marketplace-apply), api-client.js and demo-login.html non-JSON error handling |
| [v1.3.2](./v1.3.2/) | 2026-03-13 | Bug fix: applied same server-resilience fixes to provider-apply.html — inline error banner replaces alert(), response.json() non-JSON protection |
| [v1.3.1](./v1.3.1/) | 2026-03-13 | Bug fix: account creation "Unable to connect" — removed process.exit(-1) from DB pool error handler, fixed register.html JSON parse error masking |
| [v1.3.0](./v1.3.0/) | 2026-03-12 | Generic provider statement, About/Contact pages, Vercel guard fix, package.json cleanup, legacy link fixes |
| [v1.2.0](./v1.2.0/) | 2026-03-12 | Payments UI, extended provider API, Vercel serverless entry, security fix (AES-256-GCM for provider banking data), admin auth on all provider routes |
| [v1.1.0](./v1.1.0/) | 2026-03-12 | Production cleanup: CORS fix for paysick.co.za, login token bug fix, full test suite (59 unit tests) |
| [v1.0.0](./v1.0.0/) | 2026-03-09 | Initial official release — full platform including marketplace, risk engine, provider network, admin dashboards |

---

## Rules

1. **Never edit a snapshot folder** after it has been committed. Snapshots are read-only archives.
2. **Always bump the version** in `CHANGELOG.md` before merging a feature to main.
3. **Dropped features** require a new MINOR/MAJOR version documenting what was removed and why.
4. **Every version folder** must contain all four files: `RELEASE_NOTES.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, and a `snapshot/` directory.
