'use strict';

/**
 * CARE AGENT — DOCUMENT INGESTION
 *
 * Lets a patient upload a quote, invoice, or medical-scheme statement and
 * have its fields extracted automatically, instead of retyping numbers
 * from a page they're already looking at. Replaces the old stub in
 * care-agent.html ("I can't read inside documents yet").
 *
 * Same "AI reasons, PaySick controls" discipline as the conversational
 * agent (care-agent-llm.service.js):
 *   - A single Anthropic Messages API call, with `tool_choice` forcing
 *     the model to call extract_document_fields -- it can never reply
 *     with free text instead, so the result is always structured.
 *   - What the model returns is NEVER trusted directly. The route
 *     (routes/care-agent.js) feeds the extracted fields through the
 *     SAME executeTool('update_care_summary', ...) guardrail the
 *     conversational agent already uses (care-agent-llm.service.js) --
 *     non-negative integer amounts, procedureTypeGuess restricted to the
 *     fixed known category ids, a field already recorded never
 *     overwritten. This module only ever reasons about what a document
 *     says; PaySick's existing validated merge path is what actually
 *     updates the patient's summary.
 *   - No deterministic fallback exists for document reading itself (there
 *     is no local OCR engine in this codebase, unlike the conversational
 *     agent's trigram-similarity fallback) -- when the API is unavailable
 *     or errors, the caller falls back to asking the patient to type the
 *     figures instead, same as the stub this replaces.
 *
 * Uses the shared care-agent-anthropic-client.js (fetch, signing, error
 * handling) -- no new npm dependency, no new fetch boilerplate. This
 * sandbox has no outbound internet access, so the live API (including its
 * document/vision support) cannot be exercised here; see
 * tests/unit/care-agent-document.test.js for full coverage via an
 * injected fetchImpl instead.
 */

const { callAnthropicMessages } = require('./care-agent-anthropic-client');
const { PROCEDURE_CATEGORIES } = require('./care-agent-nlp.service');

// Matches exactly what care-agent.html's <input type="file" accept> already
// declares -- single source of truth the route validates an upload against
// before ever spending a network call on it.
const ALLOWED_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// A phone photo of a quote or a short PDF comfortably fits well under this;
// a patient uploading something bigger is almost certainly the wrong file.
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const DOCUMENT_TYPES = ['quote', 'invoice', 'medical_scheme_statement', 'other'];

const DOCUMENT_EXTRACTION_TOOL = {
  name: 'extract_document_fields',
  description:
    'Record exactly what this single uploaded document states. Only include a field when the document itself clearly states it -- never guess or carry over anything from outside the document. Omit a field entirely if it is not present.',
  input_schema: {
    type: 'object',
    properties: {
      documentType: {
        type: 'string',
        enum: DOCUMENT_TYPES,
        description: 'What kind of document this is, from what it looks like.',
      },
      quotedAmountCents: {
        type: 'integer',
        minimum: 0,
        description: 'The quoted/total treatment cost printed on the document, in cents.',
      },
      schemeContributionCents: {
        type: 'integer',
        minimum: 0,
        description: 'The amount a medical aid/scheme statement says it will cover, in cents. Only from a scheme statement, never guessed from a quote alone.',
      },
      procedureTypeGuess: {
        type: 'string',
        enum: PROCEDURE_CATEGORIES.map((c) => c.id),
        description: "The matching category id, only if the document's own wording clearly fits one of the recognized categories.",
      },
      treatmentDescription: {
        type: 'string',
        description: "A short description of the treatment, in the document's own words.",
      },
      providerName: {
        type: 'string',
        description: 'The clinic/provider name printed on the document, if present.',
      },
    },
    required: ['documentType'],
  },
};

