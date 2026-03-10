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
| [v1.0.0](./v1.0.0/) | 2026-03-09 | Initial official release — full platform including marketplace, risk engine, provider network, admin dashboards |

---

## Rules

1. **Never edit a snapshot folder** after it has been committed. Snapshots are read-only archives.
2. **Always bump the version** in `CHANGELOG.md` before merging a feature to main.
3. **Dropped features** require a new MINOR/MAJOR version documenting what was removed and why.
4. **Every version folder** must contain all four files: `RELEASE_NOTES.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, and a `snapshot/` directory.
