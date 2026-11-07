/**
 * CARE AGENT — NLP-LITE EXTRACTION ENGINE
 *
 * Deterministic, rule-based extraction (regex + keyword matching, plus a
 * lightweight local embedding-similarity fallback for procedure matching
 * -- see below). This is NOT a call to an external LLM -- no third-party
 * language model is wired into this repository, and none should be
 * assumed by callers of this module. It exists to turn a patient's
 * free-text description of their care need into structured fields the
 * Care Agent can work with.
 *
 * Architecture principle (see task spec): "AI reasons, PaySick controls."
 * This module only ever reasons about wording — it never invents a Rand
 * figure, a procedure, or a provider that the patient did not state. Every
 * extracted field carries a `confidence` of 'high' or 'low' so the caller
 * can decide what still needs to be confirmed with the patient rather than
 * silently trusting a guess (see care-agent.service.js's nextQuestion /
 * missingFieldsFor, which drive the "never hide uncertainty" UI).
 *
 * PROCEDURE MATCHING -- exact match, then embedding similarity:
 * Exact substring matching against PROCEDURE_TYPE_KEYWORDS (below) is
 * tried first and, when it hits, is authoritative -- it's how a tapped
 * procedure chip always round-trips at a perfect score. When nothing
 * matches exactly, extractProcedureType falls back to a lightweight,
 * fully local embedding-similarity match: every category's label and
 * keywords are turned into a character-trigram count vector once at
 * module load (CATEGORY_EMBEDDINGS -- this is the "precompute embeddings
 * for the category labels" step), the incoming text is turned into the
 * same kind of vector, and the two are compared by cosine similarity
 * (findBestCategoryMatch) instead of substring containment. This is a
 * genuine vector-space technique -- bag-of-character-n-grams, the
 * pre-neural ancestor of word2vec/fastText -- so unlike the old
 * exact-match-only engine it generalizes to unseen phrasing that shares
 * sub-word structure with a known category ("nose procedure" -> cosmetic,
 * "eye laser surgery" -> lasik, "rhinoplastey" [typo] -> cosmetic), and it
 * produces an actual numeric similarity score (`procedureTypeSimilarity`,
 * 0-1) rather than a hardcoded boolean label. It was built this way,
 * rather than calling a real embeddings API (e.g. Voyage AI, Anthropic's
 * recommended embeddings partner -- Anthropic has no native embeddings
 * endpoint of its own), because no such API key exists in this codebase
 * today (only ANTHROPIC_API_KEY, used by outreach/claude.service.js) and
 * this sandbox cannot install a new npm package or download a pretrained
 * model file to compute real learned embeddings locally either. It is
 * honestly a weaker, purely lexical form of "embedding similarity" -- it
 * cannot tell that "nose reshaping" means rhinoplasty the way a trained
 * model could, since it has no notion of word meaning, only shared
 * character sequences -- but it is a real improvement over exact-substring
 * matching, is fully local, dependency-free, deterministic, and testable
 * in this sandbox, and it stays swappable: if a real embeddings API key is
 * ever added, only CATEGORY_EMBEDDINGS/findBestCategoryMatch need change,
 * not any caller.
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

/**
 * Normalizes text for trigram embedding: lowercase, strip anything that
 * isn't a letter/digit/space, collapse whitespace, and pad with a single
 * boundary space on each side so a 3-character window can see the start
 * and end of the very first/last word (e.g. " no" and "ob " for "job").
 */
