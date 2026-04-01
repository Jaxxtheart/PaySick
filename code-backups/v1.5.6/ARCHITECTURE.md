# Architecture — PaySick v1.5.6

**Version**: 1.5.6
**Date**: 2026-03-31

No structural architecture changes in this release. All changes are bug fixes to existing service configuration.

---

## Unchanged from v1.5.5

Refer to `code-backups/v1.5.4/ARCHITECTURE.md` for the current architecture diagram.

---

## Email Service — Transport Selection (updated)

The `sendMail()` function in `backend/src/services/email.service.js` now enforces the following logic:

```
sendMail() called
│
├─ nodemailer not installed?
│   └─ log warning to console, return null (dev convenience)
│
├─ NODE_ENV === 'production' AND SMTP_HOST not set?
│   └─ throw Error('SMTP_HOST is required in production...')   ← NEW in v1.5.6
│
├─ SMTP_HOST is set?
│   └─ buildProductionTransport() → send via configured SMTP
│
└─ SMTP_HOST not set (dev/test only):
    └─ buildDevTransport() → Ethereal test account → log preview URL
```

## Environment Variable Map (production)

| Variable | Source | Purpose |
|----------|--------|---------|
| `NODE_ENV` | `vercel.json` env block | `"production"` |
| `APP_URL` | `vercel.json` env block | `"https://paysick.co.za"` — base URL for all emailed links ← **added v1.5.6** |
| `SMTP_HOST` | Vercel dashboard (secret) | SMTP server hostname |
| `SMTP_PORT` | Vercel dashboard (secret) | SMTP port (default 587) |
| `SMTP_USER` | Vercel dashboard (secret) | SMTP username / API key name |
| `SMTP_PASS` | Vercel dashboard (secret) | SMTP password / API key value |
| `SMTP_SECURE` | Vercel dashboard (optional) | `"true"` for port 465/TLS |
| `SMTP_FROM_NAME` | Vercel dashboard (optional) | Display name (default: PaySick) |
| `SMTP_FROM` | Vercel dashboard (optional) | From address (default: noreply@paysick.co.za) |
