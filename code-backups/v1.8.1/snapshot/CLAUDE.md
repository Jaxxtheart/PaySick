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

## Test-First Development (Mandatory)

**All work — new features, bug fixes, and changes — must follow a test-first workflow. Writing code before a test exists is a violation of this rule.**

### New functionality workflow

When building any new page, feature, API route, or module:

1. **Write a failing test first** that describes the expected behaviour of the new functionality
2. **Confirm the test fails** before writing any implementation code — a test that passes before the implementation exists is not a valid test
3. **Implement the functionality** until the test passes
4. **Do not ship** any feature without a passing test that was written before the implementation

### Bug Fixing Workflow

When a bug is reported, do not start by trying to fix it. Instead:

1. **Write a failing test first** that reproduces the bug
2. **Use subagents to attempt the fix** — each subagent should try to resolve the bug independently
3. **Prove the fix with a passing test** — the fix is only accepted when the previously failing test passes

### Rules

- **Never write implementation code before a test.** This applies to all work without exception.
- If you catch yourself writing implementation before a test, stop immediately, delete the implementation, write the test first, confirm it fails, then re-implement.
- A passing test written *after* the implementation does not satisfy this requirement — order matters.
---

## Bot Crawling Prevention

All pages and API routes must be protected against automated crawling and content scraping — regardless of whether the bot identifies itself as legitimate.

### Required protections

- **`robots.txt`** — maintain a `public/robots.txt` that disallows all crawlers from all paths:
  ```
  User-agent: *
  Disallow: /
  ```
- **`X-Robots-Tag` HTTP header** — every response must include:
  ```
  X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
  ```
- **Rate limiting** — all routes must enforce per-IP rate limiting. Requests exceeding the threshold must receive `429 Too Many Requests` and be temporarily blocked.
- **Bot fingerprinting** — detect and block known bot signatures via `User-Agent` analysis. Maintain a blocklist of known scraper and crawler user-agent strings.
- **JavaScript rendering requirement** — pages must require client-side JS execution to render meaningful content, so that headless HTTP scrapers receive no usable payload.
- **Honeypot traps** — include hidden links or fields invisible to real users. Any client that follows a honeypot link must be permanently blocked for that session.
- **No public source maps** — never serve `.map` files in production. Set `productionBrowserSourceMaps: false` (or equivalent) in the build config.
- **API authentication** — every API endpoint must require authentication. No endpoint may return business logic, source structure, or sensitive data to an unauthenticated caller.

### Rules

- Every new page or API route added must be reviewed to confirm all protections above apply before merging.
- Rate limit thresholds and the bot `User-Agent` blocklist must be reviewed and updated with each MINOR or MAJOR version bump.
- Violations of any protection above must be treated as a bug and assigned a PATCH version fix.
