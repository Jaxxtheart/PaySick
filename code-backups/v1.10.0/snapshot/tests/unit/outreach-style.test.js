/**
 * Unit Tests - Outreach house style: no em dashes, register-first call to action
 * Node.js built-in test runner (node:test + node:assert). No DB, no network.
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Two rules are locked here, both enforced in code rather than left to the LLM:
 *   1. No em dash (or en dash) may appear anywhere in an outreach message, from
 *      the subject line through the body and the LinkedIn variant.
 *   2. Every message carries ONE primary call to action: register as a provider
 *      on the PaySick website. The 15 minute demo is secondary, and anything the
 *      practice needs goes to hello@paysick.co.za.
 *
 * Run: node --test tests/unit/outreach-style.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  stripEmDashes,
  hasEmDash,
} = require('../../backend/src/services/outreach/style');

const {
  ensureRegistrationCta,
  hasRegistrationCta,
  registrationCtaText,
} = require('../../backend/src/services/outreach/cta');

const { stepContent } = require('../../backend/src/services/outreach/sequence.service');
const { complianceScan } = require('../../backend/src/services/outreach/compliance.service');
const {
  parseDraftJson,
  generateDraft,
  generateOnboardingReply,
  SYSTEM_PROMPT,
  ONBOARDING_SYSTEM_PROMPT,
} = require('../../backend/src/services/outreach/claude.service');
const {
  OUTREACH_CONFIG,
  registrationUrl,
} = require('../../backend/src/config/outreach.config');

const EM_DASH = '—';
const EN_DASH = '–';

// ─── stripEmDashes ───────────────────────────────────────────────────────────

describe('stripEmDashes', () => {
  test('detects em and en dashes', () => {
    assert.equal(hasEmDash(`Quick follow-up ${EM_DASH} Smile Dental`), true);
    assert.equal(hasEmDash(`Steps 1${EN_DASH}3`), true);
    assert.equal(hasEmDash('Quick follow-up for Smile Dental'), false);
  });

  test('replaces a spaced em dash with a comma', () => {
    const out = stripEmDashes(`You are paid in full ${EM_DASH} no chasing.`);
    assert.equal(hasEmDash(out), false);
    assert.equal(out, 'You are paid in full, no chasing.');
  });

  test('replaces an unspaced dash between words with a comma', () => {
    const out = stripEmDashes(`paid upfront${EM_DASH}always`);
    assert.equal(out, 'paid upfront, always');
  });

  test('turns a numeric en dash range into "to"', () => {
    assert.equal(stripEmDashes(`110${EN_DASH}150 words`), '110 to 150 words');
  });

  test('turns a line-leading dash bullet into a plain hyphen bullet', () => {
    const out = stripEmDashes(`Benefits:\n${EM_DASH} paid in full\n${EM_DASH} no admin`);
    assert.equal(hasEmDash(out), false);
    assert.equal(out, 'Benefits:\n- paid in full\n- no admin');
  });

  test('never leaves a dangling comma against punctuation or a line end', () => {
    assert.equal(stripEmDashes(`Paid in full ${EM_DASH}.`), 'Paid in full.');
    assert.equal(stripEmDashes(`Paid in full ${EM_DASH}\nNext line`), 'Paid in full\nNext line');
  });

  test('leaves ordinary hyphens and the rest of the copy untouched', () => {
    const text = 'A quick 15 minute follow-up call about e-mail opt-in.';
    assert.equal(stripEmDashes(text), text);
  });

  test('is idempotent and safe on empty input', () => {
    const once = stripEmDashes(`A ${EM_DASH} B ${EN_DASH} C`);
    assert.equal(stripEmDashes(once), once);
    assert.equal(stripEmDashes(''), '');
    assert.equal(stripEmDashes(null), '');
  });
});

// ─── Registration call to action ─────────────────────────────────────────────

describe('registration call to action', () => {
  test('the registration URL points at the provider sign-up page on the PaySick site', () => {
    const url = registrationUrl();
    assert.ok(url.startsWith('http'), 'registration URL must be absolute');
    assert.ok(url.includes(OUTREACH_CONFIG.providerRegistrationPath));
  });

  test('the CTA text leads with registering and mentions the demo second', () => {
    const cta = registrationCtaText();
    assert.ok(cta.includes(registrationUrl()), 'CTA must carry the registration link');
    assert.ok(cta.includes(OUTREACH_CONFIG.contactEmail));
    assert.ok(
      cta.toLowerCase().indexOf('register') < cta.toLowerCase().indexOf('demo'),
      'registering must come before the demo'
    );
    assert.equal(hasEmDash(cta), false);
    assert.deepEqual(complianceScan(cta), []);
  });

  test('appends the CTA when a message is missing it, above the sign-off', () => {
    const body = 'Hi,\n\nYou are paid in full within 24 hours.\n\nBest,\nThe PaySick Team';
    assert.equal(hasRegistrationCta(body), false);
    const out = ensureRegistrationCta(body);
    assert.equal(hasRegistrationCta(out), true);
    assert.ok(out.includes(registrationUrl()));
    assert.ok(out.includes(OUTREACH_CONFIG.contactEmail));
    assert.ok(out.trimEnd().endsWith('Best,\nThe PaySick Team'), 'sign-off must stay last');
    assert.ok(
      out.indexOf(registrationUrl()) < out.indexOf('Best,\nThe PaySick Team'),
      'the CTA must sit above the sign-off'
    );
  });

  test('does not duplicate a CTA that is already present', () => {
    const once = ensureRegistrationCta('Hi,\n\nShort note.');
    const twice = ensureRegistrationCta(once);
    assert.equal(once, twice);
    const occurrences = twice.split(registrationUrl()).length - 1;
    assert.equal(occurrences, 1);
  });

  test('the short variant fits a LinkedIn DM and still leads with registering', () => {
    const out = ensureRegistrationCta('Quick note about PaySick.', { short: true });
    assert.ok(out.includes(registrationUrl()));
    assert.ok(out.includes(OUTREACH_CONFIG.contactEmail));
    assert.equal(hasEmDash(out), false);
  });

  test('no punctuation is glued to the end of the link, in either variant', () => {
    // A trailing "." or "," gets swallowed into the href by mail and DM clients,
    // which breaks the one link the whole message exists to deliver.
    const url = registrationUrl();
    for (const variant of [{}, { short: true }]) {
      const out = ensureRegistrationCta('Quick note about PaySick.', variant);
      const after = out.slice(out.indexOf(url) + url.length, out.indexOf(url) + url.length + 1);
      assert.ok(
        after === '' || /\s/.test(after),
        `expected whitespace or end of message after the link, got "${after}"`
      );
    }
  });
});

// ─── Follow-up sequence copy ─────────────────────────────────────────────────

describe('follow-up sequence copy', () => {
  for (const step of [1, 2, 3]) {
    test(`step ${step} carries the registration CTA, no em dash, clean terminology`, () => {
      const c = stepContent(step, 'Smile Dental');
      assert.ok(c, `expected copy for step ${step}`);

      for (const [field, value] of Object.entries(c)) {
        assert.equal(hasEmDash(value), false, `step ${step} ${field} must contain no em dash`);
        assert.deepEqual(complianceScan(value), [], `step ${step} ${field} must be compliant`);
      }

      assert.equal(hasRegistrationCta(c.email_body), true, `step ${step} email must ask them to register`);
      assert.equal(hasRegistrationCta(c.linkedin_dm), true, `step ${step} DM must ask them to register`);
      assert.ok(c.email_body.includes(OUTREACH_CONFIG.contactEmail));
      assert.ok(c.email_body.trimEnd().endsWith('Best,\nThe PaySick Team'));
    });
  }

  test('the demo is secondary: registering is mentioned before any demo offer', () => {
    for (const step of [1, 2, 3]) {
      const body = stepContent(step, 'Smile Dental').email_body.toLowerCase();
      const demoIdx = body.indexOf('demo');
      if (demoIdx === -1) continue;
      assert.ok(
        body.indexOf('register') !== -1 && body.indexOf('register') < demoIdx,
        `step ${step}: registering must be offered before the demo`
      );
    }
  });
});

// ─── Claude drafting ─────────────────────────────────────────────────────────

function fakeFetch(payload) {
  return async () => ({
    ok: true,
    async json() {
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  });
}

describe('Claude drafting obeys the house style', () => {
  test('the system prompt bans em dashes and makes registering the primary CTA', () => {
    assert.match(SYSTEM_PROMPT, /em dash/i);
    assert.match(SYSTEM_PROMPT, /register/i);
    assert.ok(SYSTEM_PROMPT.includes(OUTREACH_CONFIG.contactEmail));
    assert.equal(hasEmDash(SYSTEM_PROMPT), false, 'the prompt itself must model the rule');
    assert.equal(hasEmDash(ONBOARDING_SYSTEM_PROMPT), false);
    assert.match(ONBOARDING_SYSTEM_PROMPT, /register/i);
  });

  test('parseDraftJson strips em dashes from subject, body and DM', () => {
    const parsed = parseDraftJson(
      JSON.stringify({
        subject: `Paid in full ${EM_DASH} Smile Dental`,
        email_body: `Hi,\n\nYou are paid in full ${EM_DASH} within 24 hours.`,
        linkedin_dm: `Paid upfront ${EM_DASH} patients pay monthly.`,
      })
    );
    assert.equal(hasEmDash(parsed.subject), false);
    assert.equal(hasEmDash(parsed.email_body), false);
    assert.equal(hasEmDash(parsed.linkedin_dm), false);
  });

  test('generateDraft forces the registration CTA in when the model leaves it out', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const draft = await generateDraft(
      { practice_name: 'Smile Dental', vertical: 'dental', metro: 'Cape Town' },
      {
        fetchImpl: fakeFetch({
          subject: `A note for Smile Dental ${EM_DASH} paid in full`,
          email_body: 'Hi,\n\nYou are paid in full within 24 hours.\n\nBest,\nThe PaySick Team',
          linkedin_dm: 'Paid in full within 24 hours. Worth a look?',
        }),
      }
    );

    assert.equal(hasEmDash(draft.subject), false);
    assert.equal(hasEmDash(draft.email_body), false);
    assert.equal(hasEmDash(draft.linkedin_dm), false);
    assert.equal(hasRegistrationCta(draft.email_body), true);
    assert.equal(hasRegistrationCta(draft.linkedin_dm), true);
    assert.ok(draft.email_body.includes(OUTREACH_CONFIG.contactEmail));
    assert.ok(draft.email_body.trimEnd().endsWith('Best,\nThe PaySick Team'));
  });

  test('generateOnboardingReply keeps the registration link and drops em dashes', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const reply = await generateOnboardingReply(
      { practice_name: 'Smile Dental', vertical: 'dental', metro: 'Durban' },
      'Sounds interesting, tell me more.',
      {
        fetchImpl: fakeFetch({
          subject: `Great to hear from you ${EM_DASH} Smile Dental`,
          email_body: `Thanks for coming back to us ${EM_DASH} here is how it works.`,
        }),
      }
    );

    assert.equal(hasEmDash(reply.subject), false);
    assert.equal(hasEmDash(reply.email_body), false);
    assert.equal(hasRegistrationCta(reply.email_body), true);
    assert.ok(reply.email_body.includes(OUTREACH_CONFIG.contactEmail));
  });
});
