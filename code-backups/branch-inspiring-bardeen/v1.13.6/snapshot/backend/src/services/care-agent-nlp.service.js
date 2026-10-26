/**
 * CARE AGENT — NLP-LITE EXTRACTION ENGINE
 *
 * Deterministic, rule-based extraction (regex + keyword matching). This is
 * NOT a call to an external LLM — no third-party language model is wired
 * into this repository, and none should be assumed by callers of this
 * module. It exists to turn a patient's free-text description of their
 * care need into structured fields the Care Agent can work with.
 *
 * Architecture principle (see task spec): "AI reasons, PaySick controls."
 * This module only ever reasons about wording — it never invents a Rand
 * figure, a procedure, or a provider that the patient did not state. Every
 * extracted field carries a `confidence` of 'high' or 'low' so the caller
 * can decide what still needs to be confirmed with the patient rather than
 * silently trusting a guess (see care-agent.service.js's nextQuestion /
 * missingFieldsFor, which drive the "never hide uncertainty" UI).
 */

'use strict';

const { toCents } = require('../utils/money');

/**
 * The finite set of procedures this engine recognizes, as named
 * categories with a human-readable label. This is the single source of
 * truth: PROCEDURE_TYPE_KEYWORDS (phrase -> category id, used by
 * extraction) is derived from it below, and PROCEDURE_CATEGORIES itself
 * is exported so the UI can present these as tappable choices instead of
 * leaving the patient to guess phrasing against an invisible list — a
 * real user typed "nose job", "nose procedure", and "aesthetic" in a row
 * and got the same unrecognized-input question every time. Each
 * category's `label`, sent as-is if the patient taps it, must itself be
 * one of its own `keywords` so a click round-trips through the exact same
 * extraction path as typed text (see the regression test asserting this).
 */
const PROCEDURE_CATEGORIES = [
  { id: 'dental_implants', label: 'Dental Implants', keywords: ['dental implants'] },
  { id: 'dental_veneers', label: 'Dental Veneers', keywords: ['dental veneers'] },
  { id: 'dental_whitening', label: 'Dental Whitening', keywords: ['dental whitening'] },
  { id: 'dental_procedure', label: 'Root Canal', keywords: ['root canal'] },
  { id: 'orthopedic_procedure', label: 'Hip or Knee Replacement', keywords: ['hip replacement', 'knee replacement'] },
  { id: 'bariatric', label: 'Gastric Bypass', keywords: ['gastric bypass'] },
  {
    id: 'cosmetic',
    label: 'Cosmetic / Aesthetic Procedure',
    keywords: ['cosmetic surgery', 'rhinoplasty', 'nose job', 'aesthetic'],
  },
  { id: 'orthodontics', label: 'Orthodontics / Braces', keywords: ['orthodontics', 'braces'] },
  { id: 'lasik', label: 'LASIK Eye Surgery', keywords: ['lasik'] },
  { id: 'fertility', label: 'Fertility Treatment (IVF)', keywords: ['fertility', 'ivf'] },
];

// Derived phrase -> category id map, longest phrase first so "dental
// implants" is matched before any shorter substring that might otherwise
// be considered.
const PROCEDURE_TYPE_KEYWORDS = {};
for (const category of PROCEDURE_CATEGORIES) {
  for (const keyword of category.keywords) {
    PROCEDURE_TYPE_KEYWORDS[keyword] = category.id;
  }
  // The label itself must always be recognized (a chip click sends it verbatim).
  PROCEDURE_TYPE_KEYWORDS[category.label.toLowerCase()] = category.id;
}

const PROCEDURE_KEYS_BY_LENGTH = Object.keys(PROCEDURE_TYPE_KEYWORDS)
  .sort((a, b) => b.length - a.length);

const AMOUNT_PATTERN = /R\s?([\d][\d,]*(?:\.\d{2})?)/gi;

const CONTRIBUTION_PATTERN =
  /(?:will\s+(?:pay|cover|contribute)|paying|contributing)\D{0,15}?R\s?([\d][\d,]*(?:\.\d{2})?)/i;

const PROVIDER_PATTERN =
  /\b(?:at|from|with)\s+([A-Z][\w&'.]*(?:\s+[A-Z][\w&'.]*)*)/;

function parseAmountToCents(rawDigits) {
  const numeric = parseFloat(rawDigits.replace(/,/g, ''));
  if (Number.isNaN(numeric)) return null;
  return toCents(numeric);
}

