'use strict';

/**
 * CLAUDE DRAFTING CALL (§6.1)
 *
 * Generates a compliant, personalised outreach email + LinkedIn variant for a
 * target practice via the Anthropic Messages API. Uses the platform's native
 * `fetch` (Node >=18) so no new npm dependency is introduced.
 *
 * The system prompt is the compliance brain. The terminology linter (§6.3) still
 * runs on every returned draft downstream — the LLM is never trusted to be the
 * sole guardrail.
 *
 * Env:
 *   ANTHROPIC_API_KEY   (required to call the API)
 *   ANTHROPIC_MODEL     (defaults to a current Sonnet-class model for cost/latency)
 *   ANTHROPIC_TEMPERATURE (optional; omitted by default — current Sonnet/Opus
 *                          models reject a non-default temperature. Only set this
 *                          when ANTHROPIC_MODEL points at a model that accepts it.)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Verified against https://docs.claude.com/en/docs/about-claude/models — the
// current Sonnet-class model string. Overridable via ANTHROPIC_MODEL.
const DEFAULT_MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are the outreach copywriter for PaySick, a South African healthcare PAYMENT
FACILITATION platform. PaySick is NOT a lender or credit provider. Providers are
paid IN FULL, UPFRONT (within 24 hours). Patients pay in affordable monthly
instalments. PaySick carries the entire patient payment relationship.

HARD RULES — never violate:
- Never use: credit, loan, lend, borrow, borrower, interest, APR, debt, default,
  repayment, financing (as a verb applied to the patient).
- Frame value to the PROVIDER, in this priority order:
  1. You are paid in full within 24 hours — no waiting, no chasing, no bad debt.
  2. More patients say yes — patients who'd walk out over a lump-sum price proceed.
  3. Zero admin, zero risk to your practice — no collections, no exposure.
- One clear call to action: a 15-minute demo.
- Short (110–150 words for email), specific to the named practice and its vertical,
  warm and direct, no hype, no emojis, no jargon.
- Aesthetics/fertility angle: lead with revenue lost when patients defer or decline
  high-ticket elective procedures purely on price.
- Dental/ophthalmology angle: lead with volume — every price-sensitive patient who
  postpones a planned procedure is a booking lost this month.

North-star one-liner (tone reference, don't quote verbatim every time):
"You get paid in full within 24 hours. Your patients heal now and pay in affordable
monthly instalments. We handle everything in between — no collections, no risk to
your practice."

Return JSON only: {"subject": "...", "email_body": "...", "linkedin_dm": "..."}.
No preamble, no markdown fences.`;

/**
 * Strip stray markdown fences and parse JSON defensively.
 * @param {string} raw
 * @returns {{subject:string, email_body:string, linkedin_dm:string}}
 */
function parseDraftJson(raw) {
  let text = String(raw || '').trim();
  // Remove ```json ... ``` or ``` ... ``` fences if the model added them.
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // If there's leading/trailing prose, extract the outermost JSON object.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
  }
  const parsed = JSON.parse(text);
  return {
    subject: String(parsed.subject || '').trim(),
    email_body: String(parsed.email_body || '').trim(),
    linkedin_dm: String(parsed.linkedin_dm || '').trim(),
  };
}

/**
 * Build the practice-specific user message.
 * @param {object} lead outreach_providers row
 * @param {string} [selectionNote] why the lead was selected
 */
function buildUserMessage(lead, selectionNote) {
  const note =
    selectionNote ||
    `High-ticket elective ${lead.vertical} practice; established (rating ${lead.rating ?? 'n/a'} from ${lead.ratings_count ?? 'n/a'} reviews).`;
  return [
    `practice_name: ${lead.practice_name}`,
    `vertical: ${lead.vertical}`,
    `metro: ${lead.metro || 'unknown'}`,
    `why_selected: ${note}`,
    '',
    'Write the initial outreach email and a shorter LinkedIn DM variant for this practice.',
  ].join('\n');
}

/**
 * Generate an outreach draft for a lead.
 * @param {object} lead                 outreach_providers row
 * @param {object} [opts]
 * @param {string} [opts.selectionNote] optional reason-for-selection context
 * @param {function} [opts.fetchImpl]   injectable fetch (for tests)
 * @returns {Promise<{subject, email_body, linkedin_dm}>}
 */
async function generateDraft(lead, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable (Node >=18 required)');
  }

  const body = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(lead, opts.selectionNote) }],
  };

  // Temperature is opt-in: current Sonnet/Opus models reject a non-default value.
  if (process.env.ANTHROPIC_TEMPERATURE) {
    const t = Number(process.env.ANTHROPIC_TEMPERATURE);
    if (!Number.isNaN(t)) body.temperature = t;
  }

  const res = await fetchImpl(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    : '';
  return parseDraftJson(raw);
}

module.exports = { generateDraft, parseDraftJson, SYSTEM_PROMPT, DEFAULT_MODEL };
