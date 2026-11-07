# Pre-production legal & compliance approval checklist — homepage repositioning (v1.17.0)

Each item needs sign-off from the business owner and South African legal
counsel before v1.12.0 is deployed to production. Nothing below has been
assumed complete.

## Homepage copy and disclosures (`index.html`)
- [ ] Counsel approves the full homepage copy, including the hero disclosure:
      "Healthcare financing services are in development. Credit is not
      currently available through this website."
- [ ] Counsel confirms that the future-tense wording in "How it will work" and
      "Access care and repay over time" (which mentions "agreed credit terms")
      is not a credit advertisement that needs NCA advertising disclosures
      before launch.
- [ ] Counsel confirms the provider-capability wording ("digital affordability
      and credit decisioning", "settlement workflows") does not imply that
      PaySick has current authorisation.
- [ ] Owner confirms the statement "developed by Tech & Artery (Pty) Ltd"
      (registered name and registration details) is accurate.
- [ ] Owner confirms that no proposed lending entity or brand appears anywhere
      on the public site.

## Terms of Service (`terms-of-service.html`)
- [ ] Counsel reviews and finalises the "Credit services and regulatory
      status" section (dated 26 October 2026, currently marked as a draft).
- [ ] Counsel rewrites or suspends the remaining Terms body. Eligibility, the
      R500–R10,000 limits, fees, debit order authority and default terms all
      still describe the earlier payment-facilitation service in the present
      tense.
- [ ] Counsel confirms the change of operator from "PaySick South Africa (Pty)
      Ltd" to "Tech & Artery (Pty) Ltd", and the IP ownership statement.
- [ ] Counsel confirms that removing "PaySick is not a credit provider … not
      regulated by the NCR" is appropriate.

## Owner-directed reversals (v1.12.2) — counsel to confirm
- [ ] The hero disclaimer ("Healthcare financing services are in development.
      Credit is not currently available through this website.") was removed
      at the owner's direction. The footer disclaimer and the
      not-a-credit-application notice near the final CTA remain. Counsel
      should confirm these are prominent enough next to "Get Started".
- [ ] The provider section reverted to its v1.11.0 wording at the owner's
      direction. It again claims "24-hour settlements", "Zero collection
      burden — we handle patient payment management" and a "growing
      healthcare payment network". The owner should either provide evidence
      for these claims or counsel should approve them before production.

## PaySick Care Agent (v1.13.0)
- [ ] Counsel reviews the Care Agent journey (`care-agent.html`). It
      presents term options ("N-month plan · total R… · 0% interest"),
      runs the Shield affordability check, and hands off to the live
      marketplace application. Confirm this is acceptable before launch,
      alongside the homepage disclosures.
- [ ] Counsel reviews the updated `privacy-policy.html` (v1.4, 26 October
      2026), drafted in v1.17.0. It adds:
      - section 4A on the Care Agent
      - Care Agent health information under special personal information
      - Anthropic as an operator and a cross-border recipient
      - a Care Agent retention row
      - the registration number K2015/346764/07

      The Care Agent page now has a notice under the message box linking
      to it.
- [ ] Owner confirms a data processing agreement with Anthropic is in place
      before publication. The policy says Anthropic acts as our operator,
      as it does for Vercel and Neon.
- [ ] Owner decides how to enforce the Care Agent retention row ("3 years
      from last activity, then deleted"). There is no automated deletion
      job yet for the `care_agent_*` tables.
- [ ] Counsel reviews the policy's existing "Non-Credit Liability Notice"
      and "payment facilitation platform" wording. It predates the
      healthcare-financing repositioning and is unchanged.
- [ ] Counsel confirms the consent basis for health information shared in
      the Care Agent. Right now the only consent checkbox is at the final
      approval step; earlier messages rely on the notice under the
      message box.
- [ ] Owner sets `ANTHROPIC_API_KEY` in production (otherwise the
      deterministic engine is used) and runs migration `012_care_agent.sql`.
- [ ] Owner runs migration `013_care_agent_actions.sql` (v1.18.0) after
      `012`, `007` (manual_review_queue) and `010` (promise_to_pay).
- [ ] Staff process for the new `CARE_AGENT_*` review types in
      `manual_review_queue` (date change, restructure, hardship 8h,
      dispute, plan adjustment, cancellation), including setting the
      matching `care_agent_manage_requests.status` so the patient sees the
      outcome.
- [ ] Legal review of the Care Agent's in-chat payment consent wording
      ("I authorise PaySick to collect R… now") against the debit order
      mandate.

## Homepage links into live flows (owner decision, v1.12.1)
- [ ] Per owner direction, the homepage keeps its existing links to
      `login.html` ("Get Started"), `provider-apply.html` and `providers.html`,
      alongside the footer disclosure. Counsel
      should confirm that this combination does not imply that credit is
      available, and that the downstream pages (registration, onboarding,
      marketplace application, provider application with banking details)
      are acceptable to run before launch.
- [ ] `privacy-policy.html` still names "PaySick South Africa (Pty) Ltd".
      Align it with Tech & Artery (Pty) Ltd if counsel agrees.

## Rest of the public site (not changed in v1.12.0)
- [ ] Decide what to do with pages that still describe a live product and are
      reachable by URL: `about.html`, `providers.html`, `provider-apply.html`
      (which collects banking details), `register.html`, `login.html`,
      `onboarding.html`, `marketplace-apply.html`, `marketplace-offers.html`,
      `investor-deck.html`, `contact.html`. Options: gate them, add noindex
      plus a prelaunch banner, or rewrite them.
- [ ] Fix `contact.html`. It shows a success message even when `/api/contact`
      fails, and that route does not exist (false confirmation).
- [ ] Review `research.html` and `licenses.html` for wording about "payment
      facilitation" and the entity name.

## Before any credit goes live
- [ ] Get NCR registration (where required) for the entity that will provide
      credit, and verify the registration details before publishing any of
      them.
- [ ] Reassess the whole site. Add the NCA-required advertising and
      pre-agreement disclosures to live credit pages, and do not rely only
      on the Terms page.
