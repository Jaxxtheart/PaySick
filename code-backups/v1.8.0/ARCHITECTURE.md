# Architecture — PaySick v1.8.0

**Version**: 1.8.0
**Date**: 2026-06-10

---

## Changes from v1.7.5

### New Middleware Layer

Two new middleware modules added to the Express.js middleware chain:

```
Incoming Request
    │
    ▼
Helmet (security headers)
    │
    ▼
CORS
    │
    ▼
Morgan (request logging)
    │
    ▼
Body Parser (JSON / URL-encoded)
    │
    ▼
Global Rate Limiter (100 req/IP per 15 min)       ← existing
    │
    ▼
Security Headers (X-Robots-Tag, X-Frame-Options…) ← existing
    │
    ▼
Bot Blocker Middleware  ← NEW (backend/src/middleware/bot-blocker.js)
│   Reads User-Agent header
│   Matches against BOT_USER_AGENT_PATTERNS (regex array)
│   → 403 BOT_BLOCKED if matched
│   → next() if not matched
    │
    ▼
Honeypot Block Middleware  ← NEW (backend/src/middleware/honeypot.js)
│   Checks blockedIPs Set (in-memory, session-scoped)
│   → 403 HONEYPOT_BLOCKED if IP is blocked
│   → next() if not blocked
    │
    ▼
API Routes (users / applications / payments / providers / marketplace / risk / shield / notifications)
    │
    ▼
GET /api/hp-check  ← NEW honeypot trap endpoint
│   Records requesting IP in blockedIPs Set
│   Returns 200 { ok: true } (lures automated tools)
```

### Bot Blocker (`backend/src/middleware/bot-blocker.js`)

```
bot-blocker.js
├── BOT_USER_AGENT_PATTERNS  — Array<RegExp>
│     Major crawlers: Googlebot, Bingbot, Baiduspider, YandexBot, DuckDuckBot, Slurp, Exabot
│     SEO tools: AhrefsBot, SemrushBot, MJ12bot, DotBot, rogerbot, linkdexbot
│     HTTP libs: python-requests, python-urllib, Scrapy, curl/, Wget/
│     Headless browsers: HeadlessChrome, PhantomJS, Selenium, Playwright, Puppeteer
│     Social: facebot, facebookexternalhit
│
├── isBotUserAgent(ua: string): boolean  — exported for testing
│
└── default export: Express middleware
      req.headers['user-agent'] → isBotUserAgent() → 403 or next()
```

### Honeypot (`backend/src/middleware/honeypot.js`)

```
honeypot.js
├── blockedIPs: Set<string>  — in-memory, process-scoped
│
├── isHoneypotBlocked(ip: string): boolean  — exported for testing
├── recordHoneypotHit(ip: string): void     — exported for testing
│
├── honeypotBlockMiddleware  — Express middleware
│     Checks blockedIPs; 403 HONEYPOT_BLOCKED if found; next() otherwise
│
└── honeypotTrapHandler      — Express route handler
      Calls recordHoneypotHit(clientIP)
      Returns 200 { ok: true }
```

### API Client Resilience (`api-client.js`)

```
PaySickAPI.request(endpoint, options, _isRetry=false)
    │
    ├── Fetch with current access token
    │
    ├── On 401 + TOKEN_EXPIRED + !_isRetry + refreshToken exists:
    │       │
    │       ├── _refreshAccessToken(refreshToken)
    │       │       POST /api/users/refresh-token
    │       │       Returns { accessToken, refreshToken }
    │       │
    │       ├── Success: update localStorage, retry request(_isRetry=true)
    │       │
    │       └── Failure: users.logout() + throw 'Session expired'
    │
    └── On other errors: throw as before

PaySickAPI._refreshAccessToken(refreshToken)
    Direct fetch (no auth header) to /api/users/refresh-token
    Returns parsed JSON or throws

PaySickAPI.users.logout()
    try: POST /api/users/logout   ← NEW (server-side revocation)
    finally: clear localStorage   ← always runs

PaySickAPI.users.refreshToken()
    Public manual refresh — reads stored refresh token, calls _refreshAccessToken,
    updates localStorage, returns token data
```

### Static Assets

```
public/
└── robots.txt    ← NEW
      User-agent: *
      Disallow: /
```

---

## Inherited Architecture

All components from v1.7.5 remain unchanged. See [v1.7.5/ARCHITECTURE.md](../v1.7.5/ARCHITECTURE.md) for the full backend, database, and frontend architecture.

---

## Security Posture (v1.8.0)

| Protection | Status |
|-----------|--------|
| `robots.txt` Disallow: / | Done |
| `X-Robots-Tag` header | Done |
| Global rate limiting (100/15min) | Done |
| Auth endpoint rate limiting (10/15min) | Done |
| Bot User-Agent fingerprinting | Done (v1.8.0) |
| Honeypot trap | Done (v1.8.0) |
| No public source maps | Done |
| API authentication required | Done |
| AES-256-GCM encrypted sensitive data | Done |
| Opaque tokens (not JWT) | Done |
| scrypt password hashing | Done |
| Security audit log | Done |
| IP blocking on auth failures | Done |
