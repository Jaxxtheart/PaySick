# Requirements & Specifications — PaySick v1.4.3

**Version**: 1.4.3
**Date**: 2026-03-24

This document carries forward all requirements from v1.4.2 with the following addition.

---

## Changed / Added Requirements

### 2.6 Security & Infrastructure

| ID | Requirement | Priority |
|----|-------------|----------|
| SEC-11 | Lender webhook HMAC validation must decrypt the stored API key before computing the expected signature — lenders sign with plaintext; server stores AES-encrypted | Must Have — fixed v1.4.3 |

All other requirements unchanged from v1.4.2. See `code-backups/v1.4.2/REQUIREMENTS.md` for the full specification.