/**
 * Finds every "Rxxx" style amount in the text and returns the largest,
 * on the heuristic that the biggest figure mentioned is usually the total
 * (a deposit or shortfall mentioned alongside it is typically smaller).
 */
function extractLargestAmountCents(text) {
  const matches = [...text.matchAll(AMOUNT_PATTERN)];
  if (matches.length === 0) return null;
  const amounts = matches
    .map((m) => parseAmountToCents(m[1]))
    .filter((cents) => cents !== null);
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

/**
 * Only extracts a scheme-contribution figure when the text explicitly ties
 * a Rand amount to the scheme paying/covering/contributing. Vague language
 * ("I think Discovery will cover some of it") intentionally yields nothing —
 * inventing a number here would misinform an affordability calculation.
 */
function extractSchemeContributionCents(text) {
  const match = text.match(CONTRIBUTION_PATTERN);
  if (!match) return undefined;
  const cents = parseAmountToCents(match[1]);
  return cents === null ? undefined : cents;
}

function extractProcedureType(text) {
  const lower = text.toLowerCase();
  for (const phrase of PROCEDURE_KEYS_BY_LENGTH) {
    if (lower.includes(phrase)) {
      return {
        procedureTypeGuess: PROCEDURE_TYPE_KEYWORDS[phrase],
        treatmentDescription: phrase.replace(/\b\w/g, (c) => c.toUpperCase()),
        confidence: 'high',
      };
    }
  }
  return { procedureTypeGuess: null, treatmentDescription: null, confidence: 'low' };
}

function extractProviderName(text) {
  const match = text.match(PROVIDER_PATTERN);
  if (!match) return null;
  return match[1].replace(/[.,]+$/, '').trim();
}

/**
 * Extracts what it can from a patient's free-text message.
 *
 * @param {string} text
 * @returns {{
 *   quotedAmountCents: number|null,
 *   schemeContributionCents?: number,
 *   procedureTypeGuess: string|null,
 *   treatmentDescription: string|null,
 *   providerName: string|null,
 *   confidence: { quotedAmountCents: 'high'|'low', procedureTypeGuess: 'high'|'low', providerName: 'high'|'low' }
 * }}
 */
function extractCareRequest(text) {
  const safeText = text || '';

  const quotedAmountCents = extractLargestAmountCents(safeText);
  const procedure = extractProcedureType(safeText);
  const providerName = extractProviderName(safeText);
  const schemeContributionCents = extractSchemeContributionCents(safeText);

  const result = {
    quotedAmountCents,
    procedureTypeGuess: procedure.procedureTypeGuess,
    treatmentDescription: procedure.treatmentDescription,
    providerName,
    confidence: {
      quotedAmountCents: quotedAmountCents !== null ? 'high' : 'low',
      procedureTypeGuess: procedure.confidence,
      // Name extraction is a weak positional heuristic — never claim high confidence.
      providerName: providerName !== null ? 'low' : 'low',
    },
  };

  if (schemeContributionCents !== undefined) {
    result.schemeContributionCents = schemeContributionCents;
  }

  return result;
}

/**
 * Classifies a free-text message against the Care Agent's suggested
 * prompts so the conversation can route to the right next question.
 *
 * @param {string} text
 * @returns {'has_quote'|'has_bill'|'medical_aid_shortfall'|'unsure'|'know_treatment'|'general'}
 */
function detectIntent(text) {
  const safeText = text || '';

  if (/medical aid/i.test(safeText) && /shortfall|gap|cover/i.test(safeText)) {
    return 'medical_aid_shortfall';
  }
  if (/quot(e|ation|ed)/i.test(safeText)) {
    return 'has_quote';
  }
  if (/\bbill(s|ing)?\b|invoice/i.test(safeText)) {
    return 'has_bill';
  }
  if (/not sure|don'?t know|no idea|unsure/i.test(safeText)) {
    return 'unsure';
  }

  const lower = safeText.toLowerCase();
  if (PROCEDURE_KEYS_BY_LENGTH.some((phrase) => lower.includes(phrase))) {
    return 'know_treatment';
  }

  return 'general';
}

module.exports = {
  extractCareRequest,
  detectIntent,
  PROCEDURE_TYPE_KEYWORDS,
  PROCEDURE_CATEGORIES,
};
