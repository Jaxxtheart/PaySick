/**
 * CARE AGENT — SHARED ANTHROPIC CLIENT (test-first)
 *
 * Written BEFORE the implementation, per CLAUDE.md's test-first workflow.
 *
 * Extracted from care-agent-llm.service.js's private callAnthropicMessages
 * so the new document-ingestion service (care-agent-document.service.js)
 * doesn't duplicate the fetch/signing/error-handling boilerplate a second
 * time. Both callers share this one low-level primitive; care-agent-llm's
 * own orchestration loop behaviour is unchanged (see
 * tests/unit/care-agent-llm.test.js, which must keep passing unmodified
 * after this extraction).
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const {
  callAnthropicMessages,
  ANTHROPIC_API_URL,
  DEFAULT_MODEL,
} = require('../../backend/src/services/care-agent-anthropic-client');

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('callAnthropicMessages', () => {
  test('throws when ANTHROPIC_API_KEY is not set', async () => {
    const prevKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await assert.rejects(
        () => callAnthropicMessages({ system: 'sys', messages: [], fetchImpl: async () => jsonResponse({}) }),
        /ANTHROPIC_API_KEY/
      );
    } finally {
      if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    }
  });

  test('sends model, system, and messages, signed with the API key header', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = { url, opts, body: JSON.parse(opts.body) };
      return jsonResponse({ stop_reason: 'end_turn', content: [] });
    };
    await callAnthropicMessages({ system: 'You are helpful', messages: [{ role: 'user', content: 'hi' }], fetchImpl });
    assert.equal(captured.url, ANTHROPIC_API_URL);
    assert.equal(captured.opts.headers['x-api-key'], 'test-key');
    assert.equal(captured.opts.headers['anthropic-version'], '2023-06-01');
    assert.equal(captured.body.model, DEFAULT_MODEL);
    assert.equal(captured.body.system, 'You are helpful');
    assert.deepEqual(captured.body.messages, [{ role: 'user', content: 'hi' }]);
  });

  test('omits tools and tool_choice when neither is provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return jsonResponse({ stop_reason: 'end_turn', content: [] });
    };
    await callAnthropicMessages({ system: 'sys', messages: [], fetchImpl });
    assert.equal('tools' in captured, false);
    assert.equal('tool_choice' in captured, false);
  });

  test('passes tools and a forced tool_choice through when provided', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return jsonResponse({ stop_reason: 'tool_use', content: [] });
    };
    const tools = [{ name: 'do_thing', description: 'x', input_schema: { type: 'object', properties: {} } }];
    await callAnthropicMessages({
      system: 'sys',
      messages: [],
      tools,
      tool_choice: { type: 'tool', name: 'do_thing' },
      fetchImpl,
    });
    assert.deepEqual(captured.tools, tools);
    assert.deepEqual(captured.tool_choice, { type: 'tool', name: 'do_thing' });
  });

  test('respects a custom maxTokens, defaulting to 16000', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return jsonResponse({ stop_reason: 'end_turn', content: [] });
    };
    await callAnthropicMessages({ system: 'sys', messages: [], fetchImpl });
    assert.equal(captured.max_tokens, 16000);
    await callAnthropicMessages({ system: 'sys', messages: [], fetchImpl, maxTokens: 256 });
    assert.equal(captured.max_tokens, 256);
  });

  test('throws a descriptive error on a non-ok response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = async () => jsonResponse({ error: 'overloaded' }, false, 529);
    await assert.rejects(
      () => callAnthropicMessages({ system: 'sys', messages: [], fetchImpl }),
      /Anthropic API error 529/
    );
  });

  test('returns the parsed response body on success', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = async () => jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] });
    const data = await callAnthropicMessages({ system: 'sys', messages: [], fetchImpl });
    assert.equal(data.stop_reason, 'end_turn');
    assert.equal(data.content[0].text, 'hi');
  });
});

describe('model defaults (v1.12.3 port review)', () => {
  test('defaults to the current Claude model, claude-opus-5-5', () => {
    assert.equal(DEFAULT_MODEL, 'claude-opus-5-5');
  });

  test('defaults max_tokens high enough that always-on thinking does not starve the reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ content: [] }) };
    };
    await callAnthropicMessages({ system: 's', messages: [{ role: 'user', content: 'hi' }], fetchImpl });
    assert.ok(captured.max_tokens >= 16000, `max_tokens ${captured.max_tokens} is too low`);
  });
});
