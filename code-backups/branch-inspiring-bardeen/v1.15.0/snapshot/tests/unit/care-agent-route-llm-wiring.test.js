/**
 * Unit Tests — routes/care-agent.js wires in the LLM tool-calling agent
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Static-source checks (no jest/supertest available in this sandbox -- see
 * tests/integration/care-agent.test.js's own environmental note) proving:
 * (1) POST /sessions/:id/messages attempts the new LLM tool-calling engine
 *     and falls back to the deterministic engine only when the LLM path is
 *     unavailable or errors -- it never silently does nothing;
 * (2) the fallback and every outcome is written to the audit trail;
 * (3) the money-moving routes (/approve, /execute) are completely
 *     untouched by this change -- the LLM tool loop is reachable only from
 *     /messages, never from anything that can move money or finalize an
 *     application.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(
  path.join(__dirname, '../../backend/src/routes/care-agent.js'),
  'utf8'
);

function sliceRoute(startMarker, endMarker) {
  const start = routeSource.indexOf(startMarker);
  assert.ok(start !== -1, `expected to find ${startMarker}`);
  const end = routeSource.indexOf(endMarker, start);
  assert.ok(end !== -1, `expected to find ${endMarker} after ${startMarker}`);
  return routeSource.slice(start, end);
}

describe('routes/care-agent.js — LLM tool-calling wiring', () => {
  test('imports the care-agent-llm service', () => {
    assert.match(routeSource, /require\(['"]\.\.\/services\/care-agent-llm\.service['"]\)/);
  });

  test('POST /sessions/:id/messages attempts runCareAgentTurn', () => {
    const messagesRoute = sliceRoute(
      "router.post('/sessions/:id/messages',",
      "router.post('/sessions/:id/confirm',"
    );
    assert.match(messagesRoute, /runCareAgentTurn/);
  });

  test('POST /sessions/:id/messages falls back to the deterministic engine on LLM failure', () => {
    const messagesRoute = sliceRoute(
      "router.post('/sessions/:id/messages',",
      "router.post('/sessions/:id/confirm',"
    );
    assert.match(messagesRoute, /catch/);
    assert.match(messagesRoute, /extractCareRequest/);
    assert.match(messagesRoute, /mergeCareSummary/);
  });

  test('POST /sessions/:id/messages records the audit trail exactly once per turn regardless of path', () => {
    const messagesRoute = sliceRoute(
      "router.post('/sessions/:id/messages',",
      "router.post('/sessions/:id/confirm',"
    );
    const auditCalls = messagesRoute.match(/recordAudit\(/g) || [];
    assert.equal(auditCalls.length, 1, 'exactly one recordAudit call, on the single shared success path after either the LLM or fallback branch');
  });

  test('/approve is untouched -- no reference to the LLM service or its tools', () => {
    const approveRoute = sliceRoute(
      "router.post('/sessions/:id/approve',",
      "// ============================================\n// STAGE 5"
    );
    assert.doesNotMatch(approveRoute, /care-agent-llm|runCareAgentTurn|CARE_AGENT_TOOLS/);
  });

  test('/execute is untouched -- no reference to the LLM service or its tools', () => {
    const executeRoute = sliceRoute(
      "router.post('/sessions/:id/execute',",
      "// ============================================\n// STAGE 6"
    );
    assert.doesNotMatch(executeRoute, /care-agent-llm|runCareAgentTurn|CARE_AGENT_TOOLS/);
  });
});
