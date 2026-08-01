# Requirements & Specifications — PaySick v1.9.0

**Version**: 1.9.0
**Date**: 2026-08-01

Carries forward all requirements from v1.8.1 and its predecessors, and adds the
requirements below. This release reconciles seven branches that had never reached
`main`: it adds the `/api/v1` facilitation surface, completes the CLAUDE.md bot
crawling protections, moves SA ID validation server-side, adds a Shield™ slide to
the investor deck, and adds a `/research` page.

---

## New Requirements

### Facilitation API (v1)

| ID | Requirement | Priority |
|----|-------------|----------|
| API-01 | The platform must expose a versioned facilitation surface at `/api/v1` covering applications, decisions, payouts and schedules | Must Have |
| API-02 | `POST /api/v1/applications` must create a facilitation application and return its identifier | Must Have |
| API-03 | `POST /api/v1/decisions/:applicationId` must run the Shield gate engine and record the resulting decision | Must Have |
| API-04 | `POST /api/v1/payouts/:applicationId` must trigger the two-stage payout (80% provisional, 20% on reconciliation) | Must Have |
| API-05 | `GET /api/v1/schedules/:applicationId` must return the arrangement schedule | Must Have |
| API-06 | Every `/api/v1` endpoint must require authentication; none may return business logic or data to an unauthenticated caller | Must Have |
| API-07 | `/api/v1` must carry a rate-limit bucket stricter than the general `/api/` allowance, because these endpoints move money | Must Have |
| API-08 | Migration filenames must be uniquely numbered; the migration runner sorts by filename, so duplicate numbers are prohibited | Must Have |

### Shield gate engine

| ID | Requirement | Priority |
|----|-------------|----------|
| SHIELD-01 | Every arrangement must pass five gates: Provider, Affordability, Urgency, Tariff, Circuit Breaker | Must Have |
| SHIELD-02 | The Provider gate must enforce tier and billing-agreement checks, a 5% single-provider concentration limit, and a 20% procedure-type concentration limit | Must Have |
| SHIELD-03 | The Affordability gate must require verified income no older than 90 days | Must Have |
| SHIELD-04 | The Tariff gate must compute the facilitatable ceiling from scheme tariffs | Must Have |
| SHIELD-05 | The Circuit Breaker gate must halt disbursements on anomaly detection and escalate to the human review queue | Must Have |
| SHIELD-06 | Any public claim about Shield (investor deck included) must correspond to a gate that exists in `shield-gates.service.js` | Must Have |

### Bot crawling prevention (completing the CLAUDE.md requirements)

| ID | Requirement | Priority |
|----|-------------|----------|
| BOT-01 | `robots.txt` must be served from the repository root disallowing all crawlers from all paths | Must Have |
| BOT-02 | Every response must carry `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`, including statically served HTML pages, which never pass through Express | Must Have |
| BOT-03 | Known bot and scraper User-Agents must be blocked with 403 | Must Have |
| BOT-04 | AI training and retrieval crawlers must be named explicitly in the blocklist, not left to the generic `/bot\b/` pattern | Must Have |
| BOT-05 | Every entry-point page must carry a hidden honeypot link to `GET /api/hp-check`; the anchor must be `display:none`, `aria-hidden="true"`, `tabindex="-1"` and `rel="nofollow"` | Must Have |
| BOT-06 | Any client that follows the honeypot link must be blocked for the remainder of the session | Must Have |
| BOT-07 | `POST /forgot-password` and `POST /resend-verification` must be rate limited to 5 requests per hour per user | Must Have |
| BOT-08 | The blocklist and rate-limit thresholds must be reviewed at every MINOR or MAJOR bump, and that review must be expressed as tests | Must Have |

### Identity verification

| ID | Requirement | Priority |
|----|-------------|----------|
| ID-01 | SA ID numbers must be validated server-side at registration; browser validation is advisory only | Must Have |
| ID-02 | Validation must check the 13-digit shape, the embedded date of birth, the citizenship digit (0 or 1) and the Luhn check digit | Must Have |
| ID-03 | A date of birth encoded in the future must be rejected | Must Have |
| ID-04 | Where a date of birth is declared separately, it must match the one encoded in the ID | Must Have |
| ID-05 | The century pivot must be derived from the current date, never hardcoded | Must Have |
| ID-06 | Rejections must return `400` with code `INVALID_SA_ID` and a specific reason | Must Have |

