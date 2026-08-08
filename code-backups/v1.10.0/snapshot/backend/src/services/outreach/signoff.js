'use strict';

/**
 * MESSAGE SIGN-OFF NORMALISATION
 *
 * Every outreach message is signed off exactly "Best, The PaySick Team",
 * enforced in code rather than left to the LLM. Any personal or alternative
 * sign-off the model produces is stripped and replaced; a message without one
 * gets it appended; a message already correctly signed is left unchanged.
 */

const SIGNOFF = 'Best,\nThe PaySick Team';

// A closing salutation at the START of a line, through the end of the message.
// Anchored to line start so mid-sentence words ("the best for your patients")
// are not mistaken for a sign-off.
const TRAILING_SIGNOFF = new RegExp(
  '\\n+[ \\t]*(?:best|regards|warm regards|warmest regards|kind regards|kindest regards|' +
  'thanks|thank you|cheers|sincerely|yours sincerely|yours truly|warmly|' +
  'the paysick team)\\b[\\s\\S]*$',
  'i'
);

/**
 * @param {string} text
 * @returns {string} text ending in exactly the team sign-off
 */
function normalizeSignoff(text) {
  let body = String(text == null ? '' : text).replace(/\s+$/, '');

  // If it already ends with exactly the team sign-off, leave it untouched.
  if (body.endsWith(SIGNOFF)) return body;

  // Strip any trailing salutation block, then append the canonical sign-off.
  body = body.replace(TRAILING_SIGNOFF, '').replace(/\s+$/, '');
  return body ? `${body}\n\n${SIGNOFF}` : SIGNOFF;
}

module.exports = { normalizeSignoff, SIGNOFF };
