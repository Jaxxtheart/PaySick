# Requirements & Specifications — PaySick v1.12.0

**Version**: 1.12.0
**Date**: 2026-10-26

Carries forward all requirements from v1.11.0 and adds the homepage
repositioning requirements below.

---

## New Requirements

### Prelaunch positioning and conduct (homepage)

| ID | Requirement | Priority |
|----|-------------|----------|
| POS-01 | The homepage must present PaySick as a healthcare financing platform **in development**, using the owner-approved copy | Must Have |
| POS-02 | The homepage must not use "licensed lender", "apply now", "get approved", "instant credit", "guaranteed financing", "Get Started", or link into login / registration / credit-application / provider-onboarding flows | Must Have |
| POS-03 | The homepage must not make unsupported operational claims (instant setup, 24-hour settlement, nationwide network, immediate access to care, approval rates, partner counts, clinical outcomes) | Must Have |
| POS-04 | The homepage must not publish rates, fees, rand amounts, or repayment examples | Must Have |
| POS-05 | A short availability disclosure ("…in development. Credit is not currently available through this website.") must sit beside the hero, and a not-a-credit-application notice must sit beside every interest form | Must Have |
| POS-06 | The homepage must name Tech & Artery (Pty) Ltd as the developer, and must not name any proposed lending entity | Must Have |
| POS-07 | NCR / National Credit Act detail must not appear on the homepage, its metadata, or its footer | Must Have |
| POS-08 | Title, meta description, Open Graph and JSON-LD must describe a platform in development, with no licensed-credit claims | Must Have |
| POS-09 | A Terms of Service link must appear near the hero disclosure, near each interest form, and in the footer | Must Have |

### Interest registration

| ID | Requirement | Priority |
|----|-------------|----------|
| INT-01 | The patient interest form may collect name and email only | Must Have |
| INT-02 | The provider interest form may collect practice name, contact name, business email, and an optional contact number only | Must Have |
| INT-03 | Neither form may collect ID numbers, banking, income, payslips, bureau consent, or health/treatment information | Must Have |
| INT-04 | Forms must validate input, enforce length limits, and include a hidden honeypot field | Must Have |
| INT-05 | Until an approved, POPIA-reviewed backend exists, forms must not send or store data, must say so visibly, and must never show a success confirmation | Must Have |

### Terms of Service

| ID | Requirement | Priority |
|----|-------------|----------|
| TOS-01 | Terms must include a dated "Credit services and regulatory status" section saying no credit is offered or applied for through the site, and that future lending depends on NCR registration where the NCA requires it | Must Have |
| TOS-02 | Terms must not claim that an NCR application was filed, that registration was granted, or that a specific lending entity exists, unless verified | Must Have |
| TOS-03 | Terms must name Tech & Artery (Pty) Ltd as the website operator | Must Have |

### Bot protection (MINOR-bump review)

| ID | Requirement | Priority |
|----|-------------|----------|
| BOT-12-01 | The blocklist must name the user-triggered AI fetchers `Perplexity-User`, `MistralAI-User`, `Claude-User`, `Webzio-Extended` | Must Have |

---

## Inherited Requirements

All requirements from v1.11.0 remain in effect. See
[v1.11.0/REQUIREMENTS.md](../v1.11.0/REQUIREMENTS.md).

---

## Deprecated Features

### Homepage "Heal now, pay later" proposition and "Get Started" entry point
- Removed in: v1.12.0
- Last available in: v1.11.0 — see code-backups/v1.11.0/snapshot/index.html
- Reason for removal: it implied a live credit and payment-plan product,
  fixed 3-month terms, instant setup, 24-hour provider settlement, and a
  nationwide network. None of these is currently authorised, operational, or
  evidenced.
- Replacement: the prelaunch healthcare financing homepage, with a non-credit
  patient interest list and provider partnership interest forms. The
  underlying login / application / provider-apply pages are unchanged and
  still reachable by direct URL.
