'use strict';

/**
 * CARE AGENT — LLM TOOL-CALLING AGENT
 *
 * Per explicit user direction ("No I want the LLM. AGENTIC OPTION. This
 * then makes PaySick 2.0 a harness for healthcare payments"): this is the
 * Care Agent's primary reasoning engine. Unlike the deterministic
 * regex/trigram engine it supersedes (care-agent-nlp.service.js, still
 * used as a resilience fallback -- see routes/care-agent.js), the model
 * here reasons about the conversation freely and DECIDES which of
 * PaySick's own deterministic functions to call and when, via the
 * Anthropic Messages API's tool use. PaySick is the harness: it defines
 * the only tools that exist, executes them, and independently validates
 * every input before trusting it -- the model is never the sole guardrail
 * on a number or a category.
 *
 * Architecture principle: "AI reasons, PaySick controls" --
 *   - The model may call update_care_summary (record what the patient
 *     said), get_shortfall, and build_term_options. Every one of these is
 *     a thin, validated wrapper around an existing pure function from
 *     care-agent.service.js (computeShortfallCents, buildTermOptions,
 *     mergeCareSummary) -- the model triggers the arithmetic, it never
 *     performs it. get_shortfall/build_term_options read the CURRENT
 *     server-side summary state, never the tool call's own input, so the
 *     model cannot assert a shortfall or a payment figure that doesn't
 *     match what was actually recorded.
 *   - update_care_summary independently re-validates every field
 *     (non-negative integer amounts; procedureTypeGuess restricted to the
 *     fixed PROCEDURE_CATEGORIES ids) rather than trusting the tool call's
 *     input blindly -- the same "the LLM is never trusted to be the sole
 *     guardrail" pattern outreach/claude.service.js's terminology linter
 *     already uses in this codebase, applied here to tool inputs instead
 *     of free-text output.
 *   - No tool exists (and none should ever be added) for anything that
 *     moves money or finalizes an application. /confirm, /approve, and
 *     /execute in routes/care-agent.js remain separate, deterministic,
 *     explicit-human-consent-gated HTTP routes this file never touches or
 *     calls into. The tool loop below is reachable only from
 *     POST /sessions/:id/messages.
 *
 * Uses the platform's native `fetch` (Node >=18) via an injectable
 * `fetchImpl`, mirroring outreach/claude.service.js's existing pattern --
 * no new npm dependency. This sandbox has no outbound internet access, so
 * the live API cannot be exercised here; see
 * tests/unit/care-agent-llm.test.js, which covers the full orchestration
 * loop and every guardrail with an injected fetchImpl instead.
 *
 * Env:
 *   ANTHROPIC_API_KEY   (required -- routes/care-agent.js falls back to
 *                        the deterministic engine when this is unset)
 *   ANTHROPIC_MODEL     (defaults to a current Sonnet-class model)
 *   ANTHROPIC_TEMPERATURE (optional, same caveat as claude.service.js)
 */

const {
  mergeCareSummary,
  missingFieldsFor,
  computeShortfallCents,
  buildTermOptions,
} = require('./care-agent.service');
const { PROCEDURE_CATEGORIES } = require('./care-agent-nlp.service');
const { toCents } = require('../utils/money');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

// Hard cap on tool-call round trips within a single patient message. Bounds
// latency/cost and guarantees the loop can never run forever even if the
// model kept calling tools indefinitely.
const MAX_TOOL_ITERATIONS = 6;

const MAX_TREATMENT_DESCRIPTION_LENGTH = 200;
const MAX_PROVIDER_NAME_LENGTH = 120;

const FALLBACK_ITERATION_CAP_REPLY =
  "Let's slow down for a second -- could you tell me, in your own words, what's still missing?";

// The only fields the model may ever set. Everything else in
// structured_summary (e.g. a leftover procedureTypeSimilarity from the
// deterministic fallback engine, on a session that used it on an earlier
// turn) is deliberately excluded from what the model is shown, so its
// view of "what's known" always matches what it can itself act on.
const KNOWN_SUMMARY_FIELDS = [
  'quotedAmountCents',
  'schemeContributionCents',
  'procedureTypeGuess',
  'treatmentDescription',
  'providerName',
];

