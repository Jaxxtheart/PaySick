# Architecture — PaySick v1.5.2

**Version**: 1.5.2
**Date**: 2026-03-26

---

## New: Password Reset Flow

```
User                     Frontend                     Backend API                   Database
 |                           |                              |                            |
 |--- GET /forgot-password.html ---->|                      |                            |
 |<-- form (email input) ------------|                      |                            |
 |                           |                              |                            |
 |--- submit email ----------|                              |                            |
 |                           |-- POST /api/users/forgot-password --> lookup user        |
 |                           |                              |<---- user row (or null) ---|
 |                           |                              |                            |
 |                           |                              |-- if found:                |
 |                           |                              |   invalidate old tokens ---|
 |                           |                              |   generate rawToken        |
 |                           |                              |   store SHA-256(rawToken) -|
 |                           |                              |   send email (async)       |
 |                           |                              |                            |
 |                           |<-- 200 { message: "If an account..." } ------------------|
 |<-- generic success card --|                              |                            |
 |                           |                              |                            |
 |--- click link in email ------------------> GET /reset-password.html?token=RAW        |
 |<-- form (password inputs) ------------|                  |                            |
 |                           |                              |                            |
 |--- submit new password ----|                             |                            |
 |                           |-- POST /api/users/reset-password (token, password) ----->|
 |                           |                              |-- lookup SHA-256(token)  --|
 |                           |                              |   check used=false         |
 |                           |                              |   check expires_at > now   |
 |                           |                              |                            |
 |                           |                              |-- BEGIN TRANSACTION        |
 |                           |                              |   mark token used        --|
 |                           |                              |   update password_hash   --|
 |                           |                              |   revoke all sessions    --|
 |                           |                              |-- COMMIT                   |
 |                           |                              |                            |
 |                           |<-- 200 { message: "Password reset successfully." } -------|
 |<-- success + redirect to login.html                      |                            |
```

### Security Properties

- **Anti-enumeration**: `POST /forgot-password` always returns `200` with an identical body, whether or not the email is registered.
- **One-way token storage**: Only `SHA-256(rawToken)` is stored in the database. The raw token is transmitted once (in the email) and never persisted.
- **Single-use tokens**: Tokens have `used BOOLEAN DEFAULT false`; the reset transaction atomically sets `used = true`.
- **Expiry**: Tokens expire after 1 hour (`expires_at` checked server-side).
- **Session revocation**: All active sessions for the user are revoked when the password is reset, forcing re-authentication.
- **Indexed lookup**: `idx_password_reset_token ON password_reset_tokens(token_hash) WHERE used = false` — fast, partial-index lookup.

---

## Password Reset Token Lifecycle

```
rawToken = crypto.randomBytes(32).toString('hex')   [64 hex chars]
         |
         v
tokenHash = SHA-256(rawToken)                       [stored in DB]
         |
         v
Email sent: APP_URL/reset-password.html?token=rawToken
         |
         v
User opens link → reset-password.html reads token from URL
         |
         v
POST /api/users/reset-password { token: rawToken, password }
         |
         v
Server: SHA-256(rawToken) == tokenHash?  &&  used == false  &&  expires_at > now?
         |
    yes  |  no → 400
         v
Transaction: used=true, password_hash=scrypt(password), revoke sessions
         v
200 OK
```

---

## New Pages

| Page | Route | Purpose |
|------|-------|---------|
| `forgot-password.html` | `/forgot-password.html` | Email entry to request reset link |
| `reset-password.html` | `/reset-password.html?token=<64-hex>` | New password entry form |

---

## All other architecture unchanged from v1.4.4.

See `code-backups/v1.4.4/ARCHITECTURE.md` for the complete platform architecture.
