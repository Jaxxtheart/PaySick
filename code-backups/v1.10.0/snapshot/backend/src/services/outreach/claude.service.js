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

const { normalizeSignoff } = require('./signoff');
const { stripEmDashes } = require('./style');
const { ensureRegistrationCta } = require('./cta');
const { OUTREACH_CONFIG, registrationUrl } = require('../../config/outreach.config');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Verified against https://docs.claude.com/en/docs/about-claude/models - the
// current Sonnet-class model string. Overridable via ANTHROPIC_MODEL.
const DEFAULT_MODEL = 'claude-sonnet-5';

const SYSTEM_PROMPT = `You are the outreach copywriter for PaySick, a South African healthcare PAYMENT
FACILITATION platform. PaySick is NOT a lender or credit provider. Providers are
paid IN FULL, UPFRONT (within 24 hours). Patients pay in affordable monthly
instalments. PaySick carries the entire patient payment relationship.

HARD RULES, never violate:
- ZERO credit/lending language. Never use, in any form: credit, loan, lend,
  borrow, borrower, interest, APR, debt, default, repayment, financing. Do not
  describe PaySick as offering finance, a line of credit, or a loan. PaySick is a
  payment facilitator: patients pay in affordable monthly instalments; the
  provider is paid in full, upfront.
- NEVER use an em dash or an en dash, in the subject line or the body or the
  LinkedIn variant. Use a comma, a full stop, or a colon instead. Ordinary
  hyphens inside words are fine.
- Sign off EVERY message exactly as "Best, The PaySick Team". Never sign with a
  personal name. Do not use any other closing.
- Frame value to the PROVIDER, in this priority order:
  1. You are paid in full within 24 hours, no waiting, no chasing, no bad debts.
  2. More patients say yes. Patients who would walk out over a lump sum price proceed.
  3. Zero admin, zero risk to your practice, no collections, no exposure.
- ONE primary call to action: register the practice as a PaySick provider at the
  registration_url given in the user message. Include that link verbatim. A 15
  minute demo is SECONDARY: mention it only after the registration link, as an
  option, never as the main ask. Anything they need first goes to
  ${OUTREACH_CONFIG.contactEmail}, which you must include.
- Short (110 to 150 words for email), specific to the named practice and its
  vertical, warm and direct, no hype, no emojis, no jargon.
- Aesthetics/fertility angle: lead with revenue lost when patients defer or decline
  high-ticket elective procedures purely on price.
- Dental angle: lead with the treatment plans that stall on price. Implants,
  crowns, orthodontics and full-mouth work get postponed indefinitely by patients
  who would say yes to an affordable monthly amount, and every one of those is a
  chair slot lost this month.
- Ophthalmology angle: lead with volume. Every price-sensitive patient who
  postpones a planned procedure is a booking lost this month.

North-star one-liner (tone reference, do not quote verbatim every time):
"You get paid in full within 24 hours. Your patients heal now and pay in affordable
monthly instalments. We handle everything in between, with no collections and no
risk to your practice."

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
    // House style is enforced in code, never left to the model: no em dashes
    // anywhere, and the canonical sign-off on every message.
    subject: stripEmDashes(String(parsed.subject || '').trim()),
    email_body: normalizeSignoff(stripEmDashes(String(parsed.email_body || '').trim())),
    linkedin_dm: normalizeSignoff(stripEmDashes(String(parsed.linkedin_dm || '').trim())),
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
    `registration_url: ${registrationUrl()}`,
    `contact_email: ${OUTREACH_CONFIG.contactEmail}`,
    '',
    'Write the initial outreach email and a shorter LinkedIn DM variant for this practice.',
    'Both must ask them to register as a PaySick provider at registration_url, offer',
    'the 15 minute demo only as a secondary option, and give contact_email for anything',
    'they need first. No em dashes.',
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

  const draft = parseDraftJson(raw);
  // The ask is enforced in code: a draft that came back without the registration
  // link gets it appended above the sign-off, on both channels.
  return {
    subject: draft.subject,
    email_body: normalizeSignoff(ensureRegistrationCta(draft.email_body)),
    linkedin_dm: normalizeSignoff(ensureRegistrationCta(draft.linkedin_dm, { short: true })),
  };
}

// ─── Agentic onboarding reply (§5) ───────────────────────────────────────────

const ONBOARDING_SYSTEM_PROMPT = `You are the onboarding concierge for PaySick, a South African healthcare PAYMENT
FACILITATION platform. PaySick is NOT a lender or credit provider. A provider has
just REPLIED to our outreach. Write a warm, concise reply that moves them toward
registering as a PaySick provider.

