# Requirements & Specifications — PaySick v1.5.6

**Version**: 1.5.6
**Date**: 2026-03-31

Carries forward all requirements from v1.5.5 with the following additions.

---

## New Requirements — Email Service Production Configuration

| ID | Requirement | Priority |
|----|-------------|----------|
| EMAIL-01 | `APP_URL` must be set to `https://paysick.co.za` in `vercel.json` so all emailed links use the correct production domain | Must Have |
| EMAIL-02 | When `NODE_ENV=production` and `SMTP_HOST` is not set, `sendMail()` must throw a clear configuration error — it must never silently fall back to Ethereal or any test transport | Must Have |
| EMAIL-03 | In development (`NODE_ENV != production`), the Ethereal test account fallback is permitted so that email flows can be tested locally without real SMTP credentials | Must Have |
| EMAIL-04 | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` must be configured as environment secrets in the Vercel dashboard; they must never be committed to `vercel.json` | Must Have |
| EMAIL-05 | Every new emailed link (verification, password reset, or otherwise) must use `APP_URL` as its base — hard-coded domains or `localhost` fallbacks are prohibited in production paths | Must Have |

---

## Carried Forward from v1.5.5

See `code-backups/v1.5.5/REQUIREMENTS.md` for the full requirements list, including regulatory terminology compliance requirements REG-01 through REG-11.
