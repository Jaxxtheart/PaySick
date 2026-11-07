/**
 * CARE AGENT — DOCUMENT INGESTION (test-first)
 *
 * Written BEFORE the implementation, per CLAUDE.md's test-first workflow.
 *
 * Lets a patient upload a quote, invoice, or medical-scheme statement and
 * have its fields extracted automatically, replacing the old stub
 * ("I can't read inside documents yet") with a real capability. Follows
 * the exact same "AI reasons, PaySick controls" discipline already built
 * for the conversational agent (care-agent-llm.service.js): extraction
 * forces a single structured tool call (never free text), and the result
 * is independently re-validated by the SAME executeTool('update_care_summary', ...)
 * guardrail the conversational agent uses -- never trusted directly, and
 * never allowed to invent a procedure category or a negative amount.
 *
 * This sandbox has no outbound internet access, so the live Anthropic API
 * (including its document/vision support) cannot be exercised here --
 * every test below uses an injected fetchImpl, the same seam
 * care-agent-llm.service.js's own tests already use.
 */

'use strict';

const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const {
  DOCUMENT_EXTRACTION_TOOL,
  ALLOWED_MEDIA_TYPES,
  MAX_DOCUMENT_BYTES,
  extractFromDocument,
  describeExtraction,
} = require('../../backend/src/services/care-agent-document.service');

const { PROCEDURE_CATEGORIES } = require('../../backend/src/services/care-agent-nlp.service');

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function toolUseBlock(id, name, input) {
  return { type: 'tool_use', id, name, input };
}

describe('DOCUMENT_EXTRACTION_TOOL', () => {
  test('constrains procedureTypeGuess to the fixed known category ids -- never invents one', () => {
    const enumValues = DOCUMENT_EXTRACTION_TOOL.input_schema.properties.procedureTypeGuess.enum;
    assert.deepEqual(enumValues.slice().sort(), PROCEDURE_CATEGORIES.map((c) => c.id).sort());
  });

  test('is named extract_document_fields', () => {
    assert.equal(DOCUMENT_EXTRACTION_TOOL.name, 'extract_document_fields');
  });
});

describe('ALLOWED_MEDIA_TYPES / MAX_DOCUMENT_BYTES', () => {
  test('matches exactly the file types the frontend accepts', () => {
    assert.deepEqual(ALLOWED_MEDIA_TYPES.slice().sort(), ['application/pdf', 'image/jpeg', 'image/png'].sort());
  });

  test('is a sane, explicitly bounded size', () => {
    assert.ok(MAX_DOCUMENT_BYTES > 0);
    assert.ok(MAX_DOCUMENT_BYTES <= 10 * 1024 * 1024, 'expected a conservative cap, not an effectively unlimited one');
  });
});

describe('extractFromDocument', () => {
  test('rejects an unsupported media type without ever calling the network', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return jsonResponse({}); };
    await assert.rejects(
      () => extractFromDocument({ base64Data: 'abc', mediaType: 'application/zip', fetchImpl }),
      /media type/i
    );
    assert.equal(called, false, 'must validate before spending a network call');
  });

  test('sends a document content block for a PDF, with the raw base64 untouched', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return jsonResponse({
        stop_reason: 'tool_use',
        content: [toolUseBlock('c1', 'extract_document_fields', { documentType: 'quote', quotedAmountCents: 4800000 })],
      });
    };
    await extractFromDocument({ base64Data: 'BASE64DATA', mediaType: 'application/pdf', fetchImpl });
    const userMessage = captured.messages[0];
    const docBlock = userMessage.content.find((b) => b.type === 'document');
    assert.ok(docBlock, 'expected a document content block for a PDF');
    assert.equal(docBlock.source.media_type, 'application/pdf');
    assert.equal(docBlock.source.data, 'BASE64DATA');
  });

  test('sends an image content block for a JPEG/PNG', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return jsonResponse({
        stop_reason: 'tool_use',
        content: [toolUseBlock('c1', 'extract_document_fields', { documentType: 'invoice' })],
      });
    };
    await extractFromDocument({ base64Data: 'IMGDATA', mediaType: 'image/png', fetchImpl });
    const userMessage = captured.messages[0];
    const imgBlock = userMessage.content.find((b) => b.type === 'image');
    assert.ok(imgBlock, 'expected an image content block for a PNG');
    assert.equal(imgBlock.source.media_type, 'image/png');
    assert.equal(imgBlock.source.data, 'IMGDATA');
  });

  test('does not force tool_choice (current models reject "tool"/"any" with a 400) -- it instructs the model to call the tool instead', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let captured;
    const fetchImpl = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return jsonResponse({ stop_reason: 'tool_use', content: [toolUseBlock('c1', 'extract_document_fields', {})] });
    };
    await extractFromDocument({ base64Data: 'x', mediaType: 'image/jpeg', fetchImpl });
    assert.ok(
      captured.tool_choice === undefined || captured.tool_choice.type === 'auto',
      `expected no forced tool_choice, got ${JSON.stringify(captured.tool_choice)}`
    );
    assert.deepEqual(captured.tools.map((t) => t.name), ['extract_document_fields']);
    assert.match(captured.system, /extract_document_fields/);
  });

  test('parses the forced tool call into { documentType, fields }', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = async () => jsonResponse({
      stop_reason: 'tool_use',
      content: [toolUseBlock('c1', 'extract_document_fields', {
        documentType: 'quote',
        quotedAmountCents: 4800000,
        treatmentDescription: 'Dental implants',
      })],
    });
    const result = await extractFromDocument({ base64Data: 'x', mediaType: 'image/jpeg', fetchImpl });
    assert.equal(result.documentType, 'quote');
    assert.equal(result.fields.quotedAmountCents, 4800000);
    assert.equal(result.fields.treatmentDescription, 'Dental implants');
    assert.ok(!('documentType' in result.fields), 'documentType must not leak into the field patch');
  });

  test('throws if the model somehow does not return the forced tool call', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = async () => jsonResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'oops' }] });
    await assert.rejects(() => extractFromDocument({ base64Data: 'x', mediaType: 'image/jpeg', fetchImpl }));
  });

  test('propagates a non-ok API response as a thrown error (route falls back on this)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const fetchImpl = async () => jsonResponse({}, false, 500);
    await assert.rejects(
      () => extractFromDocument({ base64Data: 'x', mediaType: 'image/jpeg', fetchImpl }),
      /Anthropic API error/
    );
  });
});

describe('describeExtraction', () => {
  test('names what it found, in plain language', () => {
    const reply = describeExtraction({ documentType: 'quote', recorded: ['quotedAmountCents', 'treatmentDescription'] });
    assert.match(reply, /quote/i);
    assert.match(reply, /amount/i);
    assert.match(reply, /treatment/i);
  });

  test('is honest when nothing was found -- never claims success it did not have', () => {
    const reply = describeExtraction({ documentType: 'other', recorded: [] });
    assert.match(reply, /couldn.?t find|nothing/i);
  });

  test('never contains an em dash (patient-facing text, per CLAUDE.md)', () => {
    const r1 = describeExtraction({ documentType: 'quote', recorded: ['quotedAmountCents'] });
    const r2 = describeExtraction({ documentType: 'other', recorded: [] });
    assert.ok(!r1.includes('—'));
    assert.ok(!r2.includes('—'));
  });
});
