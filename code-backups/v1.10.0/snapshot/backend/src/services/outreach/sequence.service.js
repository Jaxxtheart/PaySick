'use strict';

/**
 * FOLLOW-UP SEQUENCE (§6.4)
 *
 * Step 0 - day 0:  initial outreach (email + LinkedIn)
 * Step 1 - day 3:  short bump, re-anchor on "paid in full, patients who'd say no"
 * Step 2 - day 7:  value add, founding-partner offer
 * Step 3 - day 14: polite close-off
 *
 * Any inbound reply halts the sequence (lead -> replied); a lead marked `replied`
 * never advances. The copy here is deterministic and pre-vetted (no denied terms),
 * but it still passes through the terminology linter before queuing, like any draft.
 *
 * House rules applied to every step, in code:
 *   - no em dashes anywhere, subject line included (style.js)
 *   - one call to action: register as a provider on the PaySick site, with the
 *     demo offered second and hello@paysick.co.za for anything else (cta.js)
 *   - the canonical "Best, The PaySick Team" sign-off (signoff.js)
 */

const { OUTREACH_CONFIG } = require('../../config/outreach.config');
const { normalizeSignoff } = require('./signoff');
const { stripEmDashes } = require('./style');
const { ensureRegistrationCta } = require('./cta');

/**
 * Follow-up copy per step, styled, with the registration call to action and the
 * canonical sign-off enforced on both the email and the LinkedIn variant.
 */
function stepContent(step, practiceName) {
  const c = rawStepContent(step, practiceName);
  if (!c) return null;
  return {
    subject: stripEmDashes(c.subject),
    email_body: normalizeSignoff(ensureRegistrationCta(stripEmDashes(c.email_body))),
    linkedin_dm: normalizeSignoff(
      ensureRegistrationCta(stripEmDashes(c.linkedin_dm), { short: true })
    ),
  };
}

/**
 * Templated follow-up copy per step. `{name}` is the practice name.
 * The call to action and sign-off are applied by stepContent(), so templates end
 * on the message body and never mention the demo before the registration ask.
 */
function rawStepContent(step, practiceName) {
  const name = practiceName || 'your practice';
  switch (step) {
    case 1:
      return {
        subject: `Quick follow up for ${name}`,
        email_body:
          `Hi again,\n\nJust circling back. The core of it: with PaySick you are paid in full within 24 hours, ` +
          `while patients who might otherwise say no to a lump sum price go ahead and pay in affordable monthly instalments.`,
        linkedin_dm:
          `Following up. PaySick pays ${name} in full within 24 hours while patients pay over time in instalments.`,
      };
    case 2:
      return {
        subject: `A founding partner spot for ${name}`,
        email_body:
          `Hi,\n\nWe are bringing on a first cohort of practices as founding partners, with a reduced facilitation fee ` +
          `for an introductory period and founding partner status.\n\nYou are paid in full, upfront. Your patients pay ` +
          `in affordable monthly instalments. We carry everything in between, with no collections and no risk to your practice.`,
        linkedin_dm:
          `We are onboarding a founding cohort, with a reduced facilitation fee for an introductory period. ` +
          `Would ${name} like a spot?`,
      };
    case 3:
      return {
        subject: `Closing this off for ${name}`,
        email_body:
          `Hi,\n\nI do not want to crowd your inbox, so I will leave it here. If being paid in full within 24 hours while ` +
          `your patients pay in affordable monthly instalments is ever useful, the door stays open.`,
        linkedin_dm:
          `I will close this off for now. The door stays open for ${name} whenever the timing is right.`,
      };
    default:
      return null; // step 0 is handled by the Claude drafting call, not templates
  }
}

/**
 * The next sequence step for a lead, given its last outbound step.
 * @param {number|null} lastStep
 * @returns {number|null} next step (1..3) or null if the sequence is exhausted
 */
function nextStep(lastStep) {
  const current = Number.isInteger(lastStep) ? lastStep : 0;
  const next = current + 1;
  if (next > OUTREACH_CONFIG.sequenceDays.length - 1) return null;
  return next;
}

/**
 * The interval (days from step 0) at which a given step is due.
 * @param {number} step
 * @returns {number} days
 */
function stepDueInDays(step) {
  return OUTREACH_CONFIG.sequenceDays[step] ?? null;
}

/**
 * A timestamp `days` from now (for next_action_at scheduling).
 */
function scheduleFromNow(days, now = new Date()) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

module.exports = { stepContent, nextStep, stepDueInDays, scheduleFromNow };
