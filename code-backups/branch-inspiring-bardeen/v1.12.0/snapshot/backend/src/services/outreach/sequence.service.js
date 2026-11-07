'use strict';

/**
 * FOLLOW-UP SEQUENCE (§6.4)
 *
 * Step 0 — day 0:  initial outreach (email + LinkedIn)
 * Step 1 — day 3:  short bump, re-anchor on "paid in full, patients who'd say no"
 * Step 2 — day 7:  value add — founding-provider offer
 * Step 3 — day 14: polite breakup
 *
 * Any inbound reply halts the sequence (lead -> replied); a lead marked `replied`
 * never advances. The copy here is deterministic and pre-vetted (no denied terms),
 * but it still passes through the terminology linter before queuing, like any draft.
 */

const { OUTREACH_CONFIG } = require('../../config/outreach.config');
const { normalizeSignoff } = require('./signoff');

/**
 * Follow-up copy per step, with the canonical "Best, The PaySick Team" sign-off
 * enforced on both the email and the LinkedIn variant.
 */
function stepContent(step, practiceName) {
  const c = rawStepContent(step, practiceName);
  if (!c) return null;
  return {
    subject: c.subject,
    email_body: normalizeSignoff(c.email_body),
    linkedin_dm: normalizeSignoff(c.linkedin_dm),
  };
}

/**
 * Templated follow-up copy per step. `{name}` is the practice name.
 * Sign-offs are applied by stepContent(), so templates end on the message body.
 */
function rawStepContent(step, practiceName) {
  const name = practiceName || 'your practice';
  switch (step) {
    case 1:
      return {
        subject: `Quick follow-up — ${name}`,
        email_body:
          `Hi again,\n\nJust circling back. The core of it: with PaySick you're paid in full within 24 hours, ` +
          `while patients who might otherwise say no to a lump-sum price go ahead and pay in affordable monthly instalments.\n\n` +
          `Worth a 15-minute look? Happy to work around your schedule.`,
        linkedin_dm:
          `Following up — PaySick pays ${name} in full within 24 hours while patients pay over time in instalments. ` +
          `Open to a quick 15-min demo?`,
      };
    case 2:
      return {
        subject: `A founding-partner offer for ${name}`,
        email_body:
          `Hi,\n\nWe're bringing on a first cohort of practices as founding partners — a reduced facilitation fee ` +
          `for an introductory period and "founding partner" status.\n\nYou'd be paid in full, upfront; patients pay ` +
          `in affordable monthly instalments; we carry everything in between. Shall I hold a spot and walk you through it in 15 minutes?`,
        linkedin_dm:
          `We're onboarding a founding cohort (reduced facilitation fee for an intro period). Would ${name} like a spot? Quick 15-min demo to explain.`,
      };
    case 3:
      return {
        subject: `I'll close this off — ${name}`,
        email_body:
          `Hi,\n\nI don't want to crowd your inbox, so I'll leave it here. If being paid in full within 24 hours while ` +
          `your patients pay in affordable monthly instalments is ever useful, just reply and I'll pick it straight back up.`,
        linkedin_dm:
          `I'll close this off for now — reply anytime and I'll pick it straight back up. All the best to ${name}.`,
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
