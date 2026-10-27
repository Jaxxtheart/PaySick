/**
 * Unit Tests — care-agent.html's upload control does real document ingestion
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The file input has existed since an earlier release but was wired to a
 * stub ("I can't read inside documents yet, so please tell me..."). This
 * pins the stub's removal and the real upload flow: client-side type/size
 * validation before ever uploading, a transient "reading" state while the
 * document is processed (extraction is a real network call, not instant),
 * and wiring to the new api-client.js method.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../kehr.html'), 'utf8');
const apiClient = fs.readFileSync(path.join(__dirname, '../../api-client.js'), 'utf8');

describe('care-agent.html -- real document upload, not the old stub', () => {
  test('no longer claims it cannot read inside documents', () => {
    assert.doesNotMatch(html, /can.?t read inside documents yet/i);
  });

  test('wires the file-input handler to PaySickAPI.careAgent.uploadDocument', () => {
    assert.match(html, /PaySickAPI\.careAgent\.uploadDocument/);
  });

  test('validates file type client-side before uploading', () => {
    assert.match(html, /application\/pdf/);
    assert.match(html, /image\/jpeg/);
    assert.match(html, /image\/png/);
  });

  test('validates file size client-side before uploading', () => {
    assert.match(html, /4\s*\*\s*1024\s*\*\s*1024/);
  });

  test('shows a transient "reading" state while the document is processed', () => {
    assert.match(html, /[Rr]eading your document/);
  });

  test('renders the summary/procedure-option UI the same way a chat reply does, reusing existing render paths', () => {
    const uploadHandlerStart = html.indexOf("document.getElementById('file-input').addEventListener");
    assert.ok(uploadHandlerStart !== -1);
    const uploadHandler = html.slice(uploadHandlerStart, uploadHandlerStart + 2500);
    assert.match(uploadHandler, /updateProcedureOptions/);
    assert.match(uploadHandler, /renderSummaryCard/);
  });
});

describe('api-client.js -- uploadDocument method', () => {
  test('exists on PaySickAPI.careAgent and posts to the documents route', () => {
    assert.match(apiClient, /async uploadDocument\(/);
    assert.match(apiClient, /\/care-agent\/sessions\/\$\{sessionId\}\/documents/);
  });
});
