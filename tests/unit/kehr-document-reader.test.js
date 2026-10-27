/**
 * Unit Tests: Kehr document reader (v1.22.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * kehr-document-reader.service.js turns an uploaded payslip or bank
 * statement into the figures document-crosscheck.service.js checks. Same
 * discipline as care-agent-document.service.js: one Anthropic call with a
 * tool, and nothing the model returns is trusted until it is normalised
 * here and cross-checked by the flow. The file itself is never stored.
 *
 * Run: node --test tests/unit/kehr-document-reader.test.js
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const reader = require('../../backend/src/services/kehr-document-reader.service');
const { createKehrFlow } = require('../../backend/src/services/kehr-preapproval-flow.service');

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
const toolReply = (input) => jsonResponse({ content: [{ type: 'tool_use', name: reader.INCOME_DOCUMENT_TOOL.name, input }] });

describe('readIncomeDocument', () => {
  let savedKey;
  beforeEach(() => { savedKey = process.env.ANTHROPIC_API_KEY; process.env.ANTHROPIC_API_KEY = 'test-key'; });
  afterEach(() => { if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey; });

  test('refuses an unsupported file type before any network call', async () => {
    let called = false;
    await assert.rejects(reader.readIncomeDocument({ base64Data: 'abc', mediaType: 'application/zip', fetchImpl: async () => { called = true; } }), /Unsupported/);
    assert.equal(called, false);
  });

  test('sends the file as a document block with the extraction tool', async () => {
    let sent;
    const fetchImpl = async (url, init) => { sent = JSON.parse(init.body); return toolReply({ documentType: 'other' }); };
    await reader.readIncomeDocument({ base64Data: 'JVBERi0=', mediaType: 'application/pdf', fetchImpl });
    assert.equal(sent.tools[0].name, 'extract_income_document');
    assert.equal(sent.messages[0].content[0].type, 'document');
  });

  test('a payslip becomes payslip figures in cents', async () => {
    const r = await reader.readIncomeDocument({
      base64Data: 'x', mediaType: 'image/png',
      fetchImpl: async () => toolReply({ documentType: 'payslip', employeeName: 'T G Mokoena', idNumber: '9001015009087', netPayCents: 1_810_000, grossPayCents: 2_200_000 }),
    });
    assert.equal(r.kind, 'payslip');
    assert.deepEqual(r.payslip, { employeeName: 'T G Mokoena', idNumber: '9001015009087', netPayCents: 1_810_000, grossPayCents: 2_200_000 });
  });

  test('a bank statement becomes statement figures, salary credits capped at 12', async () => {
    const credits = Array.from({ length: 15 }, () => ({ amountCents: 1_800_000 }));
    const r = await reader.readIncomeDocument({
      base64Data: 'x', mediaType: 'application/pdf',
      fetchImpl: async () => toolReply({ documentType: 'bank_statement', accountHolder: 'MS T MOKOENA', salaryCredits: credits, debitOrdersCents: 400_000, openingBalanceCents: -5000, totalCreditsCents: 5_400_000, totalDebitsCents: 5_000_000, closingBalanceCents: 395_000 }),
    });
    assert.equal(r.kind, 'statement');
    assert.equal(r.statement.salaryCredits.length, 12);
    assert.equal(r.statement.openingBalanceCents, -5000);
    assert.equal(r.statement.debitOrdersCents, 400_000);
  });

  test('never trusts the model: drops non-integer or negative amounts and a malformed ID', async () => {
    const r = await reader.readIncomeDocument({
      base64Data: 'x', mediaType: 'image/jpeg',
      fetchImpl: async () => toolReply({ documentType: 'payslip', employeeName: 'A'.repeat(500), idNumber: '90-01-01', netPayCents: 18100.5, grossPayCents: -1 }),
    });
    assert.equal(r.kind, 'unreadable');
  });

  test('a document with no income on it is unreadable, not guessed', async () => {
    const r = await reader.readIncomeDocument({ base64Data: 'x', mediaType: 'image/png', fetchImpl: async () => toolReply({ documentType: 'other' }) });
    assert.equal(r.kind, 'unreadable');
  });

  test('a reply without the tool call is an error', async () => {
    await assert.rejects(reader.readIncomeDocument({ base64Data: 'x', mediaType: 'image/png', fetchImpl: async () => jsonResponse({ content: [{ type: 'text', text: 'hi' }] }) }), /structured/);
  });

  test('without an API key the reader is unavailable', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(reader.isAvailable(), false);
  });
});

describe('flow.readDocument', () => {
  const NOW = new Date('2026-10-27T09:00:00Z');
  function setup(readResult) {
    const db = { consents: [], pre: [], saved: null };
    const repo = {
      async listConsents() { return db.consents; },
      async insertConsent(u, r) { const row = { ...r, consentId: 'c' + db.consents.length }; db.consents.push(row); return row; },
      async insertPreapproval(u, input) { const row = { preapprovalId: 'pre-1', userId: u, input, documents: { selfieToken: 's' } }; db.pre.push(row); return row; },
      async getPreapproval(u, id) { return db.pre.find((p) => p.userId === u && p.preapprovalId === id) || null; },
      async saveDocuments(id, d) { db.saved = d; db.pre[0].documents = d; },
    };
    const calls = [];
    const documentReader = { readIncomeDocument: async (args) => { calls.push(args); return readResult; } };
    const flow = createKehrFlow({ repo, adapters: { identity: {}, income: {}, scheme: {}, documentReader }, secret: 'x'.repeat(32), now: () => NOW });
    return { flow, db, calls };
  }

  test('needs the document consent before reading anything', async () => {
    const { flow, calls } = setup({ kind: 'payslip', payslip: { netPayCents: 1 } });
    await flow.startPreapproval('user-1', { estimateCents: 1_000_000, urgency: 'planned' });
    const r = await flow.readDocument('user-1', 'pre-1', { base64Data: 'x', mediaType: 'image/png' });
    assert.equal(r.status, 'needs_consent');
    assert.deepEqual(r.missing, ['document_upload']);
    assert.equal(calls.length, 0);
  });

  test('stores only the figures read, keeps the selfie token, and tells the patient what was read', async () => {
    const payslip = { employeeName: 'T Mokoena', idNumber: '9001015009087', netPayCents: 1_810_000, grossPayCents: null };
    const { flow, db } = setup({ kind: 'payslip', payslip });
    await flow.grantConsent('user-1', 'document_upload');
    await flow.startPreapproval('user-1', { estimateCents: 1_000_000, urgency: 'planned' });
    const r = await flow.readDocument('user-1', 'pre-1', { base64Data: 'x', mediaType: 'image/png' });
    assert.deepEqual(r, { status: 'document_read', kind: 'payslip', message: "We've read your payslip." });
    assert.deepEqual(db.saved.payslip, payslip);
    assert.equal(db.saved.selfieToken, 's');
    assert.ok(!JSON.stringify(db.saved).includes('"base64Data"'));
  });

  test('an unreadable document asks for another, and stores nothing', async () => {
    const { flow, db } = setup({ kind: 'unreadable' });
    await flow.grantConsent('user-1', 'document_upload');
    await flow.startPreapproval('user-1', { estimateCents: 1_000_000, urgency: 'planned' });
    const r = await flow.readDocument('user-1', 'pre-1', { base64Data: 'x', mediaType: 'image/png' });
    assert.equal(r.status, 'document_unreadable');
    assert.equal(db.saved, null);
  });

  test('another patient cannot read into a pre-approval', async () => {
    const { flow } = setup({ kind: 'unreadable' });
    await flow.startPreapproval('user-1', { estimateCents: 1_000_000, urgency: 'planned' });
    await assert.rejects(flow.readDocument('user-2', 'pre-1', { base64Data: 'x', mediaType: 'image/png' }), /not found/i);
  });
});
