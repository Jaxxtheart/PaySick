# Release Notes — v1.13.0

**Release Date**: 2026-10-26
**Version Type**: MINOR — PaySick Care Agent added to the homepage

## Summary
This release ports the **PaySick Care Agent** onto `main`'s repositioned
homepage. The Care Agent was built on the unmerged branch
`claude/inspiring-bardeen-b97kat` (that branch's own v1.12.0 to v1.16.0).
Only the Care Agent subsystem is ported. The branch's unrelated site-wide
changes (entity rename, payment-plan copy, em-dash removal, and its own
`code-backups/` archives) are **not** included.

Built test-first:
- The branch's 15 Care Agent unit suites and its integration suite were
  brought over first, together with a new `homepage-care-agent.test.js`, and
  confirmed failing.
- The implementation was then ported until they passed.
- The model fixes below each got a failing test first.

## Added
- **Homepage hero search bar**: "What do you need help paying for? Ask
  PaySick...". It sends the typed question to `care-agent.html?q=…`. The
  existing hero copy and CTAs are unchanged.
- **`care-agent.html`**: the conversational Care Agent page. Signed-out
  visitors see a log-in prompt. Signed-in users chat, upload a quote,
  invoice or scheme statement, review term options, and hand off to the
  existing `POST /api/marketplace/applications` flow.
- **API `/api/care-agent/*`** (`backend/src/routes/care-agent.js`): sessions,
  messages, documents, confirm, approve, execute, and manage. Every route
  requires authentication. It has its own rate limit of 60 requests per
  15 minutes.
- **Services**:
  - `care-agent.service.js`: shortfall and term arithmetic
  - `care-agent-nlp.service.js`: the deterministic fallback engine
  - `care-agent-llm.service.js`: the Claude tool-calling agent
  - `care-agent-document.service.js`: document extraction
  - `care-agent-anthropic-client.js`: the shared API client
  - `utils/affordability-policy.js`: thresholds shared with Shield Gate 2
    (`patient-gate.service.js` now imports them, with the same values)
- **Migration `012_care_agent.sql`**: the `care_agent_sessions`,
  `care_agent_audit_log` and `care_agent_manage_requests` tables.
- `api-client.js` gains `PaySickAPI.careAgent.*`.
- `server.js`: the JSON body limit goes from 1 MB to 6 MB, for base64
  document uploads.

## Changed versus the branch (port review)
- **Default model `claude-sonnet-5` → `claude-opus-5-5`**, the current
  Claude model.
- **Document extraction no longer forces `tool_choice`.** Current models
  reject a forced `tool`/`any` with a 400. The system prompt already
  instructs the call, and a missing call still throws.
- **Default `max_tokens` 1024 → 16000.** Current models always think, and
  thinking counts against `max_tokens`, so 1024 could end a turn with no
  reply.
- **A refusal, or an empty reply, now throws.** Before, it returned a blank
  message. The route then falls back to the deterministic engine, so the
  patient always gets a reply.

## How it runs
- **With `ANTHROPIC_API_KEY` set**: the Claude agent reasons and calls
  PaySick's own validated tools.
- **Without the key, or on any model error**: the deterministic engine
  answers. The response's `fallbackReason` says why.
- Document reading needs the key. Without it, the route says so; there is
  no OCR fallback.

## Review (MINOR bump)
- **Rate limits**: there is a new `/api/care-agent` bucket (60 per
  15 minutes). The other limits are unchanged.
- **Bot blocklist**: reviewed, no change. The v1.12.0 additions are current.
- **Bot protection**: `care-agent.html` carries the honeypot anchor, and the
  catch-all `X-Robots-Tag` covers it.

## Test results
- `node --test tests/unit/*.test.js`: 950 tests, 948 pass. The 2 failures are
  the unchanged `email-service` and `marketplace-lender-gate` suites, which
  can't load `nodemailer` / `pg` in the sandbox.
- `tests/integration/care-agent.test.js` was ported but **not run**: it
  needs jest and supertest, and this container's network policy blocks
  registry.npmjs.org.
- Chromium: the homepage search goes to `care-agent.html?q=…` on desktop and
  at 375px, with no console errors and no horizontal scroll. The signed-out
  Care Agent shows its log-in prompt. The signed-in conversation could not
  be exercised here, because there is no backend packages or database.

## Deployment steps (not done here)
1. Run `backend/src/migrations/012_care_agent.sql` against the production
   database.
2. Set `ANTHROPIC_API_KEY` in Vercel to enable the Claude agent. Optionally
   set `ANTHROPIC_MODEL`. Leave `ANTHROPIC_TEMPERATURE` unset.

## Known issues
- A signed-out visitor's typed question is lost after logging in, because
  `login.html` redirects by role and not back to `care-agent.html`. This
  behaviour comes from the branch.
- The branch `claude/inspiring-bardeen-b97kat` must not be merged as-is. Its
  `code-backups/` version numbers (v1.12.0 to v1.16.0) collide with `main`'s.