const CARE_AGENT_TOOLS = [
  {
    name: 'update_care_summary',
    description:
      "Record structured fields the patient has stated in their most recent message. Call this whenever they tell you the quoted amount, what the treatment is, what their medical aid/scheme said it will cover, or the provider's name. Only include fields you are confident about from what they actually said -- never guess or invent a value. Pass 0 for schemeContributionCents if they said it is not covered at all (0 is a valid, known answer, different from not knowing yet). A field you already recorded on an earlier turn cannot be overwritten by this call, so there is no harm in calling it again with the same value.",
    input_schema: {
      type: 'object',
      properties: {
        quotedAmountCents: {
          type: 'integer',
          minimum: 0,
          description: 'The quoted/total treatment cost the patient stated, in cents.',
        },
        schemeContributionCents: {
          type: 'integer',
          minimum: 0,
          description: "How much the patient's medical aid/scheme said it will cover, in cents. Use 0 if they said it is not covered at all.",
        },
        procedureTypeGuess: {
          type: 'string',
          enum: PROCEDURE_CATEGORIES.map((c) => c.id),
          description: "The matching category id, only if the patient's description clearly fits one of the recognized categories. Leave it out if none clearly fits -- record treatmentDescription in their own words instead.",
        },
        treatmentDescription: {
          type: 'string',
          description: "A short description of the treatment, in the patient's own words.",
        },
        providerName: {
          type: 'string',
          description: 'The name of the clinic/provider, if the patient mentioned one.',
        },
      },
    },
  },
  {
    name: 'get_shortfall',
    description:
      'Compute the Rand shortfall the patient needs financed. Reads the currently recorded quotedAmountCents and schemeContributionCents server-side -- call update_care_summary first if either is not yet known. Takes no input.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'build_term_options',
    description:
      'Build the zero-interest 3/6/12-month payment-plan options for the currently known shortfall. Optionally pass monthlyIncomeRands if the patient has shared their income, so an option that would create monthly pressure can be flagged.',
    input_schema: {
      type: 'object',
      properties: {
        monthlyIncomeRands: {
          type: 'number',
          minimum: 0,
          description: "The patient's stated gross monthly income in Rands, if known.",
        },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the PaySick Care Agent, a warm and direct conversational guide helping a
patient work out how to afford a medical treatment. PaySick is a South African
healthcare PAYMENT FACILITATION platform, not a lender or credit provider:
providers are paid in full upfront, and patients pay zero-interest monthly
instalments. You are the reasoning layer; PaySick's own deterministic systems
hold every number and make every real decision. This is the operating contract:

HARD RULES, never violate:
- Never state a Rand amount, a shortfall, a monthly payment figure, or any
  arithmetic result yourself. Only ever report a number that came back from
  calling get_shortfall or build_term_options. Do not add, subtract, or guess.
- Whenever the patient tells you something concrete (a quoted amount, what the
  treatment is, what their scheme covers, a provider name), call
  update_care_summary to record it, before or alongside your reply. Never let
  a fact live only in your prose.
- Never invent a procedure category. Only set procedureTypeGuess when the
  patient's own description clearly matches one of the categories listed
  below; otherwise leave it unset and just record treatmentDescription in
  their own words. Not knowing which category fits is fine.
- Ask about one missing thing at a time, warmly and plainly. Default priority
  when nothing else is offered: the quoted amount, then what the treatment
  is, then whether it has been submitted to their medical aid/scheme. Follow
  the patient's lead if they volunteer things out of order.
- Once the quoted amount, the treatment, and the scheme contribution are all
  known, call get_shortfall, then build_term_options, and summarize the
  options plainly using only the numbers those tools returned. Tell the
  patient to review and confirm on the summary card. Never say anything has
  been approved, submitted, executed, or scheduled -- only a separate,
  explicit human confirmation step outside this conversation can do that.
- Zero credit/lending language toward the patient: never use credit, loan,
  lend, borrow, interest, APR, debt, or default. This is a payment plan, not
  a loan.
- Warm, plain, concise, normally one to three sentences. No hype, no emojis,
  no markdown, no em dashes.`;

/**
 * Builds the per-turn system prompt: the fixed hard rules, the current
 * finite category list, and the patient's already-known/still-missing
 * fields, so the model never has to ask again for what it already
 * recorded and never has to guess at valid category ids.
 *
 * @param {object} summary current structured_summary for the session
 * @returns {string}
 */
function buildSystemPrompt(summary) {
  const safeSummary = summary || {};
  const known = {};
  for (const field of KNOWN_SUMMARY_FIELDS) {
    if (field in safeSummary) known[field] = safeSummary[field];
  }
  const missing = missingFieldsFor(safeSummary);
  const categoryList = PROCEDURE_CATEGORIES.map((c) => `${c.id}: ${c.label}`).join('\n');

  return `${SYSTEM_PROMPT}

Recognized procedure categories (id: label) -- the only valid values for
update_care_summary's procedureTypeGuess:
${categoryList}

Already recorded for this conversation (do not ask for these again): ${
    Object.keys(known).length ? JSON.stringify(known) : '(nothing recorded yet)'
  }
Still missing: ${missing.length ? missing.join(', ') : '(nothing -- everything required is known)'}`;
}

function sanitizeAmountCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 0) return undefined;
  return rounded;
}

/**
 * Executes a single tool call against PaySick's own deterministic state.
 * Never throws on bad model input -- always returns a result the model can
 * read and recover from, with `ok: false` and a rejected/error explanation
 * when the input didn't validate. This is the harness's own validation
 * layer: the model's tool-call input is never trusted directly.
 *
 * @param {string} name
 * @param {object} input
 * @param {{ summary: object }} context current session's structured_summary
 * @returns {{ ok: boolean, result: object, summaryPatch?: object }}
 */
function executeTool(name, input, context) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const summary = (context && context.summary) || {};

  switch (name) {
    case 'update_care_summary': {
      const patch = {};
      const rejected = [];

      if ('quotedAmountCents' in safeInput) {
        const cents = sanitizeAmountCents(safeInput.quotedAmountCents);
        if (cents === undefined) rejected.push('quotedAmountCents (must be a non-negative amount)');
        else patch.quotedAmountCents = cents;
      }
      if ('schemeContributionCents' in safeInput) {
        const cents = sanitizeAmountCents(safeInput.schemeContributionCents);
        if (cents === undefined) rejected.push('schemeContributionCents (must be a non-negative amount)');
        else patch.schemeContributionCents = cents;
      }
      if ('procedureTypeGuess' in safeInput) {
        const category = PROCEDURE_CATEGORIES.find((c) => c.id === safeInput.procedureTypeGuess);
        if (!category) {
          rejected.push('procedureTypeGuess (must be one of the recognized category ids)');
        } else {
          patch.procedureTypeGuess = category.id;
          // Mirrors the deterministic engine's behaviour: a category alone
          // still satisfies the treatmentDescription requirement.
          if (!('treatmentDescription' in safeInput) && !summary.treatmentDescription) {
            patch.treatmentDescription = category.label;
          }
        }
      }
      if ('treatmentDescription' in safeInput) {
        const trimmed = String(safeInput.treatmentDescription || '').trim();
        if (!trimmed) {
          rejected.push('treatmentDescription (empty)');
        } else {
          patch.treatmentDescription =
            trimmed.length > MAX_TREATMENT_DESCRIPTION_LENGTH
              ? `${trimmed.slice(0, MAX_TREATMENT_DESCRIPTION_LENGTH).trim()}...`
              : trimmed;
        }
      }
      if ('providerName' in safeInput) {
        const trimmed = String(safeInput.providerName || '').trim();
        if (trimmed) patch.providerName = trimmed.slice(0, MAX_PROVIDER_NAME_LENGTH);
      }

      const mergedSummary = mergeCareSummary(summary, patch);
      return {
        ok: rejected.length === 0,
        summaryPatch: patch,
        result: {
          recorded: Object.keys(patch),
          rejected,
          currentSummary: mergedSummary,
          missingFields: missingFieldsFor(mergedSummary),
        },
      };
    }

    case 'get_shortfall': {
      const shortfallCents = computeShortfallCents(summary);
      if (shortfallCents === null) {
        return {
          ok: false,
          result: {
            error:
              'quotedAmountCents and schemeContributionCents must both be known first -- call update_care_summary.',
          },
        };
      }
      return { ok: true, result: { shortfallCents } };
    }

    case 'build_term_options': {
      const shortfallCents = computeShortfallCents(summary);
      if (shortfallCents === null) {
        return {
          ok: false,
          result: {
            error:
              'quotedAmountCents and schemeContributionCents must both be known first -- call update_care_summary.',
          },
        };
      }
      let monthlyIncomeCents;
      if (safeInput.monthlyIncomeRands != null) {
        const rands = Number(safeInput.monthlyIncomeRands);
        if (Number.isFinite(rands) && rands >= 0) monthlyIncomeCents = toCents(rands);
      }
      const options = buildTermOptions({ shortfallCents, monthlyIncomeCents });
      return { ok: true, result: { shortfallCents, options } };
    }

    default:
      return { ok: false, result: { error: `Unknown tool: ${name}` } };
  }
}

async function callAnthropicMessages({ system, tools, messages, fetchImpl }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('global fetch is unavailable (Node >=18 required)');
  }

  const body = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 1024,
    system,
    tools,
    messages,
  };
  if (process.env.ANTHROPIC_TEMPERATURE) {
    const t = Number(process.env.ANTHROPIC_TEMPERATURE);
    if (!Number.isNaN(t)) body.temperature = t;
  }

  const res = await doFetch(ANTHROPIC_API_URL, {
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

  return res.json();
}

/**
 * Runs one full patient-message turn: calls the Anthropic API, executes
 * any tool calls the model makes against PaySick's own deterministic
 * functions, feeds the results back, and repeats until the model produces
 * a final text reply (or MAX_TOOL_ITERATIONS is hit). This is the "PaySick
 * is the harness" loop: the model decides what to call and when; this
 * function is the only thing that actually calls it.
 *
 * @param {object} params
 * @param {object} params.summary current structured_summary for the session
 * @param {Array<{role: 'user'|'assistant', content: string}>} params.history prior turns
 * @param {string} params.userMessage the patient's new message
 * @param {function} [params.fetchImpl] injectable fetch (for tests)
 * @returns {Promise<{ reply: string, summary: object, toolCalls: object[], hitIterationCap: boolean }>}
 */
async function runCareAgentTurn({ summary, history, userMessage, fetchImpl }) {
  let workingSummary = { ...(summary || {}) };
  const messages = [...(history || []), { role: 'user', content: userMessage }];
  const toolCalls = [];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const data = await callAnthropicMessages({
      system: buildSystemPrompt(workingSummary),
      tools: CARE_AGENT_TOOLS,
      messages,
      fetchImpl,
    });

    const content = Array.isArray(data.content) ? data.content : [];
    const toolUseBlocks = content.filter((block) => block.type === 'tool_use');

    if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      const text = content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
      return {
        reply: text,
        summary: workingSummary,
        toolCalls,
        hitIterationCap: false,
      };
    }

    messages.push({ role: 'assistant', content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      const outcome = executeTool(block.name, block.input, { summary: workingSummary });
      if (outcome.summaryPatch) {
        workingSummary = mergeCareSummary(workingSummary, outcome.summaryPatch);
      }
      toolCalls.push({ name: block.name, input: block.input, result: outcome.result, ok: outcome.ok });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(outcome.result),
        ...(outcome.ok ? {} : { is_error: true }),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    reply: FALLBACK_ITERATION_CAP_REPLY,
    summary: workingSummary,
    toolCalls,
    hitIterationCap: true,
  };
}

module.exports = {
  CARE_AGENT_TOOLS,
  SYSTEM_PROMPT,
  buildSystemPrompt,
  executeTool,
  runCareAgentTurn,
  DEFAULT_MODEL,
};
