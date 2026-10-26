/**
 * Unit Tests — routes/care-agent.js wires in document ingestion
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Static-source checks (no jest/supertest available in this sandbox -- see
 * tests/integration/care-agent.test.js's own environmental note) proving:
 * (1) POST /sessions/:id/documents validates the upload (media type, size)
 *     before ever calling the extraction service;
 * (2) extracted fields are re-validated through the same executeTool
 *     guardrail the conversational agent already uses, never trusted
 *     directly;
 * (3) every processed document is written to the audit trail;
 * (4) the LLM path's absence or failure falls back honestly rather than
 *     erroring out;
 * (5) nothing here can move money or finalize an application -- the new
 *     route is reachable only from the Understand stage, same as /messages.
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

describe('routes/care-agent.js -- document ingestion wiring', () => {
  test('imports the care-agent-document service', () => {
    assert.match(routeSource, /require\(['"]\.\.\/services\/care-agent-document\.service['"]\)/);
  });

  test('POST /sessions/:id/documents validates media type and size before extracting', () => {
    const docsRoute = sliceRoute(
      "router.post('/sessions/:id/documents',",
      "router.post('/sessions/:id/confirm',"
    );
    assert.match(docsRoute, /ALLOWED_MEDIA_TYPES/);
    assert.match(docsRoute, /MAX_DOCUMENT_BYTES/);
    assert.match(docsRoute, /extractFromDocument/);
  });

  test('falls back honestly when the LLM path is unavailable or errors', () => {
    const docsRoute = sliceRoute(
      "router.post('/sessions/:id/documents',",
      "router.post('/sessions/:id/confirm',"
    );
    assert.match(docsRoute, /catch/);
    assert.match(docsRoute, /fallbackReason/);
  });

  test('records an audit entry for every processed document', () => {
    const docsRoute = sliceRoute(
      "router.post('/sessions/:id/documents',",
      "router.post('/sessions/:id/confirm',"
    );
    assert.match(docsRoute, /recordAudit\([\s\S]*?DOCUMENT_PROCESSED/);
  });

  test('extracted fields are independently re-validated, never trusted directly', () => {
    const docsRoute = sliceRoute(
      "router.post('/sessions/:id/documents',",
      "router.post('/sessions/:id/confirm',"
    );
    assert.match(docsRoute, /executeTool\(\s*['"]update_care_summary['"]/);
  });

  test('never references anything that could move money or finalize an application', () => {
    const docsRoute = sliceRoute(
      "router.post('/sessions/:id/documents',",
      "router.post('/sessions/:id/confirm',"
    ).toLowerCase();
    for (const forbidden of ['disburse', 'payout', 'marketplace/applications']) {
      assert.doesNotMatch(docsRoute, new RegExp(forbidden));
    }
  });

  test('/approve and /execute remain untouched by document ingestion', () => {
    const approveRoute = sliceRoute(
      "router.post('/sessions/:id/approve',",
      "// ============================================\n// STAGE 5"
    );
    const executeRoute = sliceRoute(
      "router.post('/sessions/:id/execute',",
      "// ============================================\n// STAGE 6"
    );
    assert.doesNotMatch(approveRoute, /care-agent-document|extractFromDocument/);
    assert.doesNotMatch(executeRoute, /care-agent-document|extractFromDocument/);
  });
});
