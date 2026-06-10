# Requirements & Specifications — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-06-10

Carries forward all requirements from v1.7.5 with the following additions.

---

## New Requirements

### Bot Crawling Prevention — Hardened (CLAUDE.md Compliance)

| ID | Requirement | Priority |
|----|-------------|----------|
| SEC-01 | `public/robots.txt` must exist and contain `User-agent: *` and `Disallow: /` | Must Have |
| SEC-02 | All API responses must include `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` | Must Have |
| SEC-03 | A bot User-Agent blocklist middleware must run before all API routes | Must Have |
| SEC-04 | The blocklist must cover major search crawlers (Googlebot, Bingbot, YandexBot, Baiduspider), SEO tools (AhrefsBot, SemrushBot, MJ12bot), HTTP libraries used for scraping (python-requests, Scrapy, curl, wget), and headless browsers (HeadlessChrome, PhantomJS, Selenium, Playwright, Puppeteer) | Must Have |
| SEC-05 | Requests with a matched bot User-Agent must receive `403 Forbidden` with `code: 'BOT_BLOCKED'` | Must Have |
| SEC-06 | A honeypot trap endpoint must exist that records the requesting IP and blocks all subsequent requests from that IP for the session | Must Have |
| SEC-07 | The honeypot endpoint must return `200 { ok: true }` to the triggering client (to maximise luring of automated tools) | Must Have |
| SEC-08 | All blocked IPs (from honeypot) must receive `403 Forbidden` with `code: 'HONEYPOT_BLOCKED'` on all subsequent requests | Must Have |

### API Client Resilience

| ID | Requirement | Priority |
|----|-------------|----------|
| CLI-01 | When any API request receives a `401` response with `code: 'TOKEN_EXPIRED'`, the client must automatically attempt to refresh the access token using the stored refresh token | Must Have |
| CLI-02 | After a successful token refresh, the original failed request must be retried exactly once with the new access token | Must Have |
| CLI-03 | If the token refresh fails, all session data must be cleared from localStorage and a user-friendly error must be thrown | Must Have |
| CLI-04 | Token auto-refresh must not be attempted for `401` responses with codes other than `TOKEN_EXPIRED` | Must Have |
| CLI-05 | Token auto-refresh must not be attempted when no refresh token exists in localStorage | Must Have |
| CLI-06 | `users.logout()` must call `POST /api/users/logout` to revoke the session server-side before clearing localStorage | Must Have |
| CLI-07 | If the server-side logout call fails (network error or error status), localStorage must still be cleared | Must Have |

---

## Inherited Requirements

All requirements from v1.7.5 remain in effect. See [v1.7.5/REQUIREMENTS.md](../v1.7.5/REQUIREMENTS.md) for the full set.

---

## Deprecated Features

None in this release.
