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
 *   v1.12.1 (owner direction): the repositioning is a WORDING change only.
 *   Every link and flow the homepage had in v1.11.0 (login, provider apply,
 *   provider directory, research, licenses, accessibility, in-page anchors)
 *   must keep working. The non-submitting preview interest forms are
 *   removed; the conversion CTAs point at the existing working pages.
 *
 *   v1.12.2 (owner direction): the hero disclaimer is removed, and the
 *   provider section reverts to its v1.11.0 wording ("Are You a Healthcare
 *   Provider?", three benefits, Join Our Network / Browse Provider
 *   Directory). The "in development" capabilities panel is removed.
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
    'Technology that understands healthcare financing',
    'PaySick combines healthcare-specific workflows, affordability assessment, credit decisioning and financial infrastructure into a single experience. Our goal is to finance earlier medical intervention while building evidence of its financial and clinical impact.',
    'Built by Tech & Artery',
    'PaySick is a healthcare financing platform developed by Tech & Artery (Pty) Ltd. We are building technology that connects patients and healthcare providers through responsible, transparent financing experiences.',
    'Better access to healthcare.',
    "Be part of what we're building",
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

  test('hero keeps the sign-in entry point and adds the approved CTAs', () => {
    const hero = section(html, 'top');
    assert.match(hero, /<a href="login.html"[^>]*>/);
    assert.match(hero, /<a href="#how-it-works"[^>]*>\s*Explore how it works\s*<\/a>/);
    assert.match(hero, /<a href="#providers"[^>]*>\s*Partner with PaySick\s*<\/a>/);
  });

  test('provider section keeps the working apply and directory links', () => {
    const providers = section(html, 'providers');
    assert.match(providers, /<a href="provider-apply.html"[^>]*>\s*Join Our Network\s*<\/a>/);
    assert.match(providers, /<a href="providers.html"[^>]*>\s*Browse Provider Directory\s*<\/a>/);
  });

  test('final conversion section links to the working sign-in and provider pages', () => {
    const cta = section(html, 'start');
    assert.match(cta, /<a href="login.html"[^>]*>/);
    assert.match(cta, /<a href="provider-apply.html"[^>]*>\s*Become a provider partner\s*<\/a>/);
  });

  test('provider section uses the original v1.11.0 wording', () => {
    const providers = visibleText(section(html, 'providers'));
    for (const phrase of [
      'Are You a Healthcare Provider?',
      'Join our growing healthcare payment network. Get paid reliably, expand patient access, and eliminate payment collection burden for your practice.',
      '24-hour settlements - No more 30-90 day waits',
      "Grow your patient base - Access patients who couldn't afford care",
      'Zero collection burden - We handle patient payment management',
    ]) {
      assert.ok(providers.includes(phrase), `missing: ${phrase}`);
    }
  });

  test('provider section has no "in development" capabilities panel', () => {
    const providers = visibleText(section(html, 'providers'));
    assert.doesNotMatch(providers, /in development|Proposed capabilities|Patient referral experience/i);
  });

  test('hero has no availability disclaimer', () => {
    const hero = visibleText(section(html, 'top'));
    assert.doesNotMatch(hero, /Credit is not currently available|Read our Terms/);
  });

  test('footer links: About, How it works, For providers, Contact, Privacy, Terms', () => {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/i)[0];
    const links = [
      ['#about', 'About'],
      ['#how-it-works', 'How it works'],
      ['providers.html', 'For providers'],
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
    /nationwide/i,
    /immediate access/i,
    /3[- ]month|three (equal|easy) monthly/i,
    /verified in minutes/i,
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


  test('no rates, fees or rand repayment examples', () => {
    assert.doesNotMatch(text, /\bR\s?\d[\d,]*/);
    assert.doesNotMatch(text, /\d+(\.\d+)?\s?%/);
  });

  test('does not claim proven clinical outcomes', () => {
    assert.doesNotMatch(text, /proven (clinical )?outcomes|clinically proven/i);
  });
});

// ─── Links and flows keep working as in v1.11.0 ──────────────────────────────

describe('index.html keeps every existing link working', () => {
  const previous = read('code-backups/v1.11.0/snapshot/index.html');
  const hrefs = (src) => new Set([...src.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]));
  const before = hrefs(previous);
  const after = hrefs(html);

  for (const href of before) {
    test(`still links to ${href}`, () => {
      assert.ok(after.has(href), `link to ${href} was dropped`);
    });
  }

  test('every page it links to exists', () => {
    for (const href of after) {
      if (/^(#|mailto:|https?:|\/api\/)/.test(href)) continue;
      const file = href.split('#')[0];
      assert.ok(fs.existsSync(path.join(REPO_ROOT, file)), `${href} does not exist`);
    }
  });

  test('every in-page anchor has a target', () => {
    for (const href of after) {
      if (!href.startsWith('#')) continue;
      assert.match(html, new RegExp(`id="${href.slice(1)}"`), `${href} has no target`);
    }
  });

  test('main nav keeps How it works, Features, providers directory, About and sign-in', () => {
    const nav = html.match(/<ul id="nav-links">[\s\S]*?<\/ul>/)[0];
    for (const href of ['#how-it-works', '#features', 'providers.html', '#about', 'login.html']) {
      assert.ok(nav.includes(`href="${href}"`), `nav lost ${href}`);
    }
  });

  test('no non-submitting preview forms on the homepage', () => {
    // The Care Agent search bar is a real form: it navigates to care-agent.html.
    const withoutAgentSearch = html.replace(/<form class="agent-search"[\s\S]*?<\/form>/, '');
    assert.doesNotMatch(withoutAgentSearch, /<form/);
    assert.doesNotMatch(html, /interest-forms\.js/);
    assert.equal(fs.existsSync(path.join(REPO_ROOT, 'js/interest-forms.js')), false);
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
