/**
 * KEHR PRE-APPROVAL FLOW (Journey A, v1.21.0)
 *
 * Orchestrates the harness before treatment:
 *
 *   consents -> identity (KYC) -> income + documents cross-check ->
 *   scheme cover -> Shield patient gates + PD/LGD -> pass ->
 *   provider plan link -> conversion through the full Shield decision
 *
 * Nothing here decides on its own. Affordability, gates and risk come from
 * preapproval.service.js (Shield Gates 5, 3, 2 + risk model v1.1) and, at
 * conversion, runShieldDecision (Gates 1 to 5) — the same engine /api/v1
 * uses. This module only fetches the verified inputs, persists the outcome,
 * writes the underwriting audit log and routes cases to a person.
 *
 * The patient sees outcomes only (v1.19): every return value is a patient
 * view. Reasons, gates, scores and traces stay in the audit log.
 *
 * Takes a repository (kehr-repository.js in production, in-memory in tests)
 * and the adapters, so it never touches the database or network directly.
 */

'use strict';

const crypto = require('crypto');

const consent = require('./consent.service');
const { crossCheckDocuments } = require('./document-crosscheck.service');
const planLink = require('./plan-link.service');
const pre = require('./preapproval.service');
const { runShieldDecision } = require('./shield-gates.service');
const { MODEL_VERSIONS } = require('./risk-model');
const { toRands } = require('../utils/money');

const URGENCIES = ['elective', 'planned', 'urgent'];
const URGENCY_TO_GATE = { elective: 'ELECTIVE', planned: 'PLANNED', urgent: 'URGENT' };
const RULE_VERSION = `RISK_${MODEL_VERSIONS.HARNESS}`;
const MAX_CODE_ATTEMPTS = 5;
const REVIEW_SLA_HOURS = 24;

const MESSAGES = Object.freeze({
  checking: "We're checking a few details. We'll let you know here.",
  needsConsent: 'We need your go-ahead to read a few things first.',
  needsDocuments: 'Connect your bank or add a recent payslip or statement so we can confirm your income.',
  linkInvalid: "This link has expired or isn't for this number. Ask your provider to send a new one.",
  needsPreapproval: "Let's get you pre-approved first. It takes a couple of minutes.",
  passExpired: "Your pass has expired. Let's check again; it only takes a moment.",
  coolingOff: 'Your plan is ready to set up after a short pause, in case you change your mind.',
  ready: 'Your plan is ready. Choose how many months suits you.',
  notAvailable: "We can't set up a plan for this right now.",
});

