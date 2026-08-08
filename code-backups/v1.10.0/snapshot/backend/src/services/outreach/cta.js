'use strict';

/**
 * THE CALL TO ACTION - REGISTER AS A PAYSICK PROVIDER
 *
 * Every outreach message ends on one ask: register the practice as a provider on
 * the PaySick website. The 15 minute demo is secondary and is only ever offered
 * after the registration link, alongside the contact address for anything the
 * practice needs first.
 *
 * Enforced in code, like the sign-off and the terminology linter: a draft that
 * comes back from the model without the registration link has it appended above
 * the sign-off, so no message can go out without the ask.
 */

const { OUTREACH_CONFIG, registrationUrl } = require('../../config/outreach.config');
const { SIGNOFF } = require('./signoff');
const { stripEmDashes } = require('./style');

/**
 * The full call to action, for an email body.
 * @param {object} [opts]
 * @param {string} [opts.url]          override the registration link
 * @param {string} [opts.contactEmail] override the contact address
 * @returns {string}
 */
function registrationCtaText(opts = {}) {
  const url = opts.url || registrationUrl();
  const email = opts.contactEmail || OUTREACH_CONFIG.contactEmail;
  return stripEmDashes(
    `Register your practice as a PaySick provider here: ${url}\n\n` +
    `It takes a few minutes and you can do it today. If you need anything before ` +
    `you register, email ${email} and we will come back to you, or we can walk ` +
    `you through it on a 15 minute demo.`
  );
}

/**
 * The same ask, compressed for a LinkedIn DM.
 * @param {object} [opts] see registrationCtaText
 * @returns {string}
 */
function shortRegistrationCtaText(opts = {}) {
  const url = opts.url || registrationUrl();
  const email = opts.contactEmail || OUTREACH_CONFIG.contactEmail;
  // The link ends its own line: a trailing full stop gets swallowed into the
  // href by DM and mail clients, breaking the one link that matters.
  return stripEmDashes(
    `Register your practice as a PaySick provider here: ${url}\n` +
    `Anything you need first, email ${email}, or we can set up a 15 minute demo.`
  );
}

/**
 * Does this message already carry the ask?
 * Matches on the registration path so a message drafted against a different
 * origin (staging, a custom APP_URL) still counts.
 * @param {string} text
 * @param {string} [url] the link that should be present
 * @returns {boolean}
 */
function hasRegistrationCta(text, url) {
  const body = String(text == null ? '' : text);
  if (!body) return false;
  return body.includes(url || registrationUrl()) ||
    body.includes(OUTREACH_CONFIG.providerRegistrationPath);
}

/**
 * Guarantee the registration ask is present, above the sign-off.
 * A message that already has it is returned untouched (idempotent).
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.short] use the LinkedIn-length variant
 * @param {string} [opts.url]
 * @param {string} [opts.contactEmail]
 * @returns {string}
 */
function ensureRegistrationCta(text, opts = {}) {
  const body = String(text == null ? '' : text).replace(/\s+$/, '');
  if (hasRegistrationCta(body, opts.url)) return body;

  const cta = opts.short ? shortRegistrationCtaText(opts) : registrationCtaText(opts);
  if (!body) return cta;

  // Slot it above an existing sign-off so "Best, The PaySick Team" stays last.
  const idx = body.lastIndexOf(SIGNOFF);
  if (idx !== -1 && body.slice(idx).trim() === SIGNOFF) {
    const head = body.slice(0, idx).replace(/\s+$/, '');
    return `${head}\n\n${cta}\n\n${SIGNOFF}`;
  }

  return opts.short ? `${body} ${cta}` : `${body}\n\n${cta}`;
}

module.exports = {
  registrationCtaText,
  shortRegistrationCtaText,
  hasRegistrationCta,
  ensureRegistrationCta,
};
