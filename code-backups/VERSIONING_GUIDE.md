# PaySick Versioning Guide

This guide explains **exactly** how to cut a new version backup every time a feature is added, changed, or dropped on the platform.

---

## When to Create a New Version

| Event | Version Type | Action Required |
|-------|-------------|-----------------|
| New page / new feature / new API module | MINOR (v1.X.0) | New version folder + updated docs |
| Bug fix, copy change, UI tweak | PATCH (v1.0.X) | New version folder + release notes only |
| Major redesign, dropped core module, breaking API change | MAJOR (vX.0.0) | New version folder + full docs + deprecation notes |
| Feature dropped / removed from platform | MINOR or MAJOR | New version folder + deprecation notice in REQUIREMENTS.md |

---

## Step-by-Step: Creating a New Backup Version

### Step 1 — Decide the New Version Number

Check the last entry in [CHANGELOG.md](./CHANGELOG.md) and increment:

```
Current: v1.0.0
New feature added → v1.1.0
Bug fix only      → v1.0.1
Breaking change   → v2.0.0
```

### Step 2 — Create the New Version Folder

```bash
mkdir -p code-backups/vX.Y.Z/snapshot
```

### Step 3 — Copy the Current Platform Snapshot

Copy every source file from the repository root into `snapshot/`. Exclude `.git/`, `node_modules/`, and the `code-backups/` folder itself:

```bash
rsync -av --exclude='.git' \
          --exclude='node_modules' \
          --exclude='code-backups' \
          ./ code-backups/vX.Y.Z/snapshot/
```

### Step 4 — Write RELEASE_NOTES.md

Create `code-backups/vX.Y.Z/RELEASE_NOTES.md` with:

```markdown
# Release Notes — vX.Y.Z
**Release Date**: YYYY-MM-DD
**Version Type**: MINOR | MAJOR | PATCH

## Summary
[One paragraph describing what changed]

## New Features
- Feature A
- Feature B

## Bug Fixes
- Fix C

## Removed / Deprecated
- Feature D removed because [reason]
  - See v1.0.0 for last version containing Feature D

## Breaking Changes
- [any breaking API or schema changes]

## Migration Notes
- [any steps needed when upgrading]
```

### Step 5 — Update REQUIREMENTS.md

Copy the previous version's `REQUIREMENTS.md` as a starting point, then:

- Add new requirements for added features.
- Mark removed features as `[DEPRECATED in vX.Y.Z]` and add the reason.
- Update the "Current Version" header.

### Step 6 — Update ARCHITECTURE.md

Copy the previous version's `ARCHITECTURE.md` and update:

- System architecture diagram (add/remove components).
- Data flow diagrams for any changed flows.
- Database schema overview (add/remove tables).
- Update the "Current Version" header.

### Step 7 — Update the Master CHANGELOG.md

Add the new version entry at the **top** of `CHANGELOG.md`.

### Step 8 — Update code-backups/README.md

Add the new version row to the "Released Versions" table.

### Step 9 — Commit and Push

```bash
git add code-backups/
git commit -m "chore: add vX.Y.Z backup - [brief description]"
git push origin main
```

---

## Handling Dropped Features

When a feature is removed from the live platform:

1. The **last version** that contained the feature remains in its snapshot folder — never delete it.
2. The new version's `REQUIREMENTS.md` should include a **Deprecated Features** section:
   ```markdown
   ## Deprecated Features
   ### [Feature Name]
   - **Removed in**: vX.Y.Z
   - **Last available in**: vA.B.C — see [code-backups/vA.B.C/snapshot/](../vA.B.C/snapshot/)
   - **Reason for removal**: [business or technical reason]
   - **Replacement**: [what replaced it, if anything]
   ```
3. The architecture diagrams must be updated to show the removal.

---

## Quick Reference Checklist

When cutting a new version, tick every item:

- [ ] Version number decided (semver)
- [ ] `code-backups/vX.Y.Z/snapshot/` created with full source copy
- [ ] `RELEASE_NOTES.md` written
- [ ] `REQUIREMENTS.md` updated (new features added, removed features marked deprecated)
- [ ] `ARCHITECTURE.md` updated (diagrams reflect current state)
- [ ] `CHANGELOG.md` updated (new entry at top)
- [ ] `code-backups/README.md` Released Versions table updated
- [ ] Committed and pushed to main
