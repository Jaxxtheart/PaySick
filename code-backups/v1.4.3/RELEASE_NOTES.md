# Release Notes — PaySick v1.4.3

**Version**: 1.4.3
**Date**: 2026-03-24
**Type**: PATCH — Bug fix: lender webhook HMAC validation used encrypted ciphertext instead of plaintext key

---

## Summary

Fixed a bug in the marketplace lender webhook middleware where the AES-encrypted API key ciphertext was being used directly as the HMAC-SHA256 signing secret. Lenders sign webhook requests with their plaintext API key; the server was verifying against the ciphertext. The signatures would never match for any external lender.

---

## Fixed

### `backend/src/routes/marketplace.js` — webhook HMAC validation decrypts API key before use

**Before:**
```javascript
const apiKey = result.rows[0].api_key_encrypted;  // ← raw ciphertext
crypto.createHmac('sha256', apiKey)                // ← wrong: HMAC(ciphertext)
```

**After:**
```javascript
const apiKeyEncrypted = result.rows[0].api_key_encrypted;
const apiKey = decryptBankingData(apiKeyEncrypted);  // ← plaintext
crypto.createHmac('sha256', apiKey)                  // ← correct
```

Also imported `decryptBankingData` from `security.service`.

---

## Impact

External lender webhook integrations were completely broken — any incoming webhook would fail signature verification with 401. This did not affect current live users (no external lenders are integrated yet; the only lender is the PaySick balance-sheet lender which has no API key set). The fix is required before any third-party lender can be onboarded.

---

## Test Results

- 59/59 unit tests pass (security-utils: 40, security.service: 19)
- No regressions

---

## Testing Coverage

Full static analysis performed across all backend routes and frontend HTML files:

| Area | Outcome |
|------|---------|
| `security-utils.test.js` (40 tests) | All pass |
| `security.service.test.js` (19 tests) | All pass |
| Backend routes static review | 1 real bug found (this fix) |
| Frontend HTML static review | 0 real bugs found (agent false positives verified) |
| `payments.js` balance tracking | Correct — outstanding_balance tracks principal only; late fees tracked separately as transactions |
| `server.js` process.exit() | Fixed in v1.4.2 |
| Provider public endpoints | Intentional design (public directory, no sensitive data) |
| login.html response.json() | Inside outer try/catch — handled correctly |