const DOCUMENT_SYSTEM_PROMPT = `You are reading a single document a patient uploaded while describing a medical treatment
they need help affording. You are not talking to the patient -- just reading the page and
recording what is actually printed on it.

HARD RULES, never violate:
- Only record a field the document itself states. Never guess, infer, or carry over a figure
  from anywhere outside this document.
- schemeContributionCents is only ever set from a medical aid/scheme statement explicitly
  saying what it will cover -- never inferred from a quote alone.
- Only set procedureTypeGuess when the document's own wording clearly matches one of the
  listed categories; otherwise leave it unset and just record treatmentDescription.
- Always call extract_document_fields exactly once, even if the document turns out to have
  nothing useful on it -- in that case set only documentType and leave every other field out.`;

/**
 * Builds the Anthropic content block for an uploaded file. PDFs use the
 * `document` block type; images use `image` -- both accept the same
 * base64-encoded `source` shape.
 */
function buildContentBlock(base64Data, mediaType) {
  const blockType = mediaType === 'application/pdf' ? 'document' : 'image';
  return {
    type: blockType,
    source: { type: 'base64', media_type: mediaType, data: base64Data },
  };
}

/**
 * Sends one document to the model and returns what it found. Always a
 * single, forced tool call -- never a free-text reply. Validation of the
 * returned fields happens one level up, via executeTool('update_care_summary', ...)
 * in care-agent-llm.service.js, exactly like the conversational agent's
 * own tool calls.
 *
 * @param {object} params
 * @param {string} params.base64Data
 * @param {string} params.mediaType one of ALLOWED_MEDIA_TYPES
 * @param {function} [params.fetchImpl] injectable fetch (for tests)
 * @returns {Promise<{ documentType: string, fields: object }>}
 */
async function extractFromDocument({ base64Data, mediaType, fetchImpl }) {
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    throw new Error(`Unsupported media type: ${mediaType}`);
  }

  const data = await callAnthropicMessages({
    system: DOCUMENT_SYSTEM_PROMPT,
    tools: [DOCUMENT_EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'extract_document_fields' },
    messages: [
      {
        role: 'user',
        content: [
          buildContentBlock(base64Data, mediaType),
          { type: 'text', text: 'Extract the underwriting fields from this document.' },
        ],
      },
    ],
    fetchImpl,
  });

  const content = Array.isArray(data.content) ? data.content : [];
  const toolUse = content.find((block) => block.type === 'tool_use' && block.name === 'extract_document_fields');
  if (!toolUse) {
    throw new Error('Document extraction did not return a structured result');
  }

  const { documentType, ...fields } = toolUse.input || {};
  return { documentType: documentType || 'other', fields };
}

const DOCUMENT_TYPE_LABELS = {
  quote: 'quote',
  invoice: 'invoice',
  medical_scheme_statement: 'medical aid statement',
  other: 'document',
};

const FIELD_LABELS = {
  quotedAmountCents: 'the quoted amount',
  schemeContributionCents: 'what your medical aid said it will cover',
  procedureTypeGuess: 'the procedure category',
  treatmentDescription: 'the treatment',
  providerName: 'the provider name',
};

/**
 * Builds a deterministic, honest confirmation message describing what was
 * actually recorded from the document -- never an LLM-phrased sentence,
 * so there's no second point of failure just to say what happened.
 *
 * @param {{ documentType: string, recorded: string[] }} params
 * @returns {string}
 */
function describeExtraction({ documentType, recorded }) {
  const label = DOCUMENT_TYPE_LABELS[documentType] || 'document';
  const found = [...new Set((recorded || []).map((field) => FIELD_LABELS[field] || field))];

  if (found.length === 0) {
    return `I had a look at that ${label} but couldn't find anything I could use. Could you tell me the amount and treatment in your own words instead?`;
  }

  const joined =
    found.length === 1 ? found[0] : `${found.slice(0, -1).join(', ')} and ${found[found.length - 1]}`;
  return `I read your ${label} and found ${joined}. Take a look below and tell me if anything needs fixing.`;
}

module.exports = {
  ALLOWED_MEDIA_TYPES,
  MAX_DOCUMENT_BYTES,
  DOCUMENT_EXTRACTION_TOOL,
  extractFromDocument,
  describeExtraction,
};
