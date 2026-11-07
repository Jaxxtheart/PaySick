# Requirements & Specifications: PaySick v1.22.0

**Version**: 1.22.0
**Date**: 2026-10-27

Carries forward all requirements from v1.21.0 and adds the following.

## New Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| KEHR-B01 | An uploaded payslip or statement is read into figures only with the `document_upload` consent; the file is never stored | Must Have |
| KEHR-B02 | Figures read by the AI model are normalised (integer cents, 13-digit ID, bounded names) and cross-checked; malformed output is "unreadable", never guessed | Must Have |
| KEHR-B03 | Uploads accept PDF, JPG or PNG under 4MB and share the tight rate limit | Must Have |
| KEHR-B04 | A plan link is sent on WhatsApp only when the provider confirms the patient agreed | Must Have |
| KEHR-B05 | The WhatsApp message carries the provider name and the link only: no amount, patient name or health information | Must Have |
| KEHR-B06 | A failed WhatsApp send never loses the link; the provider is told plainly, and test mode says nothing was sent | Must Have |
| KEHR-B07 | Passkeys require user verification; only "none" attestation is accepted; only the public key and counter are stored | Must Have |
| KEHR-B08 | Passkey challenges are server-side, single use, expire after 5 minutes and are tied to a purpose and (for registration) a user | Must Have |
| KEHR-B09 | A signature counter that does not increase is refused (clone detection), except authenticators that always report zero | Must Have |
| KEHR-B10 | A passkey sign-in gets the same session as a password login, only for active, unlocked accounts; failures are logged | Must Have |
| KEHR-B11 | Passkeys are off in production until `WEBAUTHN_RP_ID` and `WEBAUTHN_ORIGINS` are set | Must Have |
| KEHR-B12 | After sign-in, a plan link opened while signed out returns the patient to it | Should Have |

## Inherited Requirements
All requirements from v1.21.0 remain in effect. See [v1.21.0/REQUIREMENTS.md](../v1.21.0/REQUIREMENTS.md).

## Deprecated Features
None in this version.