HARD RULES, never violate:
- ZERO credit/lending language. Never use, in any form: credit, loan, lend,
  borrow, borrower, interest, APR, debt, default, repayment, financing.
- NEVER use an em dash or an en dash, in the subject line or the body. Use a
  comma, a full stop, or a colon instead.
- Reaffirm the value briefly: they are paid in full within 24 hours; their
  patients pay in affordable monthly instalments; PaySick carries everything in
  between, with no collections and no risk to the practice.
- Thank them for replying, answer the spirit of their message, and give ONE clear
  next step: register the practice as a provider at the registration link
  provided, included exactly as given. A 15 minute demo is SECONDARY, offered
  only after that link. Anything they need first goes to
  ${OUTREACH_CONFIG.contactEmail}, which you must include.
- Warm, human, and brief (90 to 130 words). No hype, no emojis, no jargon.
- Sign off EXACTLY as "Best, The PaySick Team". Never sign with a personal name.

Return JSON only: {"subject": "...", "email_body": "..."}. No preamble, no markdown fences.`;

/**
 * Draft an onboarding-prompting reply to a provider who replied to outreach.
 * Human-gated: the caller queues this as a draft; it is never auto-sent.
 * @param {object} lead        outreach_providers row
 * @param {string} replyText   the provider's inbound reply text
 * @param {object} [opts]
 * @param {string} [opts.onboardingUrl]  full onboarding link to include
 * @param {function} [opts.fetchImpl]
 * @returns {Promise<{subject:string, email_body:string}>}
 */
async function generateOnboardingReply(lead, replyText, opts = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('global fetch is unavailable (Node >=18 required)');

  const onboardingUrl = opts.onboardingUrl || registrationUrl();
  const userMessage = [
    `practice_name: ${lead.practice_name}`,
    `vertical: ${lead.vertical}`,
    `metro: ${lead.metro || 'unknown'}`,
    `registration_url: ${onboardingUrl}`,
    `contact_email: ${OUTREACH_CONFIG.contactEmail}`,
    '',
    'The provider replied with:',
    '"""',
    String(replyText || '(no message body)').slice(0, 2000),
    '"""',
    '',
    'Write the reply. Ask them to register as a PaySick provider at registration_url,',
    'included exactly as given, offer the 15 minute demo only as a secondary option,',
    'and give contact_email for anything they need first. No em dashes.',
  ].join('\n');

  const body = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 1024,
    system: ONBOARDING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (process.env.ANTHROPIC_TEMPERATURE) {
    const t = Number(process.env.ANTHROPIC_TEMPERATURE);
    if (!Number.isNaN(t)) body.temperature = t;
  }

  const res = await fetchImpl(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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

  const parsed = parseDraftJson(raw); // fence-stripping + em dash strip + signoff
  // Guarantee the registration ask is present (deterministic, not left to the LLM).
  const emailBody = normalizeSignoff(
    ensureRegistrationCta(parsed.email_body, { url: onboardingUrl })
  );
  return {
    subject: parsed.subject || 'Great to hear from you, next steps with PaySick',
    email_body: emailBody,
  };
}

module.exports = {
  generateDraft,
  generateOnboardingReply,
  parseDraftJson,
  SYSTEM_PROMPT,
  ONBOARDING_SYSTEM_PROMPT,
  DEFAULT_MODEL,
};
