'use strict';

/**
 * Unit Tests — Homepage repositioning (prelaunch healthcare financing)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Background:
 *   The homepage sold a live "Heal now, pay later" product: "Get Started"
 *   CTAs into login, "Instant Setup", "24-hour settlements", a "nationwide"
 *   provider network and fixed 3-month terms. None of that is live or
 *   evidenced. The homepage is being repositioned as a healthcare financing
 *   platform IN DEVELOPMENT, developed by Tech & Artery (Pty) Ltd, with:
 *     - the approved hero / value / how-it-will-work / provider / technology /
 *       about / final-conversion / footer copy
 *     - a short, prominent "credit is not currently available" disclosure
 *       next to the hero and the interest forms
 *     - non-credit interest forms (patient: name + email; provider: practice,
 *       contact, business email, optional phone) that collect no underwriting
 *       data and never pretend a submission succeeded (no approved backend
 *       exists yet)
 *     - detailed NCR / National Credit Act status moved to Terms of Service
 *       only, never on the homepage
 *
 * Run: node --test tests/unit/homepage-repositioning.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
}

// Visible text only: drop <style>/<script>/comments and tags, decode the few
// entities the page uses, collapse whitespace.
function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#39;|&apos;/g, "'")
    .replace(/&copy;/g, '©')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ');
}

function section(html, id) {
  const re = new RegExp(`<(section|footer)[^>]*id="${id}"[\\s\\S]*?<\\/\\1>`, 'i');
  const m = html.match(re);
  assert.ok(m, `expected a <section id="${id}">`);
  return m[0];
}

const html = read('index.html');
const text = visibleText(html);

// ─── Metadata describes a platform in development ────────────────────────────

describe('index.html metadata', () => {
  test('title describes healthcare financing, not "Heal Now, Pay Later"', () => {
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)[1];
    assert.match(title, /healthcare financing/i);
    assert.doesNotMatch(title, /heal now|pay later/i);
  });

  test('meta description says the platform is in development', () => {
    const desc = html.match(/<meta name="description" content="([^"]*)"/i)[1];
    assert.match(desc, /in development/i);
    assert.match(desc, /Tech &amp; Artery|Tech & Artery/);
  });

  test('has Open Graph title, description, type and url', () => {
    for (const prop of ['og:title', 'og:description', 'og:type', 'og:url']) {
      assert.match(html, new RegExp(`<meta property="${prop}" content="[^"]+"`), prop);
    }
    const ogDesc = html.match(/<meta property="og:description" content="([^"]*)"/)[1];
    assert.match(ogDesc, /in development/i);
  });

  test('has JSON-LD structured data naming Tech & Artery as the developer', () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(m, 'expected a JSON-LD block');
    const data = JSON.parse(m[1]);
    const json = JSON.stringify(data);
    assert.match(json, /Tech & Artery \(Pty\) Ltd/);
    assert.match(json, /in development/i);
    assert.doesNotMatch(json, /licen[sc]ed|registered credit provider|NCR/i);
  });
});

// ─── Approved copy is present ────────────────────────────────────────────────

describe('index.html approved copy', () => {
  const required = [
    'HEALTHCARE FINANCING, BUILT AROUND YOU',
    'Get the care you need. Find a way to pay.',
    "Healthcare costs shouldn't be the reason you delay treatment. PaySick is building a simpler way to finance healthcare, connecting patients and healthcare providers through transparent, responsible financing.",
    'Explore how it works',
    'Partner with PaySick',
    'Healthcare financing services are in development. Credit is not currently available through this website.',
    'Better access to healthcare starts with affordability.',
    "Medical expenses don't always arrive when your finances are ready. PaySick is designed to help patients explore financing options that consider their circumstances, the cost of treatment and their ability to repay.",
    'Responsible by design',
    'Financing should be based on verified affordability, not simply how much someone wants to borrow.',
    'Clear from the beginning',
    'Understand the proposed repayment amount, duration and total cost before making a commitment.',
    'Built for healthcare',
    'A financing experience designed around medical treatment, healthcare providers and patient needs.',
    'Tell us about your treatment',
    "Share the healthcare procedure you're considering and the estimated cost.",
    'Understand your affordability',
    'Our proposed assessment process considers verified income, existing financial commitments and reasonable living expenses.',
    'Review your financing options',
    'Where eligible, review the proposed loan amount, repayment terms and total cost before deciding whether to proceed.',
    'Access care and repay over time',
    'Once financing is approved and the service is operational, payment can be arranged with a participating provider, with repayments made according to the agreed credit terms.',
    'All financing will be subject to eligibility, affordability assessment, applicable credit law and the availability of the service.',
    'Help more patients move forward with treatment.',
    'Patients sometimes postpone care because they cannot cover the full cost upfront. PaySick is developing a financing solution that healthcare providers can integrate into their patient journey, helping eligible patients consider manageable repayment options.',
    "Register your practice's interest",
    'Technology that understands healthcare financing',
    'PaySick combines healthcare-specific workflows, affordability assessment, credit decisioning and financial infrastructure into a single experience. Our goal is to finance earlier medical intervention while building evidence of its financial and clinical impact.',
    'Built by Tech & Artery',
    'PaySick is a healthcare financing platform developed by Tech & Artery (Pty) Ltd. We are building technology that connects patients and healthcare providers through responsible, transparent financing experiences.',
    'Better access to healthcare.',
    "Be part of what we're building",
    'Join the interest list',
    'Become a provider partner',
    'Registering interest is not a credit application, financing offer or guarantee of approval.',
    'PaySick | A Tech & Artery venture',
    'PaySick is a healthcare financing platform in development. Financing is not currently available through this website. See our Terms of Service for important information.',
    '© 2026 Tech & Artery (Pty) Ltd. All rights reserved.',
  ];

  for (const phrase of required) {
    test(`contains: ${phrase.slice(0, 60)}`, () => {
      assert.ok(text.includes(phrase), `missing approved copy: "${phrase}"`);
    });
  }

  test('hero CTAs scroll to the explainer and the provider form', () => {
    const hero = section(html, 'top');
    assert.match(hero, /<a href="#how-it-works"[^>]*>\s*Explore how it works\s*<\/a>/);
    assert.match(hero, /<a href="#provider-interest"[^>]*>\s*Partner with PaySick\s*<\/a>/);
  });

  test('provider capabilities are listed and labelled as in development', () => {
    const providers = visibleText(section(html, 'providers'));
    for (const cap of [
      'Patient referral experience',
      'Digital affordability and credit decisioning',
      'Treatment financing and settlement workflows',
      'Repayment servicing and account management',
    ]) {
      assert.ok(providers.includes(cap), `missing capability: ${cap}`);
    }
    assert.match(providers, /in development/i);
  });

  test('footer links: About, How it works, For providers, Contact, Privacy, Terms', () => {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/i)[0];
    const links = [
      ['#about', 'About'],
      ['#how-it-works', 'How it works'],
      ['#providers', 'For providers'],
      ['contact.html', 'Contact'],
      ['privacy-policy.html', 'Privacy'],
      ['terms-of-service.html', 'Terms'],
    ];
    for (const [href, label] of links) {
      assert.match(footer, new RegExp(`<a href="${href}"[^>]*>\\s*${label}\\s*</a>`), label);
    }
  });
});

// ─── No live-credit, unsupported or regulator-specific claims ────────────────

describe('index.html makes no live-credit or unsupported claims', () => {
  const banned = [
    /heal now/i,
    /pay later/i,
    /licen[sc]ed lender/i,
    /apply now/i,
    /get approved/i,
    /instant credit/i,
    /guaranteed financing/i,
    /instant setup/i,
    /24[- ]hour/i,
    /nationwide/i,
    /immediate access/i,
    /3[- ]month|three (equal|easy) monthly/i,
    /get started/i,
    /verified in minutes/i,
    /zero collection burden/i,
    /approval rate/i,
  ];
  for (const re of banned) {
    test(`does not say ${re}`, () => {
      assert.doesNotMatch(text, re);
    });
  }

  test('no NCR / National Credit Act detail on the homepage', () => {
    assert.doesNotMatch(html, /\bNCR\b|National Credit (Regulator|Act)/i);
  });

  test('no links into live credit / login / provider-onboarding flows', () => {
    for (const href of ['login.html', 'register.html', 'marketplace-apply.html', 'provider-apply.html', 'onboarding.html']) {
      assert.ok(!html.includes(`href="${href}"`), `homepage still links to ${href}`);
    }
  });

  test('no rates, fees or rand repayment examples', () => {
    assert.doesNotMatch(text, /\bR\s?\d[\d,]*/);
    assert.doesNotMatch(text, /\d+(\.\d+)?\s?%/);
  });

  test('does not claim proven clinical outcomes', () => {
    assert.doesNotMatch(text, /proven (clinical )?outcomes|clinically proven/i);
  });
});

