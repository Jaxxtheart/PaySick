/**
 * Unit Tests — Kehr harness building blocks (v1.21.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 *   consent.service.js            one revocable consent per data source
 *   document-crosscheck.service.js  documents checked against each other
 *   plan-link.service.js          signed, expiring, phone-bound provider links
 *   medical-scheme.adapter.js     scheme cover and pre-auth (mock)
 *   identity-verification.adapter.js  ID + liveness via a KYC partner (mock)
 *   debicheck.adapter.js          Tech & Artery as creditor, real-time (TT1)
 *                                 approval with a batch (TT2) fallback
 *
 * The adapters are mocks with a production swap point, the pattern the
 * repo already uses for income verification and DebiCheck.
 *
 * Run: node --test tests/unit/kehr-harness-services.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const consent = require('../../backend/src/services/consent.service');
const { crossCheckDocuments } = require('../../backend/src/services/document-crosscheck.service');
const planLink = require('../../backend/src/services/plan-link.service');
const scheme = require('../../backend/src/adapters/medical-scheme.adapter');
const identity = require('../../backend/src/adapters/identity-verification.adapter');
const debicheck = require('../../backend/src/adapters/debicheck.adapter');
const { luhnCheckDigit } = require('../../backend/src/utils/sa-id');

const NOW = new Date('2026-10-27T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const FIRST12 = '900101500908';
const VALID_ID = FIRST12 + luhnCheckDigit(FIRST12);

// ─────────────────────────────────────────────
// Consent wallet
// ─────────────────────────────────────────────
describe('consent.service', () => {
  test('every source states what is read, why, and whether it is special personal information', () => {
    for (const [source, def] of Object.entries(consent.CONSENT_SOURCES)) {
      assert.equal(typeof def.label, 'string', source);
      assert.equal(typeof def.purpose, 'string', source);
      assert.equal(typeof def.specialPersonalInformation, 'boolean', source);
      assert.equal(typeof def.optional, 'boolean', source);
    }
    assert.equal(consent.CONSENT_SOURCES.health_history.optional, true);
    assert.equal(consent.CONSENT_SOURCES.health_history.specialPersonalInformation, true);
    assert.equal(consent.CONSENT_SOURCES.scheme_cover.specialPersonalInformation, true);
    assert.ok(Object.isFrozen(consent.CONSENT_SOURCES));
  });

  test('declining health history is stated never to count against the patient', () => {
    assert.match(consent.CONSENT_SOURCES.health_history.purpose, /never counts against you/i);
  });

  test('a one-time read expires after its retention period; an ongoing one does not', () => {
    const once = consent.grantConsent({ source: 'bank_income_once', now: NOW });
    assert.equal(once.expiresAt, new Date(NOW.getTime() + consent.CONSENT_SOURCES.bank_income_once.retentionDays * DAY).toISOString());
    const sync = consent.grantConsent({ source: 'bank_payday_sync', now: NOW });
    assert.equal(sync.expiresAt, null);
  });

  test('a grant snapshots the exact purpose text the patient agreed to', () => {
    const g = consent.grantConsent({ source: 'bureau', now: NOW });
    assert.equal(g.purposeAgreed, consent.CONSENT_SOURCES.bureau.purpose);
  });

  test('refuses an unknown source', () => {
    assert.throws(() => consent.grantConsent({ source: 'contacts', now: NOW }), /Unknown consent source/);
  });

  test('withdrawn or expired consents are not active', () => {
    const g = consent.grantConsent({ source: 'bank_income_once', now: NOW });
    assert.equal(consent.isActive(g, NOW), true);
    assert.equal(consent.isActive(consent.withdrawConsent(g, NOW), NOW), false);
    assert.equal(consent.isActive(g, new Date(NOW.getTime() + 400 * DAY)), false);
  });

  test('pre-approval needs the bureau check and one income source; health history is never required', () => {
    assert.deepEqual(consent.missingFor('preapproval', [], NOW).sort(), ['bureau', 'income']);
    const have = [consent.grantConsent({ source: 'bureau', now: NOW }), consent.grantConsent({ source: 'document_upload', now: NOW })];
    assert.deepEqual(consent.missingFor('preapproval', have, NOW), []);
  });

  test('the patient view lists each consent with its plain label and status', () => {
    const view = consent.patientConsentView([consent.grantConsent({ source: 'bureau', now: NOW })], NOW);
    assert.deepEqual(Object.keys(view[0]).sort(), ['active', 'expiresAt', 'grantedAt', 'label', 'purpose', 'source']);
  });
});

// ─────────────────────────────────────────────
// Document cross-check
// ─────────────────────────────────────────────
describe('crossCheckDocuments', () => {
  const ident = { fullName: 'Thandi Grace Mokoena', idNumber: VALID_ID };
  const feed = {
    accountHolder: 'MS T G MOKOENA',
    salaryCredits: [{ amountCents: 1_820_000 }, { amountCents: 1_800_000 }, { amountCents: 1_810_000 }],
    debitOrdersCents: 400_000,
  };
  const payslip = { employeeName: 'T. Mokoena', idNumber: VALID_ID, netPayCents: 1_810_000, grossPayCents: 2_200_000 };

  test('consistent documents give a verified income and the method', () => {
    const r = crossCheckDocuments({ identity: ident, bankFeed: feed, payslip });
    assert.equal(r.consistent, true);
    assert.deepEqual(r.flags, []);
    assert.equal(r.verifiedMonthlyIncomeCents, 1_810_000);
    assert.equal(r.obligationsCents, 400_000);
    assert.equal(r.method, 'STITCH_OPEN_BANKING');
  });

  test('a payslip more than 10% away from the salary credits is flagged', () => {
    const r = crossCheckDocuments({ identity: ident, bankFeed: feed, payslip: { ...payslip, netPayCents: 2_400_000 } });
    assert.equal(r.consistent, false);
    assert.ok(r.flags.includes('PAYSLIP_BANK_MISMATCH'));
  });

  test('a surname that does not match the verified identity is flagged', () => {
    const r = crossCheckDocuments({ identity: ident, bankFeed: { ...feed, accountHolder: 'MR J SMITH' } });
    assert.ok(r.flags.includes('NAME_MISMATCH'));
  });

  test('an ID number on the payslip that differs is flagged', () => {
    const other = '850505500908';
    const r = crossCheckDocuments({ identity: ident, bankFeed: feed, payslip: { ...payslip, idNumber: other + luhnCheckDigit(other) } });
    assert.ok(r.flags.includes('ID_MISMATCH'));
  });

  test('an uploaded statement whose arithmetic does not add up is flagged', () => {
    const statement = { accountHolder: 'T MOKOENA', salaryCredits: [{ amountCents: 1_800_000 }], openingBalanceCents: 100_000, totalCreditsCents: 1_800_000, totalDebitsCents: 1_500_000, closingBalanceCents: 900_000 };
    const r = crossCheckDocuments({ identity: ident, statement });
    assert.ok(r.flags.includes('STATEMENT_ARITHMETIC'));
    assert.equal(r.method, 'PDF_BANK_STATEMENT');
  });

  test('a payslip alone is manual verification (the 15% ceiling applies)', () => {
    const r = crossCheckDocuments({ identity: ident, payslip });
    assert.equal(r.method, 'MANUAL_REVIEW');
    assert.equal(r.verifiedMonthlyIncomeCents, 1_810_000);
  });

  test('no income evidence at all is flagged, not guessed', () => {
    const r = crossCheckDocuments({ identity: ident });
    assert.equal(r.verifiedMonthlyIncomeCents, null);
    assert.ok(r.flags.includes('NO_INCOME_EVIDENCE'));
  });
});

// ─────────────────────────────────────────────
// Provider plan links
// ─────────────────────────────────────────────
describe('plan-link.service', () => {
  const SECRET = 'test-secret-0123456789abcdef';

  test('normalises South African cellphone numbers', () => {
    assert.equal(planLink.normalisePhone('082 123 4567'), '+27821234567');
    assert.equal(planLink.normalisePhone('+27 82 123 4567'), '+27821234567');
    assert.equal(planLink.normalisePhone('27821234567'), '+27821234567');
    assert.equal(planLink.normalisePhone('12345'), null);
  });

  test('a link verifies for the right phone before it expires', () => {
    const link = planLink.createPlanLink({ linkId: 'lnk-1', providerId: 'prov-1', patientPhone: '082 123 4567', secret: SECRET, now: NOW });
    assert.equal(link.expiresAt, new Date(NOW.getTime() + 7 * DAY).toISOString());
    const r = planLink.verifyPlanLink({ token: link.token, secret: SECRET, patientPhone: '+27821234567', now: NOW });
    assert.deepEqual(r, { ok: true, linkId: 'lnk-1', providerId: 'prov-1' });
  });

  test('the token carries no phone number, amount or name in the clear', () => {
    const link = planLink.createPlanLink({ linkId: 'lnk-1', providerId: 'prov-1', patientPhone: '0821234567', secret: SECRET, now: NOW });
    const payload = Buffer.from(link.token.split('.')[0], 'base64url').toString('utf8');
    assert.doesNotMatch(payload, /821234567|R\d|amount/i);
  });

  test('refuses a tampered token, the wrong phone, an expired link and garbage', () => {
    const link = planLink.createPlanLink({ linkId: 'lnk-1', providerId: 'prov-1', patientPhone: '0821234567', secret: SECRET, now: NOW });
    const [p, sig] = link.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), pid: 'prov-2' })).toString('base64url');
    assert.equal(planLink.verifyPlanLink({ token: `${forged}.${sig}`, secret: SECRET, patientPhone: '0821234567', now: NOW }).reason, 'BAD_SIGNATURE');
    assert.equal(planLink.verifyPlanLink({ token: link.token, secret: SECRET, patientPhone: '0839999999', now: NOW }).reason, 'PHONE_MISMATCH');
    assert.equal(planLink.verifyPlanLink({ token: link.token, secret: SECRET, patientPhone: '0821234567', now: new Date(NOW.getTime() + 8 * DAY) }).reason, 'EXPIRED');
    assert.equal(planLink.verifyPlanLink({ token: 'not-a-token', secret: SECRET, patientPhone: '0821234567', now: NOW }).reason, 'MALFORMED');
  });

  test('refuses to work without a strong secret', () => {
    assert.throws(() => planLink.createPlanLink({ linkId: 'l', providerId: 'p', patientPhone: '0821234567', secret: 'short', now: NOW }), /secret/);
  });
});

// ─────────────────────────────────────────────
// Adapters (mocks)
// ─────────────────────────────────────────────
describe('medical-scheme.adapter (mock)', () => {
  test('requires consent and returns cover in cents with a pre-auth status', async () => {
    await assert.rejects(scheme.getCover({ schemeName: 'Discovery', procedureCode: 'knee', quoteCents: 16_500_000 }), /consentToken/);
    const r = await scheme.getCover({ schemeName: 'Discovery', option: 'Classic Priority', membershipNumber: '123', procedureCode: 'knee', quoteCents: 16_500_000, consentToken: 'c1' });
    assert.ok(Number.isInteger(r.coverCents) && r.coverCents > 0 && r.coverCents < 16_500_000);
    assert.ok(['APPROVED', 'PENDING', 'NOT_REQUIRED'].includes(r.preAuthStatus));
    assert.equal(r.tier, 'classic');
  });

  test('is deterministic for the same member and procedure', async () => {
    const args = { schemeName: 'Bonitas', option: 'Essential', membershipNumber: '9', procedureCode: 'dental', quoteCents: 1_000_000, consentToken: 'c' };
    assert.deepEqual(await scheme.getCover(args), await scheme.getCover(args));
  });
});

describe('identity-verification.adapter (mock)', () => {
  test('verifies a valid SA ID with liveness and returns the date of birth from the ID', async () => {
    const r = await identity.verifyIdentity({ idNumber: VALID_ID, selfieToken: 'selfie-1', consentToken: 'c1' });
    assert.equal(r.verified, true);
    assert.equal(r.method, 'DHA_LIVENESS');
    assert.equal(r.dateOfBirth, '1990-01-01');
  });

  test('refuses an ID that fails the checksum, and never stores the selfie', async () => {
    const bad = await identity.verifyIdentity({ idNumber: FIRST12 + ((luhnCheckDigit(FIRST12) + 1) % 10), selfieToken: 's', consentToken: 'c' });
    assert.equal(bad.verified, false);
    const ok = await identity.verifyIdentity({ idNumber: VALID_ID, selfieToken: 'selfie-1', consentToken: 'c1' });
    assert.ok(!('selfieToken' in ok) && !('selfie' in ok));
  });

  test('requires consent', async () => {
    await assert.rejects(identity.verifyIdentity({ idNumber: VALID_ID, selfieToken: 's' }), /consentToken/);
  });
});

describe('debicheck.adapter: creditor and approval flow', () => {
  const params = { patientId: 'pat-1', bankAccountNumber: '1234567890', branchCode: '051001', monthlyAmount: 380_000, firstCollectionDate: new Date('2026-11-25'), referenceNumber: 'KEHR-PLAN-1' };

  test('every mandate is in the name of Tech & Artery (Pty) Ltd, shown as KEHR*PLAN', async () => {
    assert.deepEqual(debicheck.CREDITOR, { legalName: 'Tech & Artery (Pty) Ltd', shortName: 'KEHR*PLAN', sponsorBank: 'Standard Bank' });
    const r = await debicheck.createMandate(params);
    assert.equal(r.creditor.legalName, 'Tech & Artery (Pty) Ltd');
    assert.equal(r.creditor.shortName, 'KEHR*PLAN');
  });

  test('defaults to real-time (TT1) approval in the banking app', async () => {
    const r = await debicheck.createMandate(params);
    assert.equal(r.authType, 'TT1');
    assert.equal(r.status, 'PENDING_AUTHENTICATION');
  });

  test('the short name fits the scheme limit', () => {
    assert.ok(debicheck.CREDITOR.shortName.length <= debicheck.SHORT_NAME_MAX_LENGTH);
  });

  test('the bank result decides the next step: approved, declined, or fall back to TT2 on a timeout', () => {
    assert.deepEqual(debicheck.nextStepForResult({ authType: 'TT1', result: 'AUTHENTICATED' }), { status: 'ACTIVE', next: 'create_plan' });
    assert.deepEqual(debicheck.nextStepForResult({ authType: 'TT1', result: 'REJECTED' }), { status: 'REJECTED', next: 'tell_patient' });
    assert.deepEqual(debicheck.nextStepForResult({ authType: 'TT1', result: 'TIMEOUT' }), { status: 'PENDING_AUTHENTICATION', next: 'reissue_as_TT2' });
    assert.deepEqual(debicheck.nextStepForResult({ authType: 'TT2', result: 'TIMEOUT' }), { status: 'EXPIRED', next: 'offer_secure_form' });
  });

  test('the existing interface still works unchanged', async () => {
    const r = await debicheck.collectInstalment('mandate-1', 100000);
    assert.equal(typeof r.collectionId, 'string');
  });
});
