# Architecture — PaySick v1.4.3

**Version**: 1.4.3
**Date**: 2026-03-24

Architecture is unchanged from v1.4.2 except for the webhook HMAC fix below.

---

## Lender Webhook Signature Flow (FIXED in v1.4.3)

```
External Lender (3rd party):
  POST /api/marketplace/webhooks/lender/{code}
  Headers: X-Lender-Signature: HMAC-SHA256(payload, plaintext_api_key)

Server (marketplace.js webhook middleware):
  1. Look up lender by {code}
  2. Fetch api_key_encrypted from DB
  3. Decrypt → plaintext_api_key           ← FIXED (was using ciphertext directly)
  4. Compute expected = HMAC-SHA256(payload, plaintext_api_key)
  5. timingSafeEqual(received, expected)
  6. next() if match, 401 if not
```

**Before fix:** Step 3 was skipped — ciphertext was passed directly to HMAC, so
signatures would always fail for any external lender.

---

All other architecture unchanged from v1.4.2. See `code-backups/v1.4.2/ARCHITECTURE.md` for full diagrams.