function normalizeForEmbedding(text) {
  return ` ${String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/**
 * Turns text into a character-trigram count vector, represented as a
 * Map<trigram, count>. This is the "embedding" -- a fixed-shape numeric
 * representation two arbitrary strings can be compared in, via
 * cosineSimilarity, without either needing to share an exact substring.
 */
function buildTrigramVector(text) {
  const normalized = normalizeForEmbedding(text);
  const vector = new Map();
  if (normalized.trim().length === 0) return vector;
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    const gram = normalized.slice(i, i + 3);
    vector.set(gram, (vector.get(gram) || 0) + 1);
  }
  return vector;
}

/**
 * Standard cosine similarity between two sparse count vectors. Returns a
 * value in [0, 1] (trigram counts are never negative, so the two vectors
 * can never point in opposite directions). Never divides by zero: an
 * empty vector (e.g. from blank/punctuation-only text) yields 0, not NaN.
 */
function cosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0;
  const [smaller, larger] = vectorA.size <= vectorB.size ? [vectorA, vectorB] : [vectorB, vectorA];
  for (const [gram, count] of smaller) {
    const otherCount = larger.get(gram);
    if (otherCount) dotProduct += count * otherCount;
  }

  let normA = 0;
  for (const count of vectorA.values()) normA += count * count;
  let normB = 0;
  for (const count of vectorB.values()) normB += count * count;
  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Precomputed once at module load: one trigram vector per procedure
// category, built from its label plus every keyword phrase it recognizes.
const CATEGORY_EMBEDDINGS = PROCEDURE_CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  vector: buildTrigramVector([category.label, ...category.keywords].join(' ')),
}));

// Calibrated against a spread of real and unrelated example phrases (see
// tests/unit/care-agent-embedding-similarity.test.js): unrelated free text
// ("a growth removed from my arm", "help me pay", a stray bill mention)
// scored at most ~0.10, while every genuine near-miss/typo variant tried
// scored at least ~0.22 -- comfortably above SIMILARITY_MATCH_THRESHOLD,
// with a wide safety margin against the observed noise ceiling.
const SIMILARITY_MATCH_THRESHOLD = 0.2;
// A fuzzy match at or above this score is treated as confidently as an
// exact substring hit; below it, a guess is still offered (never hidden)
// but flagged 'low' confidence so the caller keeps confirming it.
const SIMILARITY_HIGH_THRESHOLD = 0.5;

// Every category vector is built from a short label/keyword phrase (one to
// three words). Embedding an entire multi-sentence patient message as one
// vector and comparing it directly would dilute that signal -- lots of
// unrelated words ("not sure what it's called", "please can you help")
// add trigrams of their own, growing the message vector's norm without
// adding to the dot product, so genuinely matching text drowns as the
// surrounding message gets longer. Sliding a small word-window over the
// message and scoring each window separately (below) keeps the comparison
// apples-to-apples: short phrase vs. short phrase, exactly like the exact-
// substring path already did, just fuzzy instead of exact.
const MAX_PHRASE_WINDOW_WORDS = 4;

function extractCandidatePhrases(text) {
  const normalized = normalizeForEmbedding(text).trim();
  if (!normalized) return [];
  const words = normalized.split(' ');
  const phrases = new Set();
  const maxWindow = Math.min(MAX_PHRASE_WINDOW_WORDS, words.length);
  // A lone single word ("Aesthetic", a chip-style reply) is a legitimate
  // whole-message window. Inside a longer message, though, a single
  // generic word (e.g. "surgery", "procedure" -- both appear in more than
  // one category's own label) is too ambiguous on its own and was found,
  // during calibration, to produce false-positive matches; requiring at
  // least two words there keeps enough context to disambiguate.
  const minWindow = words.length === 1 ? 1 : 2;
  for (let windowSize = minWindow; windowSize <= maxWindow; windowSize += 1) {
    for (let start = 0; start + windowSize <= words.length; start += 1) {
      phrases.add(words.slice(start, start + windowSize).join(' '));
    }
  }
  return [...phrases];
}

/**
 * Finds the procedure category whose precomputed embedding is most
 * similar to any short word-window of the given text, if any clears
 * SIMILARITY_MATCH_THRESHOLD. Returns null rather than a weak guess when
 * nothing clears the bar -- this module never invents a procedure the
 * text gave no real signal for.
 *
 * @param {string} text
 * @returns {{ id: string, label: string, score: number } | null}
 */
function findBestCategoryMatch(text) {
  const phrases = extractCandidatePhrases(text);
  if (phrases.length === 0) return null;

  let best = null;
  for (const phrase of phrases) {
    const vector = buildTrigramVector(phrase);
    if (vector.size === 0) continue;
    for (const entry of CATEGORY_EMBEDDINGS) {
      const score = cosineSimilarity(vector, entry.vector);
      if (!best || score > best.score) {
        best = { id: entry.id, label: entry.label, score };
      }
    }
  }
  if (!best || best.score < SIMILARITY_MATCH_THRESHOLD) return null;
  return best;
}

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
        similarityScore: 1,
      };
    }
  }

  // No exact phrase found -- fall back to embedding similarity rather than
  // giving up outright (see the module header for what this buys over the
  // old exact-match-only behaviour).
  const match = findBestCategoryMatch(text);
  if (match) {
    return {
      procedureTypeGuess: match.id,
      treatmentDescription: match.label,
      confidence: match.score >= SIMILARITY_HIGH_THRESHOLD ? 'high' : 'low',
      similarityScore: match.score,
    };
  }

  return { procedureTypeGuess: null, treatmentDescription: null, confidence: 'low', similarityScore: 0 };
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
 *   procedureTypeSimilarity: number,
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
    // The actual, non-boolean similarity signal behind
    // confidence.procedureTypeGuess -- 1 for an exact phrase match, 0 for
    // no match at all, and a genuine cosine-similarity score in between
    // for a fuzzy match (see findBestCategoryMatch).
    procedureTypeSimilarity: procedure.similarityScore,
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
  buildTrigramVector,
  cosineSimilarity,
  findBestCategoryMatch,
  CATEGORY_EMBEDDINGS,
};
