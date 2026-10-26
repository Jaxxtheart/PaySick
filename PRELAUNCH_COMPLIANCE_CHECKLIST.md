# Pre-production legal & compliance approval checklist — homepage repositioning (v1.12.0)

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

## Interest forms and data protection (POPIA)
- [ ] Owner decides how interest is registered. The forms currently send
      nothing (`SUBMISSION_ENDPOINT = null`) and point visitors to
      hello@paysick.co.za. Choose one: (a) keep it this way, (b) approve a
      mailto fallback, or (c) approve a backend endpoint. Option (c) needs a
      new API route, built test-first, with rate limiting and spam
      protection.
- [ ] Counsel approves the purpose statements next to each form.
- [ ] If any data will be collected, update `privacy-policy.html`. It still
      names "PaySick South Africa (Pty) Ltd", and it must cover the purpose,
      retention, the Information Officer, and opt-out for the interest list
      and the provider enquiry.
- [ ] Confirm the hello@paysick.co.za mailbox is monitored, and that emailed
      interest is handled under POPIA.

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
