# PaySick — Repository Rules

## Code Backup & Versioning

Every time a feature ships or is dropped, a new version must be archived in `code-backups/`.

### When to create a new version

| Event | Version bump |
|-------|-------------|
| New page, feature, or API module added | MINOR — e.g. v1.0.0 → v1.1.0 |
| Bug fix, copy change, or UI tweak only | PATCH — e.g. v1.0.0 → v1.0.1 |
| Breaking change or core module removed | MAJOR — e.g. v1.0.0 → v2.0.0 |

### Steps required for every new version

1. **Bump the version number** using SemVer — check the last entry in `code-backups/CHANGELOG.md`
2. **Create the version folder**: `mkdir -p code-backups/vX.Y.Z/snapshot`
3. **Copy the full source snapshot** into `code-backups/vX.Y.Z/snapshot/` — exclude `.git`, `node_modules`, and `code-backups` itself
4. **Write `RELEASE_NOTES.md`** — what changed, what was added, what was removed
5. **Write/update `REQUIREMENTS.md`** — add new requirements; mark removed features as `[DEPRECATED in vX.Y.Z]`
6. **Write/update `ARCHITECTURE.md`** — update diagrams to reflect the current state
7. **Update `code-backups/CHANGELOG.md`** — add the new version entry at the top
8. **Update `code-backups/README.md`** — add the new version row to the Released Versions table

Full step-by-step instructions are in [`code-backups/VERSIONING_GUIDE.md`](./code-backups/VERSIONING_GUIDE.md).

### Dropped features

When a feature is removed from the live platform:

- Its code stays permanently in the last snapshot that contained it — **never delete snapshot folders**
- The new version's `REQUIREMENTS.md` must include a **Deprecated Features** section:
  ```
  ## Deprecated Features
  ### [Feature Name]
  - Removed in: vX.Y.Z
  - Last available in: vA.B.C — see code-backups/vA.B.C/snapshot/
  - Reason for removal: [reason]
  - Replacement: [what replaced it, if anything]
  ```
- Architecture diagrams must be updated to reflect the removal

### Rules

- Never edit a snapshot folder after it has been committed — snapshots are read-only archives
- Every version folder must contain all four files: `RELEASE_NOTES.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, and a `snapshot/` directory
- Always update `CHANGELOG.md` and `code-backups/README.md` as part of the same commit
