# Architecture — PaySick v1.5.4

**Version**: 1.5.4
**Date**: 2026-03-26

---

## Updated: Auth Middleware Exports

`auth.middleware.js` now exports the complete set of role middleware:

```
auth.middleware.js exports:
  authenticateToken        — validates opaque token, attaches req.user
  requireAdmin             — requires role === 'admin'
  requireLender            — requires role === 'lender' or 'admin'
  requireProvider          — requires role === 'provider' or 'admin'
  requireRole(role)        — factory: requires role === <role> or 'admin'  ← NEW in v1.5.4
  optionalAuth             — attaches user if token present, never blocks
  createUserRateLimit()    — per-user rate limiter factory
  extractToken             — extracts Bearer token from Authorization header
  getClientIP              — extracts client IP (handles proxies)
```

Route usage:

```javascript
// providers.js — uses requireRole factory (now works)
router.get('/admin/all', authenticateToken, requireRole('admin'), handler);

// payments.js, applications.js, risk.js, shield.js — use requireAdmin directly
router.get('/...', authenticateToken, requireAdmin, handler);

// marketplace.js — uses requireAdmin and requireLender
router.get('/...', authenticateToken, requireLender, handler);
```

---

## All other architecture unchanged from v1.5.3.

See `code-backups/v1.5.3/ARCHITECTURE.md` for the full platform architecture.