### Investor deck — Shield slide

| ID | Requirement | Priority |
|----|-------------|----------|
| DECK-18 | The deck must include a Shield™ slide framing the risk engine as proprietary IP | Must Have |
| DECK-19 | The Shield slide must name all five shipped gates and must not name gates that do not exist | Must Have |
| DECK-20 | The Shield slide must not restate risk figures superseded by slide 08 (PD 1.4%, net loss 0.63%) | Must Have |
| DECK-21 | Slide-counter denominators, navigation dots and PPTX slide count must all equal 17 | Must Have |
| DECK-22 | DECK-10 (prohibited lending vocabulary) and DECK-11 (no em dashes) apply to the Shield slide; "underwriting" is prohibited in deck copy | Must Have |

### Research page

| ID | Requirement | Priority |
|----|-------------|----------|
| RES-01 | The platform must serve a `/research` page using the shared site header, footer and legal links | Must Have |
| RES-02 | The page must be reachable from the site navigation | Must Have |
| RES-03 | While no paper is published, the page must say so plainly and offer a contact route rather than a download | Must Have |
| RES-04 | The page must not link to a document that is not present in the repository | Must Have |
| RES-05 | Superseded white-paper revisions must not be published; only the current revision may be offered | Must Have |

---

## Inherited Requirements

All requirements from v1.8.1 remain in effect. See
[v1.8.1/REQUIREMENTS.md](../v1.8.1/REQUIREMENTS.md).

---

## Deprecated Features

### Client-only SA ID validation
- Removed in: v1.9.0
- Last available in: v1.8.1 — see code-backups/v1.8.1/snapshot/backend/src/routes/users.js
- Reason for removal: `POST /api/users/register` asserted only `/^\d{13}$/`, so a caller bypassing the browser could register with a structurally impossible ID such as `0000000000000`; the `users` table constrains only `LENGTH(sa_id_number) = 13`
- Replacement: `backend/src/utils/sa-id.js`, called from registration (ID-01 through ID-06)

### Pre-invalidation of unused password-reset tokens
- Removed in: v1.8.x on `main`, reaffirmed in v1.9.0
- Last available in: code-backups/v1.7.x snapshots
- Reason for removal: force-invalidating earlier unused tokens on every request meant that requesting a reset link twice, or a double-fired request, killed the first email's link. The v1.8.3 proposal on `claude/paysick-codebase-audit-q127cz` would have reintroduced this via a `UNIQUE (user_id) WHERE used = false` partial index, and was rejected for that reason.
- Replacement: single-use, 1-hour-expiring tokens that are allowed to coexist (`password-reset.service.js`)

### Investor-deck marketplace-to-balance-sheet pivot (proposed, never shipped)
- Removed in: n/a — rejected at v1.9.0, never present on `main`
- Last available in: branch `claude/update-paysick-investor-deck-v9VKG` (v1.7.7 snapshot on that branch)
- Reason for removal: would have replaced the marketplace model with direct balance-sheet funding at an R30M ask, contradicting the July v1.8.1 deck that had already been through a market-sizing correction
- Replacement: none. The marketplace narrative stands; only the Shield IP slide was taken (DECK-18 through DECK-22)

### January legal-page copy (terms.html, privacy.html, licenses.html, accessibility.html, providers.html)
- Removed in: n/a — rejected at v1.9.0, never present on `main`
- Last available in: branch `claude/update-terms-of-service-Xncc6`
- Reason for removal: `main`'s legal pages were written independently in March under different filenames and then passed through the v1.5.5 regulatory terminology compliance audit and a deliberate removal of credit-licensing references. Re-introducing the January copy would have undone that audit.
- Replacement: none. `terms-of-service.html`, `privacy-policy.html`, `licenses.html`, `accessibility.html` and `providers.html` on `main` stand.

### Mock-data provider dashboard
- Removed in: n/a — rejected at v1.9.0, never present on `main`
- Last available in: branch `claude/paysick-marketplace-migration-Drzb4`
- Reason for removal: `main`'s `provider-dashboard.html` is wired to the backend; the branch's variant is a mock-data prototype with no API calls
- Replacement: none. `main`'s backend-wired dashboard stands.
