/**
 * Unit Tests: Kehr pre-approval flow (v1.21.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * kehr-preapproval-flow.service.js orchestrates Journey A end to end:
 *   consents -> identity -> documents cross-check -> scheme cover ->
 *   Shield patient gates + PD/LGD (preapproval.service) -> pass ->
 *   provider plan link -> conversion through the full Shield decision.
 *
 * The flow takes a repository and adapters, so it runs here against an
 * in-memory repository. The SQL repository is checked statically in
 * kehr-wiring.test.js.
 *
 * Run: node --test tests/unit/kehr-preapproval-flow.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createKehrFlow } = require('../../backend/src/services/kehr-preapproval-flow.service');
const { luhnCheckDigit } = require('../../backend/src/utils/sa-id');

const NOW = new Date('2026-10-27T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const FIRST12 = '900101500908';
const VALID_ID = FIRST12 + luhnCheckDigit(FIRST12);
const SECRET = 'test-secret-0123456789abcdef';

function memoryRepo(overrides = {}) {
  const db = { consents: [], preapprovals: [], passes: [], links: [], audit: [], reviews: [] };
  let seq = 0;
  const id = (p) => `${p}-${++seq}`;
  const repo = {
    db,
    async getUser(userId) {
      return { userId, fullName: 'Thandi Grace Mokoena', idNumber: VALID_ID, cellNumber: '0821234567' };
    },
    async listConsents(userId) { return db.consents.filter((c) => c.userId === userId); },
    async insertConsent(userId, record) { const row = { ...record, consentId: id('con'), userId }; db.consents.push(row); return row; },
    async withdrawConsent(userId, source, at) {
      for (const c of db.consents) if (c.userId === userId && c.source === source && !c.withdrawnAt) c.withdrawnAt = at;
    },
    async insertPreapproval(userId, input) { const row = { preapprovalId: id('pre'), userId, input, documents: {}, assessment: null, status: 'collecting' }; db.preapprovals.push(row); return row; },
    async getPreapproval(userId, preapprovalId) { return db.preapprovals.find((p) => p.userId === userId && p.preapprovalId === preapprovalId) || null; },
    async saveDocuments(preapprovalId, documents) { db.preapprovals.find((p) => p.preapprovalId === preapprovalId).documents = documents; },
    async saveAssessment(preapprovalId, assessment, facts) {
      const p = db.preapprovals.find((x) => x.preapprovalId === preapprovalId);
      p.assessment = assessment; p.facts = facts; p.status = assessment.status;
    },
    async insertPass(preapprovalId, pass) {
      if (db.passes.some((x) => x.code === pass.code)) return null;
      const row = { ...pass, passId: id('pass'), preapprovalId }; db.passes.push(row); return row;
    },
    async getActivePass(userId) { return db.passes.filter((p) => p.patientId === userId && p.status === 'active').slice(-1)[0] || null; },
    async getPassByCode(code) { return db.passes.find((p) => p.code === code) || null; },
    async markPassConverted(passId) { db.passes.find((p) => p.passId === passId).status = 'converted'; },
    async getPortfolio() { return { arrearsRate: 0.02, balanceSheetPercent: 0.1, reserveFundBalance: 1_000_000, monthlyFeeIncome: 1_000_000 }; },
    async getProcedureRisk() { return { base_pd_risk: 35, base_lgd_risk: 40, necessity_score: 0.8 }; },
    async getBenchmarkCents() { return 0; },
    async getProviderForShield() { return { status: 'ACTIVE', billingAgreementSigned: true, bookSharePercent: 0.01, procedureTypeSharePercent: 0.05, patientPdRate: 0.02 }; },
    async insertPlanLink(row) { db.links.push({ ...row, status: 'sent' }); return row; },
    async getPlanLink(linkId) { return db.links.find((l) => l.linkId === linkId) || null; },
    async markPlanLinkRedeemed(linkId, userId, outcome) { Object.assign(db.links.find((l) => l.linkId === linkId), { status: 'redeemed', redeemedBy: userId, outcome }); },
    async audit(event) { db.audit.push(event); },
    async queueReview(item) { db.reviews.push(item); return db.reviews.length; },
    ...overrides,
  };
  return repo;
}

const adapters = (overrides = {}) => ({
  identity: { verifyIdentity: async ({ idNumber, selfieToken }) => ({ verified: idNumber === VALID_ID && !!selfieToken, method: 'DHA_LIVENESS', dateOfBirth: '1990-01-01' }) },
  income: { verifyIncome: async () => ({ verifiedMonthlyIncome: 3_500_000, method: 'STITCH_OPEN_BANKING', existingObligations: 400_000, verifiedAt: new Date(NOW.getTime() - DAY) }) },
  scheme: { getCover: async ({ quoteCents }) => ({ coverCents: Math.round(quoteCents * 0.7), preAuthStatus: 'APPROVED', tier: 'classic' }) },
  ...overrides,
});

function flowWith({ repo = memoryRepo(), adapterOverrides, now = NOW } = {}) {
  let clock = now;
  const flow = createKehrFlow({ repo, adapters: adapters(adapterOverrides), secret: SECRET, now: () => clock, random: (() => { let i = 0; return () => ((i++ * 7) % 31) / 31; })() });
  return { flow, repo, setNow: (d) => { clock = d; } };
}

async function readyToAssess(flow, { consents = ['bureau', 'bank_income_once', 'scheme_cover'], input = {} } = {}) {
  for (const s of consents) await flow.grantConsent('user-1', s);
  const { preapprovalId } = await flow.startPreapproval('user-1', {
    procedureCode: 'knee-arthroscopy', estimateCents: 16_500_000, urgency: 'planned',
    scheme: { name: 'Discovery', option: 'Classic Priority', membershipNumber: '123' }, ...input,
  });
  await flow.submitDocuments('user-1', preapprovalId, { selfieToken: 'selfie-1' });
  return preapprovalId;
}

describe('consents', () => {
  test('grant, list and withdraw return the patient consent view only', async () => {
    const { flow } = flowWith();
    await flow.grantConsent('user-1', 'bureau');
    let view = await flow.listConsents('user-1');
    assert.equal(view.length, 1);
    assert.equal(view[0].active, true);
    assert.ok(!('consentId' in view[0]) && !('userId' in view[0]));
    await flow.withdrawConsent('user-1', 'bureau');
    view = await flow.listConsents('user-1');
    assert.equal(view[0].active, false);
  });

  test('lists every source with the exact purpose text that a grant records', async () => {
    const { flow, repo } = flowWith();
    const sources = flow.consentSources();
    const bureau = sources.find((s) => s.source === 'bureau');
    await flow.grantConsent('user-1', 'bureau');
    assert.equal(repo.db.consents[0].purposeAgreed, bureau.purpose);
    assert.equal(sources.find((s) => s.source === 'health_history').optional, true);
  });

  test('refuses an unknown source', async () => {
    const { flow } = flowWith();
    await assert.rejects(flow.grantConsent('user-1', 'contacts'), /Unknown consent source/);
  });
});

describe('startPreapproval', () => {
  test('validates the estimate and urgency', async () => {
    const { flow } = flowWith();
    await assert.rejects(flow.startPreapproval('user-1', { estimateCents: 12.5, urgency: 'planned' }), /estimateCents/);
    await assert.rejects(flow.startPreapproval('user-1', { estimateCents: 1_000_000, urgency: 'whenever' }), /urgency/);
  });
});

describe('assess', () => {
  test('asks for the missing consents before reading anything', async () => {
    const { flow, repo } = flowWith();
    const { preapprovalId } = await flow.startPreapproval('user-1', { procedureCode: 'knee', estimateCents: 16_500_000, urgency: 'planned' });
    const r = await flow.assess('user-1', preapprovalId);
    assert.equal(r.status, 'needs_consent');
    assert.deepEqual(r.missing.sort(), ['bureau', 'income']);
    assert.equal(repo.db.audit.length, 0);
  });

  test('with no provider chosen yet the model stays neutral on the provider, so a borderline case goes to a person', async () => {
    const { flow, repo } = flowWith({ adapterOverrides: { income: { verifyIncome: async () => ({ verifiedMonthlyIncome: 2_200_000, method: 'STITCH_OPEN_BANKING', existingObligations: 400_000, verifiedAt: NOW }) } } });
    const id = await readyToAssess(flow);
    const r = await flow.assess('user-1', id);
    assert.equal(r.status, 'checking');
    assert.equal(repo.db.reviews[0].reason, 'RISK_REVIEW');
  });

  test('a verified, affordable gap is pre-approved with a pass; the patient sees outcome fields only', async () => {
    const { flow, repo } = flowWith();
    const id = await readyToAssess(flow);
    const r = await flow.assess('user-1', id);
    assert.equal(r.status, 'pre_approved');
    assert.match(r.code, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    assert.ok(r.ceilingCents >= 4_700_000);
    for (const hidden of ['trace', 'pd', 'lgd', 'reasonCode', 'gatesPending', 'modelVersion', 'flags']) assert.ok(!(hidden in r), hidden);
    assert.equal(repo.db.passes.length, 1);
  });

  test('every assessment is written to the underwriting audit log with model version and inputs', async () => {
    const { flow, repo } = flowWith();
    const id = await readyToAssess(flow);
    await flow.assess('user-1', id);
    const ev = repo.db.audit.find((e) => e.eventType === 'KEHR_PREAPPROVAL_ASSESSED');
    assert.ok(ev);
    assert.equal(ev.ruleVersion, 'RISK_v1.1');
    assert.equal(ev.inputData.monthlyIncomeCents, 3_500_000);
    assert.equal(ev.inputData.schemeCoverCents, 11_550_000);
    assert.equal(ev.outputDecision, 'pre_approved');
  });

  test('a failed identity check goes to a person and the patient sees "checking"', async () => {
    const { flow, repo } = flowWith({ adapterOverrides: { identity: { verifyIdentity: async () => ({ verified: false, method: 'DHA_LIVENESS', dateOfBirth: null }) } } });
    const id = await readyToAssess(flow);
    const r = await flow.assess('user-1', id);
    assert.equal(r.status, 'checking');
    assert.equal(repo.db.reviews.length, 1);
    assert.equal(repo.db.reviews[0].reason, 'IDENTITY_UNVERIFIED');
    assert.equal(repo.db.passes.length, 0);
  });

  test('a payslip that disagrees with the bank feed goes to a person, never a decline', async () => {
    const { flow, repo } = flowWith();
    const id = await readyToAssess(flow, { consents: ['bureau', 'bank_income_once', 'scheme_cover', 'document_upload'] });
    await flow.submitDocuments('user-1', id, { selfieToken: 'selfie-1', payslip: { employeeName: 'T Mokoena', idNumber: VALID_ID, netPayCents: 5_000_000 } });
    const r = await flow.assess('user-1', id);
    assert.equal(r.status, 'checking');
    assert.equal(repo.db.reviews[0].reason, 'DOCUMENT_MISMATCH');
  });

  test('income can come from an uploaded statement when the bank is not connected', async () => {
    const { flow } = flowWith();
    const id = await readyToAssess(flow, { consents: ['bureau', 'document_upload', 'scheme_cover'] });
    await flow.submitDocuments('user-1', id, {
      selfieToken: 'selfie-1',
      statement: { accountHolder: 'T MOKOENA', salaryCredits: [{ amountCents: 3_500_000 }, { amountCents: 3_500_000 }], debitOrdersCents: 400_000, openingBalanceCents: 0, totalCreditsCents: 7_000_000, totalDebitsCents: 6_600_000, closingBalanceCents: 400_000 },
    });
    const r = await flow.assess('user-1', id);
    assert.equal(r.status, 'pre_approved');
  });

  test('without scheme consent the whole estimate is the shortfall', async () => {
    const { flow, repo } = flowWith();
    const id = await readyToAssess(flow, { consents: ['bureau', 'bank_income_once'], input: { estimateCents: 3_000_000 } });
    await flow.assess('user-1', id);
    assert.equal(repo.db.audit[0].inputData.schemeCoverCents, 0);
  });

  test('a decline is offered a human review (POPIA s71) and the request is queued', async () => {
    const { flow, repo } = flowWith({ adapterOverrides: { income: { verifyIncome: async () => ({ verifiedMonthlyIncome: 300_000, method: 'STITCH_OPEN_BANKING', existingObligations: 0, verifiedAt: NOW }) } } });
    const id = await readyToAssess(flow);
    const r = await flow.assess('user-1', id);
    assert.equal(r.status, 'not_available');
    assert.equal(r.canRequestReview, true);
    const again = await flow.requestReview('user-1', id);
    assert.equal(again.status, 'checking');
    assert.equal(repo.db.reviews.at(-1).reason, 'PATIENT_REQUESTED_REVIEW');
  });

  test('another patient cannot assess or read a pre-approval', async () => {
    const { flow } = flowWith();
    const id = await readyToAssess(flow);
    await assert.rejects(flow.assess('user-2', id), /not found/i);
  });

  test('an uploaded document is not read without the document consent', async () => {
    const { flow, repo } = flowWith();
    const id = await readyToAssess(flow);
    await flow.submitDocuments('user-1', id, { selfieToken: 'selfie-1', payslip: { employeeName: 'T Mokoena', idNumber: VALID_ID, netPayCents: 5_000_000 } });
    await flow.assess('user-1', id);
    assert.deepEqual(repo.db.audit[0].inputData.crossCheckFlags, []);
  });
});

describe('pass and provider', () => {
  test('the provider pass check shows code, status, ceiling and expiry only', async () => {
    const { flow } = flowWith();
    const id = await readyToAssess(flow);
    const { code } = await flow.assess('user-1', id);
    const view = await flow.providerCheckPass(code);
    assert.deepEqual(Object.keys(view).sort(), ['ceilingCents', 'code', 'expiresAt', 'status']);
    assert.equal(await flow.providerCheckPass('ZZZ-ZZZ'), null);
  });

  test('getPass returns the active pass in the patient view', async () => {
    const { flow } = flowWith();
    assert.equal(await flow.getPass('user-1'), null);
    const id = await readyToAssess(flow);
    await flow.assess('user-1', id);
    const pass = await flow.getPass('user-1');
    assert.equal(pass.status, 'pre_approved');
  });
});

describe('plan links and conversion', () => {
  async function passAndLink(flowCtx, linkInput = {}) {
    const { flow } = flowCtx;
    const id = await readyToAssess(flow);
    await flow.assess('user-1', id);
    const link = await flow.createProviderPlanLink('prov-1', { patientPhone: '082 123 4567', amountCents: 4_500_000, billTotalCents: 16_500_000, procedureCode: 'knee-arthroscopy', ...linkInput });
    return link;
  }

  test('a provider link carries no amount or phone in the token and stores the bill server-side', async () => {
    const ctx = flowWith();
    const link = await passAndLink(ctx);
    assert.ok(link.token && link.linkId && link.expiresAt);
    assert.equal(link.url, `/kehr-pass.html?link=${encodeURIComponent(link.token)}`);
    assert.equal(ctx.repo.db.links[0].amountCents, 4_500_000);
    assert.doesNotMatch(Buffer.from(link.token.split('.')[0], 'base64url').toString(), /4500000|821234567/);
  });

  test('redeeming within the pass runs the full Shield decision and offers terms', async () => {
    const ctx = flowWith();
    const link = await passAndLink(ctx);
    const r = await ctx.flow.redeemPlanLink('user-1', link.token);
    assert.equal(r.status, 'ready');
    assert.ok(r.termOptions.length > 0);
    for (const t of r.termOptions) assert.equal(t.monthlyCents, Math.ceil(4_500_000 / t.months));
    const ev = ctx.repo.db.audit.find((e) => e.eventType === 'KEHR_PASS_CONVERSION');
    assert.ok(ev && ev.outputDecision === 'APPROVED');
    assert.equal(r.handoff.executeEndpoint, '/api/marketplace/applications');
    assert.ok(!('decision' in r) && !('gate' in r));
  });

  test('a link opened from another phone is refused', async () => {
    const ctx = flowWith({ repo: memoryRepo({ getUser: async (userId) => ({ userId, fullName: 'Thandi Grace Mokoena', idNumber: VALID_ID, cellNumber: '0839999999' }) }) });
    const link = await passAndLink(ctx);
    const r = await ctx.flow.redeemPlanLink('user-1', link.token);
    assert.equal(r.status, 'link_invalid');
  });

  test('a bill above the ceiling is reassessed for the difference, not converted', async () => {
    const ctx = flowWith();
    const link = await passAndLink(ctx, { amountCents: 9_000_000 });
    const r = await ctx.flow.redeemPlanLink('user-1', link.token);
    assert.equal(r.status, 'checking');
  });

  test('a provider whose Gate 1 fails at conversion never reaches the patient as a reason', async () => {
    const ctx = flowWith({ repo: memoryRepo({ getProviderForShield: async () => ({ status: 'SUSPENDED' }) }) });
    const link = await passAndLink(ctx);
    const r = await ctx.flow.redeemPlanLink('user-1', link.token);
    assert.equal(r.status, 'not_available');
    assert.ok(!JSON.stringify(r).includes('SUSPENDED'));
  });

  test('a link can only be redeemed once', async () => {
    const ctx = flowWith();
    const link = await passAndLink(ctx);
    await ctx.flow.redeemPlanLink('user-1', link.token);
    const r = await ctx.flow.redeemPlanLink('user-1', link.token);
    assert.equal(r.status, 'link_invalid');
  });

  test('an old pass refreshes income before converting', async () => {
    const ctx = flowWith();
    let calls = 0;
    ctx.flow.__adapters.income.verifyIncome = async () => { calls += 1; return { verifiedMonthlyIncome: 3_500_000, method: 'STITCH_OPEN_BANKING', existingObligations: 400_000, verifiedAt: new Date() }; };
    const link = await passAndLink(ctx);
    ctx.setNow(new Date(NOW.getTime() + 40 * DAY));
    const fresh = await ctx.flow.createProviderPlanLink('prov-1', { patientPhone: '0821234567', amountCents: 4_500_000, billTotalCents: 16_500_000, procedureCode: 'knee-arthroscopy' });
    const before = calls;
    const r = await ctx.flow.redeemPlanLink('user-1', fresh.token);
    assert.equal(calls, before + 1);
    assert.equal(r.status, 'ready');
    assert.ok(link);
  });
});
