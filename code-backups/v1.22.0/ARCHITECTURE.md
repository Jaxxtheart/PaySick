# Architecture: PaySick v1.22.0

**Version**: 1.22.0
**Date**: 2026-10-27

## Changes from v1.21.0

```
kehr-pass.html ── upload ──▶ POST /api/kehr/preapprovals/:id/documents/upload  (kehrAssessLimiter)
                               └─ flow.readDocument (needs document_upload consent)
                                    └─ kehr-document-reader.service ──▶ Anthropic (tool: extract_income_document)
                                         └─ normalise ▶ figures ▶ kehr_preapprovals.documents ▶ cross-check at assess

provider-kehr.html ── "send on WhatsApp" (patient agreed) ──▶ POST /api/kehr/provider/plan-links
                               └─ flow.createProviderPlanLink ▶ deliverByWhatsApp
                                    └─ whatsapp.adapter ──▶ Meta Cloud API template kehr_plan_link (or mock)
                                    └─ underwriting_audit_log KEHR_PLAN_LINK_SENT (no phone)

login.html / kehr-pass.html ── js/passkey.js (navigator.credentials) ──▶ /api/auth/passkeys/*  (authLimiter)
   register/options, register/verify, GET /, DELETE /:id   (authenticateToken)
   login/options, login/verify                              (the authentication itself)
        └─ passkey.service ── webauthn.service ── utils/cbor
        │       challenges: webauthn_challenges (single use, 5 min)   keys: user_passkeys (015)
        └─ login/verify ▶ security.service.createSession (same session as password login)
```

The rest is as in [v1.21.0/ARCHITECTURE.md](../v1.21.0/ARCHITECTURE.md).
