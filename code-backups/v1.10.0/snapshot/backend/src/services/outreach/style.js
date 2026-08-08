'use strict';

/**
 * OUTREACH HOUSE STYLE - NO EM DASHES
 *
 * PaySick outreach never uses an em dash (or en dash), from the subject line
 * through the body and the LinkedIn variant. The rule is enforced in code, not
 * left to the LLM: every generated or hand-edited message passes through
 * `stripEmDashes` before it is stored, and again before it is sent.
 *
 * Replacements are deterministic:
 *   "paid in full - no chasing"     -> comma
 *   "110-150 words" (numeric range) -> "110 to 150 words"
 *   a dash opening a line (bullet)  -> a plain hyphen bullet
 *   a dash at the end of a line     -> removed
 */

// Em dash, en dash, horizontal bar, figure dash, minus sign.
const DASHES = '[\\u2014\\u2013\\u2015\\u2012\\u2212]';
const DASH_RE = new RegExp(DASHES, 'g');

/**
 * @param {string} text
 * @returns {boolean} true when the text contains any long dash
 */
function hasEmDash(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return new RegExp(DASHES).test(text);
}

/**
 * Remove every long dash from a message, replacing it with plain punctuation.
 * Idempotent: running it on already-clean copy returns the copy unchanged.
 * @param {string} text
 * @returns {string}
 */
function stripEmDashes(text) {
  let out = String(text == null ? '' : text);
  if (!hasEmDash(out)) return out;

  // 1. Numeric ranges read as a range, not a pause: "110-150" -> "110 to 150".
  out = out.replace(new RegExp(`(\\d)[ \\t]*${DASHES}[ \\t]*(\\d)`, 'g'), '$1 to $2');

  // 2. A dash opening a line is a bullet marker -> plain hyphen bullet.
  out = out.replace(new RegExp(`^([ \\t]*)${DASHES}[ \\t]*`, 'gm'), '$1- ');

  // 3. A dash trailing a line has nothing to join -> drop it.
  out = out.replace(new RegExp(`[ \\t]*${DASHES}[ \\t]*(?=\\n|$)`, 'g'), '');

  // 4. Anything left joins two clauses -> comma.
  out = out.replace(new RegExp(`[ \\t]*${DASHES}[ \\t]*`, 'g'), ', ');

  // 5. Tidy up the punctuation the replacements can strand.
  out = out
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]+,/g, ',')
    .replace(/,[ \t]*([.;:!?])/g, '$1')
    .replace(/,[ \t]*(?=\n|$)/g, '');

  // Belt and braces: nothing may survive this function.
  return out.replace(DASH_RE, '');
}

/**
 * Apply the house style to every field of a message shape.
 * @param {object} message e.g. { subject, email_body, linkedin_dm }
 * @returns {object} the same shape with every string field cleaned
 */
function applyStyle(message = {}) {
  const out = {};
  for (const [key, value] of Object.entries(message)) {
    out[key] = typeof value === 'string' ? stripEmDashes(value) : value;
  }
  return out;
}

module.exports = { hasEmDash, stripEmDashes, applyStyle, DASHES };