// ─── Interest forms: minimal data, spam protection, honest submission ────────

describe('index.html interest forms', () => {
  function form(id) {
    const m = html.match(new RegExp(`<form[^>]*id="${id}"[\\s\\S]*?<\\/form>`));
    assert.ok(m, `expected <form id="${id}">`);
    return m[0];
  }
  function fieldNames(formHtml) {
    return [...formHtml.matchAll(/<(?:input|select|textarea)[^>]*name="([^"]+)"/g)].map((m) => m[1]);
  }

  test('patient form collects name and email only (plus spam trap)', () => {
    const names = fieldNames(form('patient-interest-form')).filter((n) => n !== 'website');
    assert.deepEqual(names.sort(), ['email', 'name']);
  });

  test('provider form collects practice, contact, business email and optional phone', () => {
    const f = form('provider-interest-form');
    const names = fieldNames(f).filter((n) => n !== 'website');
    assert.deepEqual(names.sort(), ['business_email', 'contact_name', 'phone', 'practice_name']);
    assert.match(f, /<input[^>]*name="practice_name"[^>]*required/);
    assert.match(f, /<input[^>]*name="contact_name"[^>]*required/);
    assert.match(f, /<input[^>]*name="business_email"[^>]*required/);
    assert.doesNotMatch(f.match(/<input[^>]*name="phone"[^>]*>/)[0], /required/);
  });

  test('neither form asks for underwriting or health data', () => {
    const both = form('patient-interest-form') + form('provider-interest-form');
    assert.doesNotMatch(both, /id[_ ]?number|identity number|bank|payslip|salary|income|treatment|condition|diagnosis|bureau|credit check|date of birth/i);
  });

  test('each form has a hidden honeypot field for spam protection', () => {
    for (const id of ['patient-interest-form', 'provider-interest-form']) {
      const f = form(id);
      assert.match(f, /name="website"[^>]*tabindex="-1"[^>]*autocomplete="off"/, id);
    }
  });

  test('each form carries the not-a-credit-application notice, privacy and terms links', () => {
    for (const id of ['patient-interest-form', 'provider-interest-form']) {
      const f = form(id);
      const t = visibleText(f);
      assert.ok(t.includes('Registering interest is not a credit application, financing offer or guarantee of approval.'), id);
      assert.match(f, /href="privacy-policy.html"/, id);
      assert.match(f, /href="terms-of-service.html(#[\w-]+)?"/, id);
    }
  });

  test('loads the interest-form script and does not post anywhere itself', () => {
    assert.match(html, /<script src="js\/interest-forms\.js"><\/script>/);
    assert.doesNotMatch(html, /fetch\(/);
    assert.doesNotMatch(html, /<form[^>]*action=/);
  });
});

// ─── js/interest-forms.js behaviour ──────────────────────────────────────────

describe('js/interest-forms.js', () => {
  const forms = require(path.join(REPO_ROOT, 'js/interest-forms.js'));

  test('validates the patient form: name and a valid email required', () => {
    assert.deepEqual(forms.validatePatient({ name: 'Thandi', email: 'thandi@example.co.za' }), {});
    const errs = forms.validatePatient({ name: ' ', email: 'not-an-email' });
    assert.ok(errs.name);
    assert.ok(errs.email);
  });

  test('validates the provider form: phone optional but must look like a phone if given', () => {
    const ok = { practice_name: 'Rondebosch Dental', contact_name: 'Dr N. Mokoena', business_email: 'admin@rdental.co.za', phone: '' };
    assert.deepEqual(forms.validateProvider(ok), {});
    const errs = forms.validateProvider({ practice_name: '', contact_name: '', business_email: 'x', phone: 'abc' });
    assert.ok(errs.practice_name);
    assert.ok(errs.contact_name);
    assert.ok(errs.business_email);
    assert.ok(errs.phone);
  });

  test('rejects over-long values', () => {
    const errs = forms.validatePatient({ name: 'a'.repeat(201), email: 'a@b.co' });
    assert.ok(errs.name);
  });

  test('a filled honeypot is treated as spam', () => {
    assert.equal(forms.isSpam({ website: 'http://spam.example' }), true);
    assert.equal(forms.isSpam({ website: '' }), false);
  });

  test('no backend is configured, so submission is never reported as successful', () => {
    assert.equal(forms.SUBMISSION_ENDPOINT, null);
    const result = forms.submissionOutcome({ name: 'Thandi', email: 'thandi@example.co.za' });
    assert.equal(result.submitted, false);
    assert.doesNotMatch(result.message, /thank you|success|received|registered|we('| wi)ll be in touch/i);
    assert.match(result.message, /not (yet )?open|not been sent|has not been submitted/i);
  });
});

// ─── Terms of Service carries the detailed regulatory status ─────────────────

describe('terms-of-service.html credit services and regulatory status', () => {
  const terms = read('terms-of-service.html');
  const termsText = visibleText(terms);

  test('has a "Credit services and regulatory status" section', () => {
    assert.match(terms, /<h2[^>]*id="credit-status"[^>]*>[^<]*Credit services and regulatory status<\/h2>/);
  });

  test('section is dated, explains no credit is offered, and is conditional on NCR registration', () => {
    const m = terms.match(/id="credit-status"[\s\S]*?(?=<h2)/);
    assert.ok(m);
    const s = visibleText(m[0]);
    assert.match(s, /26 October 2026/);
    assert.match(s, /in development/i);
    assert.match(s, /no credit is currently offered/i);
    assert.match(s, /applications? (are|is) not (currently )?accepted/i);
    assert.match(s, /National Credit Regulator \(NCR\)/);
    assert.match(s, /National Credit Act/);
  });

  test('does not claim registration, a filed application, or a registration number', () => {
    assert.doesNotMatch(termsText, /registered (credit provider|with the (NCR|National Credit Regulator))/i);
    assert.doesNotMatch(termsText, /NCRCP\d*|registration number/i);
    assert.doesNotMatch(termsText, /application (has been|was) (filed|submitted|lodged)/i);
  });

  test('identifies Tech & Artery (Pty) Ltd as the website operator', () => {
    assert.match(termsText, /operated by Tech & Artery \(Pty\) Ltd/);
  });

  test('is linked from the table of contents', () => {
    assert.match(terms, /<a href="#credit-status">/);
  });
});
