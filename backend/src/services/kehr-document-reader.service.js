'use strict';

/**
 * KEHR DOCUMENT READER (v1.22.0)
 *
 * Turns an uploaded payslip or bank statement into the figures
 * document-crosscheck.service.js checks, so a patient who would rather not
 * connect their bank still never types their income.
 *
 * Same discipline as care-agent-document.service.js:
 *   - One Anthropic Messages call with a single tool. tool_choice is not
 *     forced (current models reject it); a reply without the tool call is
 *     an error, never a guess.
 *   - Nothing the model returns is trusted directly. normalise() keeps
 *     only integer cents, a 13-digit ID and bounded names; anything else
 *     makes the document unreadable. The flow then cross-checks the
 *     figures against the verified identity and the bank feed, and a
 *     mismatch goes to a person.
 *   - The file is sent to the model and dropped. Only the figures are
 *     stored (kehr_preapprovals.documents).
 */

const { callAnthropicMessages } = require('./care-agent-anthropic-client');
const { ALLOWED_MEDIA_TYPES, MAX_DOCUMENT_BYTES } = require('./care-agent-document.service');

const MAX_SALARY_CREDITS = 12;
const MAX_NAME_LENGTH = 120;

const centsField = (description) => ({ type: 'integer', minimum: 0, description });

const INCOME_DOCUMENT_TOOL = {
  name: 'extract_income_document',
  description:
    'Record exactly what this single payslip or bank statement states. Only include a field the document itself clearly states. Omit anything not printed on it.',
  input_schema: {
    type: 'object',
    properties: {
      documentType: { type: 'string', enum: ['payslip', 'bank_statement', 'other'] },
      employeeName: { type: 'string', description: 'Payslip: the employee name as printed.' },
      idNumber: { type: 'string', description: 'Payslip: the 13-digit South African ID number, digits only, if printed.' },
      netPayCents: centsField('Payslip: net pay for the period, in cents.'),
      grossPayCents: centsField('Payslip: gross pay for the period, in cents.'),
      accountHolder: { type: 'string', description: 'Statement: the account holder name as printed.' },
      salaryCredits: {
        type: 'array',
        description: 'Statement: each salary or wage credit, one entry per credit, newest first.',
        items: { type: 'object', properties: { amountCents: centsField('The credit amount, in cents.') }, required: ['amountCents'] },
      },
      debitOrdersCents: centsField('Statement: the total of debit orders and loan repayments in one month, in cents.'),
      openingBalanceCents: { type: 'integer', description: 'Statement: opening balance in cents (may be negative).' },
      totalCreditsCents: centsField('Statement: total credits for the period, in cents.'),
      totalDebitsCents: centsField('Statement: total debits for the period, in cents.'),
      closingBalanceCents: { type: 'integer', description: 'Statement: closing balance in cents (may be negative).' },
    },
    required: ['documentType'],
  },
};

const SYSTEM_PROMPT = `You are reading a single payslip or bank statement a patient uploaded so that their
income can be confirmed. You are not talking to the patient.

HARD RULES, never violate:
- Only record what the document itself prints. Never estimate, infer or round.
- All amounts are integers in cents (R1,234.56 is 123456).
- salaryCredits lists only credits the statement labels as salary or wages.
- If the document is not a payslip or bank statement, set documentType to "other" and nothing else.
- Always call extract_income_document exactly once.`;

function isAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

const isCents = (v) => Number.isInteger(v) && v >= 0;
const isSignedCents = (v) => Number.isInteger(v);
const name = (v) => (typeof v === 'string' && v.trim() && v.length <= MAX_NAME_LENGTH ? v.trim() : null);

/** Keeps only well-formed figures. Returns null when nothing usable remains. */
function normalise(input = {}) {
  if (input.documentType === 'payslip') {
    if (!isCents(input.netPayCents) || input.netPayCents === 0) return null;
    if (input.grossPayCents !== undefined && !isCents(input.grossPayCents)) return null;
    if (input.idNumber !== undefined && !/^\d{13}$/.test(String(input.idNumber))) return null;
    return {
      kind: 'payslip',
      payslip: {
        employeeName: name(input.employeeName),
        idNumber: input.idNumber !== undefined ? String(input.idNumber) : null,
        netPayCents: input.netPayCents,
        grossPayCents: input.grossPayCents !== undefined ? input.grossPayCents : null,
      },
    };
  }
  if (input.documentType === 'bank_statement') {
    const credits = Array.isArray(input.salaryCredits) ? input.salaryCredits : [];
    if (!credits.length || !credits.every((c) => c && isCents(c.amountCents) && c.amountCents > 0)) return null;
    for (const k of ['debitOrdersCents', 'totalCreditsCents', 'totalDebitsCents']) {
      if (input[k] !== undefined && !isCents(input[k])) return null;
    }
    for (const k of ['openingBalanceCents', 'closingBalanceCents']) {
      if (input[k] !== undefined && !isSignedCents(input[k])) return null;
    }
    const opt = (k) => (input[k] !== undefined ? input[k] : null);
    return {
      kind: 'statement',
      statement: {
        accountHolder: name(input.accountHolder),
        salaryCredits: credits.slice(0, MAX_SALARY_CREDITS).map((c) => ({ amountCents: c.amountCents })),
        debitOrdersCents: input.debitOrdersCents !== undefined ? input.debitOrdersCents : 0,
        openingBalanceCents: opt('openingBalanceCents'),
        totalCreditsCents: opt('totalCreditsCents'),
        totalDebitsCents: opt('totalDebitsCents'),
        closingBalanceCents: opt('closingBalanceCents'),
      },
    };
  }
  return null;
}

/**
 * @param {{ base64Data: string, mediaType: string, fetchImpl?: function }} params
 * @returns {Promise<{ kind: 'payslip'|'statement'|'unreadable', payslip?, statement? }>}
 */
async function readIncomeDocument({ base64Data, mediaType, fetchImpl }) {
  if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) throw new Error(`Unsupported media type: ${mediaType}`);
  if (typeof base64Data !== 'string' || !base64Data) throw new Error('base64Data is required');

  const data = await callAnthropicMessages({
    system: SYSTEM_PROMPT,
    tools: [INCOME_DOCUMENT_TOOL],
    messages: [{
      role: 'user',
      content: [
        { type: mediaType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: 'Extract the income figures from this document.' },
      ],
    }],
    fetchImpl,
  });

  const content = Array.isArray(data.content) ? data.content : [];
  const toolUse = content.find((b) => b.type === 'tool_use' && b.name === INCOME_DOCUMENT_TOOL.name);
  if (!toolUse) throw new Error('Document reading did not return a structured result');

  return normalise(toolUse.input || {}) || { kind: 'unreadable' };
}

module.exports = {
  INCOME_DOCUMENT_TOOL,
  ALLOWED_MEDIA_TYPES,
  MAX_DOCUMENT_BYTES,
  isAvailable,
  normalise,
  readIncomeDocument,
};
