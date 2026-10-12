'use strict';

/**
 * CARE AGENT — SHARED ANTHROPIC MESSAGES CLIENT
 *
 * The low-level "call the Anthropic API" primitive shared by every Care
 * Agent surface that talks to a real model: the conversational
 * tool-calling agent (care-agent-llm.service.js) and document ingestion
 * (care-agent-document.service.js). Extracted here so neither duplicates
 * the fetch/signing/error-handling boilerplate -- the same reasoning that
 * keeps outreach/claude.service.js's own, separately-evolved client as a
 * single file for that unrelated feature.
 *
 * Uses the platform's native `fetch` (Node >=18) via an injectable
 * `fetchImpl`, exactly like outreach/claude.service.js and
 * care-agent-llm.service.js already do -- no new npm dependency. This
 * sandbox has no outbound internet access, so the live API cannot be
 * exercised here; see tests/unit/care-agent-anthropic-client.test.js for
 * full coverage via an injected fetchImpl instead.
 *
 * Env:
 *   ANTHROPIC_API_KEY   (required -- callers decide their own fallback
 *                        when this is unset)
 *   ANTHROPIC_MODEL     (defaults to a current Sonnet-class model)
 *   ANTHROPIC_TEMPERATURE (optional, same caveat as claude.service.js)
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

/**
 * Calls the Anthropic Messages API once and returns the parsed response
 * body. Tool use (tools / tool_choice) is optional -- a plain
 * conversational call omits both; a forced single-tool extraction call
 * (see care-agent-document.service.js) passes both.
 *
 * @param {object} params
 * @param {string} params.system
 * @param {Array<object>} params.messages
 * @param {Array<object>} [params.tools]
 * @param {object} [params.tool_choice]
 * @param {number} [params.maxTokens] defaults to 1024
 * @param {function} [params.fetchImpl] injectable fetch (for tests)
 * @returns {Promise<object>} the parsed Anthropic API response body
 */
async function callAnthropicMessages({ system, messages, tools, tool_choice, maxTokens, fetchImpl }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('global fetch is unavailable (Node >=18 required)');
  }

  const body = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: maxTokens || 1024,
    system,
    messages,
  };
  if (tools) body.tools = tools;
  if (tool_choice) body.tool_choice = tool_choice;
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

module.exports = {
  ANTHROPIC_API_URL,
  DEFAULT_MODEL,
  callAnthropicMessages,
};