function createKehrFlow({ repo, adapters, secret, now = () => new Date(), random } = {}) {
  if (!repo) throw new Error('createKehrFlow requires a repository');
  if (!adapters || !adapters.identity || !adapters.income || !adapters.scheme) {
    throw new Error('createKehrFlow requires identity, income and scheme adapters');
  }

  const activeConsent = (records, source, at) => records.find((r) => r.source === source && consent.isActive(r, at)) || null;

  async function ownedPreapproval(userId, preapprovalId) {
    const row = await repo.getPreapproval(userId, preapprovalId);
    if (!row) throw new Error('Pre-approval not found');
    return row;
  }

  // ── Consents ─────────────────────────────────────────────

  async function listConsents(userId) {
    return consent.patientConsentView(await repo.listConsents(userId), now());
  }

  /** What each source reads and why, as shown before the patient agrees. */
  function consentSources() {
    return Object.entries(consent.CONSENT_SOURCES).map(([source, def]) => ({
      source,
      label: def.label,
      purpose: def.purpose,
      specialPersonalInformation: def.specialPersonalInformation,
      optional: def.optional,
    }));
  }

  async function grantConsent(userId, source) {
    const record = consent.grantConsent({ source, now: now() });
    await repo.insertConsent(userId, record);
    return listConsents(userId);
  }

  async function withdrawConsent(userId, source) {
    if (!consent.CONSENT_SOURCES[source]) throw new Error(`Unknown consent source: ${source}`);
    await repo.withdrawConsent(userId, source, now().toISOString());
    return listConsents(userId);
  }

  // ── Pre-approval ─────────────────────────────────────────

  async function startPreapproval(userId, input = {}) {
    const { procedureCode = null, estimateCents, urgency, scheme = null } = input;
    if (!Number.isInteger(estimateCents) || estimateCents <= 0) throw new Error('estimateCents must be a positive integer');
    if (!URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join(', ')}`);
    const row = await repo.insertPreapproval(userId, {
      procedureCode,
      estimateCents,
      urgency,
      scheme: scheme ? { name: scheme.name || null, option: scheme.option || null, membershipNumber: scheme.membershipNumber || null } : null,
    });
    return { preapprovalId: row.preapprovalId, status: 'collecting' };
  }

  /**
   * Stores the figures read from documents (by the document reader), never
   * the files. The selfie is a short-lived token handed to the KYC partner.
   */
  async function submitDocuments(userId, preapprovalId, docs = {}) {
    const row = await ownedPreapproval(userId, preapprovalId);
    const documents = { ...row.documents };
    for (const key of ['selfieToken', 'payslip', 'statement']) {
      if (docs[key] !== undefined) documents[key] = docs[key];
    }
    await repo.saveDocuments(preapprovalId, documents);
    return { received: Object.keys(documents).filter((k) => k !== 'selfieToken').concat(documents.selfieToken ? ['selfie'] : []) };
  }

  async function recordAndRoute(row, userId, assessment, facts) {
    await repo.saveAssessment(row.preapprovalId, assessment, facts);
    await repo.audit({
      applicationId: row.preapprovalId,
      eventType: 'KEHR_PREAPPROVAL_ASSESSED',
      actor: 'kehr',
      inputData: facts,
      outputDecision: assessment.status,
      outputData: {
        reasonCode: assessment.reasonCode || null,
        flags: assessment.flags || [],
        ceilingCents: assessment.ceilingCents || null,
        maxTermMonths: assessment.maxTermMonths || null,
        gatesPending: assessment.gatesPending || [],
        trace: assessment.trace || [],
      },
      ruleVersion: RULE_VERSION,
    });
    if (assessment.status === 'review') {
      await repo.queueReview({ preapprovalId: row.preapprovalId, userId, reason: assessment.reasonCode, slaHours: REVIEW_SLA_HOURS });
    }
  }

  async function issuePass(row, userId, assessment) {
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      const pass = pre.createPass({ assessment, patientId: userId, now: now(), random });
      const saved = await repo.insertPass(row.preapprovalId, pass);
      if (saved) return saved;
    }
    throw new Error('Could not issue a unique pass code');
  }

  async function readIncome(userId, records, documents, at) {
    let bankFeed = null;
    let verifiedAt = null;
    const bankConsent = activeConsent(records, 'bank_income_once', at);
    if (bankConsent) {
      const inc = await adapters.income.verifyIncome(userId, bankConsent.consentId);
      if (inc && inc.method === 'STITCH_OPEN_BANKING') {
        bankFeed = { accountHolder: null, salaryCredits: [{ amountCents: inc.verifiedMonthlyIncome }], debitOrdersCents: inc.existingObligations };
        verifiedAt = new Date(inc.verifiedAt || at).toISOString();
      }
    }
    const docsAllowed = !!activeConsent(records, 'document_upload', at);
    return {
      bankFeed,
      payslip: docsAllowed ? documents.payslip || null : null,
      statement: docsAllowed ? documents.statement || null : null,
      verifiedAt,
    };
  }

  async function assess(userId, preapprovalId) {
    const at = now();
    const row = await ownedPreapproval(userId, preapprovalId);
    const records = await repo.listConsents(userId);

    const missing = consent.missingFor('preapproval', records, at);
    if (missing.length) return { status: 'needs_consent', missing, message: MESSAGES.needsConsent };

    const user = await repo.getUser(userId);
    const documents = row.documents || {};
    const input = row.input;

    // Identity first: nothing is assessed for an unverified person.
    const kyc = await adapters.identity.verifyIdentity({
      idNumber: user.idNumber,
      selfieToken: documents.selfieToken,
      consentToken: activeConsent(records, 'bureau', at).consentId,
    });
    if (!kyc.verified) {
      const assessment = { status: 'review', reasonCode: 'IDENTITY_UNVERIFIED', assessedAt: at.toISOString() };
      await recordAndRoute(row, userId, assessment, { procedureCode: input.procedureCode, estimateCents: input.estimateCents, identityMethod: kyc.method });
      return pre.patientPreapprovalView({ assessment });
    }

    const income = await readIncome(userId, records, documents, at);
    const check = crossCheckDocuments({
      identity: { fullName: user.fullName, idNumber: user.idNumber },
      bankFeed: income.bankFeed,
      payslip: income.payslip,
      statement: income.statement,
    });
    if (check.flags.includes('NO_INCOME_EVIDENCE')) {
      return { status: 'needs_documents', message: MESSAGES.needsDocuments };
    }

    let cover = { coverCents: 0, tier: 'none', preAuthStatus: null };
    const schemeConsent = activeConsent(records, 'scheme_cover', at);
    if (schemeConsent && input.scheme && input.scheme.name) {
      cover = await adapters.scheme.getCover({
        schemeName: input.scheme.name,
        option: input.scheme.option,
        membershipNumber: input.scheme.membershipNumber,
        procedureCode: input.procedureCode,
        quoteCents: input.estimateCents,
        consentToken: schemeConsent.consentId,
      });
    }

    const facts = {
      procedureCode: input.procedureCode,
      estimateCents: input.estimateCents,
      urgency: input.urgency,
      monthlyIncomeCents: check.verifiedMonthlyIncomeCents,
      obligationsCents: check.obligationsCents,
      incomeVerificationMethod: check.method,
      incomeVerifiedAt: income.verifiedAt || at.toISOString(),
      schemeCoverCents: cover.coverCents,
      medicalAidTier: cover.tier,
      preAuthStatus: cover.preAuthStatus,
      identityMethod: kyc.method,
      crossCheckFlags: check.flags,
      healthHistoryShared: !!activeConsent(records, 'health_history', at),
    };

    const assessment = pre.assessPreApproval({
      monthlyIncomeCents: facts.monthlyIncomeCents,
      obligationsCents: facts.obligationsCents,
      incomeVerificationMethod: facts.incomeVerificationMethod,
      incomeVerifiedAt: facts.incomeVerifiedAt,
      estimateCents: facts.estimateCents,
      schemeCoverCents: facts.schemeCoverCents,
      urgency: facts.urgency,
      crossCheck: { consistent: check.consistent, flags: check.flags },
      portfolio: await repo.getPortfolio(),
      risk: {
        hasMedicalAid: cover.tier !== 'none',
        medicalAidTier: cover.tier,
        procedureRisk: (await repo.getProcedureRisk(input.procedureCode)) || undefined,
        isNetworkPartner: false,
      },
    }, { now: at });

    await recordAndRoute(row, userId, assessment, facts);
    const pass = assessment.status === 'pre_approved' ? await issuePass(row, userId, assessment) : null;
    return pre.patientPreapprovalView({ assessment, pass });
  }

  /** POPIA s71: any patient may ask a person to look at an outcome. */
  async function requestReview(userId, preapprovalId) {
    const row = await ownedPreapproval(userId, preapprovalId);
    await repo.queueReview({ preapprovalId: row.preapprovalId, userId, reason: 'PATIENT_REQUESTED_REVIEW', slaHours: REVIEW_SLA_HOURS });
    await repo.audit({ applicationId: row.preapprovalId, eventType: 'KEHR_REVIEW_REQUESTED', actor: 'patient', inputData: {}, outputDecision: 'review', outputData: {}, ruleVersion: RULE_VERSION });
    return { status: 'checking', message: MESSAGES.checking };
  }

  async function getPass(userId) {
    const pass = await repo.getActivePass(userId);
    if (!pass) return null;
    if (now().getTime() > new Date(pass.expiresAt).getTime()) return null;
    return pre.patientPreapprovalView({ assessment: { ...pass, status: 'pre_approved' }, pass });
  }

  async function providerCheckPass(code) {
    const pass = await repo.getPassByCode(String(code || '').toUpperCase());
    return pass ? pre.providerPassView(pass) : null;
  }

  // ── Provider plan links ──────────────────────────────────

  async function createProviderPlanLink(providerId, { patientPhone, amountCents, billTotalCents = null, procedureCode = null } = {}) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('amountCents must be a positive integer');
    if (billTotalCents !== null && (!Number.isInteger(billTotalCents) || billTotalCents < amountCents)) {
      throw new Error('billTotalCents must be an integer no less than amountCents');
    }
    const linkId = crypto.randomUUID();
    const { token, expiresAt } = planLink.createPlanLink({ linkId, providerId, patientPhone, secret, now: now() });
    await repo.insertPlanLink({ linkId, providerId, amountCents, billTotalCents, procedureCode, expiresAt });
    await repo.audit({ applicationId: null, providerId, eventType: 'KEHR_PLAN_LINK_CREATED', actor: 'provider', inputData: { linkId, amountCents, procedureCode }, outputDecision: 'sent', outputData: { expiresAt }, ruleVersion: RULE_VERSION });
    return { linkId, token, expiresAt, url: `/kehr-pass.html?link=${encodeURIComponent(token)}` };
  }

  async function refreshIncome(userId, facts, at) {
    const records = await repo.listConsents(userId);
    const bankConsent = activeConsent(records, 'bank_income_once', at);
    if (!bankConsent) return null;
    const inc = await adapters.income.verifyIncome(userId, bankConsent.consentId);
    return {
      ...facts,
      monthlyIncomeCents: inc.verifiedMonthlyIncome,
      obligationsCents: inc.existingObligations,
      incomeVerificationMethod: inc.method,
      incomeVerifiedAt: new Date(inc.verifiedAt || at).toISOString(),
    };
  }

  function shieldContext({ link, pass, facts, provider, portfolio, benchmarkCents, termMonths }) {
    const isGap = (facts.schemeCoverCents || 0) > 0;
    // Segment 1 needs a benchmark to apply the tariff gate; without one the
    // gap is assessed as a full amount (Gates 1, 2, 3, 5), as /api/v1 would.
    const segment1 = isGap && benchmarkCents > 0;
    return {
      application: {
        applicationId: pass.passId,
        segment: segment1 ? 'SEGMENT_1_GAP' : 'SEGMENT_2_FULL',
        procedureUrgency: URGENCY_TO_GATE[facts.urgency] || 'PLANNED',
        providerInvoiceAmount: segment1 ? (link.billTotalCents || link.amountCents) : link.amountCents,
        termMonths,
      },
      provider: { providerId: link.providerId, ...provider },
      patient: {
        verifiedMonthlyIncome: facts.monthlyIncomeCents,
        incomeVerificationMethod: facts.incomeVerificationMethod,
        verifiedAt: facts.incomeVerifiedAt,
      },
      portfolio,
      segment1: segment1
        ? { benchmarkProcedureCost: benchmarkCents, patientPlanCoveragePercent: Math.min(1, facts.schemeCoverCents / benchmarkCents), dspIsOnList: true }
        : null,
      feePercent: 5,
    };
  }

  async function redeemPlanLink(userId, token) {
    const at = now();
    const user = await repo.getUser(userId);
    const verified = planLink.verifyPlanLink({ token, secret, patientPhone: user.cellNumber, now: at });
    if (!verified.ok) return { status: 'link_invalid', message: MESSAGES.linkInvalid };

    const link = await repo.getPlanLink(verified.linkId);
    if (!link || link.status !== 'sent' || link.providerId !== verified.providerId) {
      return { status: 'link_invalid', message: MESSAGES.linkInvalid };
    }

    const pass = await repo.getActivePass(userId);
    if (!pass) return { status: 'needs_preapproval', message: MESSAGES.needsPreapproval };
    const row = await ownedPreapproval(userId, pass.preapprovalId);
    let facts = row.facts || {};

    const conv = pre.evaluateConversion({
      pass,
      bill: { amountCents: link.amountCents, procedureMatches: !link.procedureCode || !facts.procedureCode || link.procedureCode === facts.procedureCode },
      now: at,
    });

    const audit = (decision, data) => repo.audit({
      applicationId: row.preapprovalId, providerId: link.providerId, eventType: 'KEHR_PASS_CONVERSION', actor: 'kehr',
      inputData: { linkId: link.linkId, passCode: pass.code, amountCents: link.amountCents, conversion: conv.outcome },
      outputDecision: decision, outputData: data, ruleVersion: RULE_VERSION,
    });

    if (conv.outcome === 'expired' || conv.outcome === 'not_active') return { status: 'pass_expired', message: MESSAGES.passExpired };
    if (conv.outcome === 'cooling_off') return { status: 'cooling_off', until: conv.until, message: MESSAGES.coolingOff };
    if (conv.outcome === 'reassess' || conv.outcome === 'reassess_difference') {
      await repo.queueReview({ preapprovalId: row.preapprovalId, userId, reason: conv.outcome === 'reassess' ? 'PASS_REASSESS_PROCEDURE' : 'PASS_REASSESS_DIFFERENCE', slaHours: REVIEW_SLA_HOURS });
      await repo.markPlanLinkRedeemed(link.linkId, userId, 'review');
      await audit('MANUAL_REVIEW', { deltaCents: conv.deltaCents || null });
      return { status: 'checking', message: MESSAGES.checking };
    }

    if (conv.requiresRefresh) {
      const refreshed = await refreshIncome(userId, facts, at);
      if (!refreshed) return { status: 'needs_consent', missing: ['income'], message: MESSAGES.needsConsent };
      facts = refreshed;
    }

    const [provider, portfolio, benchmarkCents] = await Promise.all([
      repo.getProviderForShield(link.providerId),
      repo.getPortfolio(),
      repo.getBenchmarkCents(link.procedureCode || facts.procedureCode),
    ]);

    // The pass already served its cooling-off; it is not served twice.
    const coolingOffServed = !!pass.coolingOffEndsAt && at.getTime() >= new Date(pass.coolingOffEndsAt).getTime();
    const results = conv.termOptions.map((termMonths) => {
      const r = runShieldDecision(shieldContext({ link, pass, facts, provider: provider || {}, portfolio, benchmarkCents, termMonths }));
      const decision = r.decision === 'COOLING_OFF' && coolingOffServed ? 'APPROVED' : r.decision;
      return { termMonths, decision, gate: r.gate || null, reason: r.reason || null, monthlyInstalment: r.monthlyInstalment, coolingOffExpiresAt: r.coolingOffExpiresAt || null };
    });

    const approved = results.filter((r) => r.decision === 'APPROVED');
    const cooling = results.filter((r) => r.decision === 'COOLING_OFF');
    const review = results.filter((r) => r.decision === 'MANUAL_REVIEW');
    const overall = approved.length ? 'APPROVED' : cooling.length ? 'COOLING_OFF' : review.length ? 'MANUAL_REVIEW' : 'DECLINED';
    await audit(overall, { results, benchmarkCents: benchmarkCents || 0, incomeRefreshed: !!conv.requiresRefresh });

    if (overall === 'COOLING_OFF') return { status: 'cooling_off', until: cooling[0].coolingOffExpiresAt, message: MESSAGES.coolingOff };
    if (overall === 'MANUAL_REVIEW') {
      await repo.queueReview({ preapprovalId: row.preapprovalId, userId, reason: 'PASS_CONVERSION_REVIEW', slaHours: REVIEW_SLA_HOURS });
      await repo.markPlanLinkRedeemed(link.linkId, userId, 'review');
      return { status: 'checking', message: MESSAGES.checking };
    }
    if (overall === 'DECLINED') {
      await repo.markPlanLinkRedeemed(link.linkId, userId, 'declined');
      return { status: 'not_available', message: MESSAGES.notAvailable, canRequestReview: true };
    }

    await repo.markPlanLinkRedeemed(link.linkId, userId, 'ready');
    await repo.markPassConverted(pass.passId);
    return {
      status: 'ready',
      message: MESSAGES.ready,
      amountCents: link.amountCents,
      termOptions: approved.map((r) => ({ months: r.termMonths, monthlyCents: r.monthlyInstalment })),
      // The existing marketplace endpoint creates the plan, as the
      // Care Agent /approve flow does; Kehr prepares and routes.
      handoff: {
        executeEndpoint: '/api/marketplace/applications',
        applicationPayload: {
          procedureType: link.procedureCode || facts.procedureCode || 'other',
          loanAmount: toRands(link.amountCents),
          monthlyIncome: toRands(facts.monthlyIncomeCents),
          monthlyObligations: toRands(facts.obligationsCents || 0),
          medicalAidCovered: toRands(facts.schemeCoverCents || 0),
          kehrPassCode: pass.code,
          kehrPlanLinkId: link.linkId,
        },
      },
    };
  }

  return {
    __adapters: adapters,
    listConsents,
    consentSources,
    grantConsent,
    withdrawConsent,
    startPreapproval,
    submitDocuments,
    assess,
    requestReview,
    getPass,
    providerCheckPass,
    createProviderPlanLink,
    redeemPlanLink,
  };
}

module.exports = { createKehrFlow, MESSAGES, RULE_VERSION };
