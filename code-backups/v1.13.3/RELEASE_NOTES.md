# Release Notes — v1.13.3

**Release Date**: 2026-09-21
**Version Type**: PATCH — real registration number supplied

## Summary

Follow-up to v1.13.2 (legal entity rename), which left the disclosure
text's registration number ("2023/123456/07" — a stale placeholder,
never a real number) untouched because Tech and Artery (Pty) Ltd's real
registration number wasn't known yet. It has now been supplied:
**K2015/346764/07**.

Built test-first per CLAUDE.md: `tests/unit/entity-registration-number.test.js`
was written and confirmed failing (3 of 3 assertions) before editing.

## Changed

- `backend/src/services/underwriting.service.js`: the tariff-gap
  disclosure text's registration line now reads
  "Tech and Artery (Pty) Ltd | Registration No. K2015/346764/07"

This is the only live file that carried a registration number —
`tariff-disclosure.html`'s equivalent line only ever had "NCR
Registration: [Pending] | FSCA Registration: [Pending]", no company
registration number of its own, so nothing there needed changing.

## Removed / Deprecated

None.

## Breaking Changes

None.

## Migration Notes

None. One line of disclosure text in one backend service file; no
schema, API contract, or route change.

## Environmental note (test execution)

Same sandbox constraint as prior releases: no npm registry access, no
`node_modules`. `node --test tests/unit/*.test.js`: 806 tests, 804 pass, 2
fail — the same two pre-existing, unrelated failures noted in every
release since v1.9.0. The edited file was syntax-checked with
`node --check`.
