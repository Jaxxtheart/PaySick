/**
 * KEHR ROUTES (Journey A, v1.21.0)
 *
 * Pre-approval before treatment, the pass, and provider plan links. Every
 * route requires authentication (CLAUDE.md); provider routes also require
 * the provider role.
 *
 * The routes are thin: kehr-preapproval-flow.service.js does the work, over
 * kehr-repository.js and the adapters. Every patient response is already a
 * patient view (statuses and confirmed figures only, v1.19); the assessment,
 * gates, scores and reasons stay in kehr_preapprovals and
 * underwriting_audit_log.
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const { query } = require('../config/database');
const { authenticateToken, requireProvider } = require('../middleware/auth.middleware');
const { createKehrFlow } = require('../services/kehr-preapproval-flow.service');
const { createKehrRepository } = require('../services/kehr-repository');
const identityAdapter = require('../adapters/identity-verification.adapter');
const incomeAdapter = require('../adapters/income-verification.adapter');
const schemeAdapter = require('../adapters/medical-scheme.adapter');
const documentReader = require('../services/kehr-document-reader.service');
const whatsappAdapter = require('../adapters/whatsapp.adapter');

// Plan-link tokens are signed with KEHR_LINK_SECRET. Outside production a
// per-process secret keeps local development working (links then expire on
// restart); in production, plan links are refused until it is configured.
const configuredSecret = process.env.KEHR_LINK_SECRET || null;
const linksEnabled = !(process.env.NODE_ENV === 'production' && !configuredSecret);
const linkSecret = configuredSecret || crypto.randomBytes(32).toString('hex');

const flow = createKehrFlow({
  repo: createKehrRepository({ query }),
  adapters: { identity: identityAdapter, income: incomeAdapter, scheme: schemeAdapter, documentReader, messenger: whatsappAdapter },
  secret: linkSecret,
});

// Bot crawling prevention (CLAUDE.md), on top of the global header.
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});

const CLIENT_ERRORS = /must be|Unknown consent source|not found|required|valid South African/i;

function fail(res, error, label) {
  if (CLIENT_ERRORS.test(error.message)) {
    const status = /not found/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: error.message });
  }
  console.error(`Kehr ${label} error:`, error.message);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function linksUnavailable(res) {
  return res.status(503).json({ error: 'Plan links are not available yet.' });
}

const isCents = (v) => Number.isInteger(v) && v >= 0;

/** Keeps only the figures a document reader produces; never files. */
function documentFigures(body = {}) {
  const out = {};
  if (typeof body.selfieToken === 'string' && body.selfieToken.length <= 200) out.selfieToken = body.selfieToken;
  const p = body.payslip;
  if (p && isCents(p.netPayCents)) {
    out.payslip = { employeeName: String(p.employeeName || '').slice(0, 120), idNumber: String(p.idNumber || '').slice(0, 13), netPayCents: p.netPayCents, grossPayCents: isCents(p.grossPayCents) ? p.grossPayCents : null };
  }
  const s = body.statement;
  if (s && Array.isArray(s.salaryCredits)) {
    out.statement = {
      accountHolder: String(s.accountHolder || '').slice(0, 120),
      salaryCredits: s.salaryCredits.filter((c) => c && isCents(c.amountCents)).slice(0, 12).map((c) => ({ amountCents: c.amountCents })),
      debitOrdersCents: isCents(s.debitOrdersCents) ? s.debitOrdersCents : 0,
      openingBalanceCents: Number.isInteger(s.openingBalanceCents) ? s.openingBalanceCents : null,
      totalCreditsCents: isCents(s.totalCreditsCents) ? s.totalCreditsCents : null,
      totalDebitsCents: isCents(s.totalDebitsCents) ? s.totalDebitsCents : null,
      closingBalanceCents: Number.isInteger(s.closingBalanceCents) ? s.closingBalanceCents : null,
    };
  }
  return out;
}

async function resolveProviderId(user) {
  if (user.providerId) return user.providerId;
  const r = await query(
    'SELECT provider_id FROM provider_user_link WHERE user_id = $1 AND is_primary = true LIMIT 1',
    [user.userId]
  ).catch(() => ({ rows: [] }));
  return r.rows[0] ? r.rows[0].provider_id : null;
}

// ── Consents ─────────────────────────────────────────────

router.get('/consents', authenticateToken, async (req, res) => {
  try {
    res.json({ consents: await flow.listConsents(req.user.userId), sources: flow.consentSources() });
  } catch (error) { fail(res, error, 'list consents'); }
});

router.post('/consents', authenticateToken, async (req, res) => {
  try {
    res.status(201).json({ consents: await flow.grantConsent(req.user.userId, String(req.body.source || '')) });
  } catch (error) { fail(res, error, 'grant consent'); }
});

router.delete('/consents/:source', authenticateToken, async (req, res) => {
  try {
    res.json({ consents: await flow.withdrawConsent(req.user.userId, req.params.source) });
  } catch (error) { fail(res, error, 'withdraw consent'); }
});

// ── Pre-approval ─────────────────────────────────────────

router.post('/preapprovals', authenticateToken, async (req, res) => {
  try {
    const { procedureCode, estimateCents, urgency, scheme } = req.body || {};
    const result = await flow.startPreapproval(req.user.userId, {
      procedureCode: procedureCode ? String(procedureCode).slice(0, 100) : null,
      estimateCents,
      urgency,
      scheme: scheme && typeof scheme === 'object' ? {
        name: String(scheme.name || '').slice(0, 100) || null,
        option: String(scheme.option || '').slice(0, 100) || null,
        membershipNumber: String(scheme.membershipNumber || '').slice(0, 40) || null,
      } : null,
    });
    res.status(201).json(result);
  } catch (error) { fail(res, error, 'start pre-approval'); }
});

router.post('/preapprovals/:id/documents', authenticateToken, async (req, res) => {
  try {
    res.json(await flow.submitDocuments(req.user.userId, req.params.id, documentFigures(req.body)));
  } catch (error) { fail(res, error, 'documents'); }
});

// v1.22.0: read a payslip or statement into figures. The file goes to the
// reader and is dropped; only the figures are stored.
router.post('/preapprovals/:id/documents/upload', authenticateToken, async (req, res) => {
  try {
    const { fileBase64, mediaType } = req.body || {};
    if (!documentReader.ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: 'Upload a PDF, JPG or PNG.' });
    }
    if (typeof fileBase64 !== 'string' || !fileBase64 || Buffer.byteLength(fileBase64, 'base64') > documentReader.MAX_DOCUMENT_BYTES) {
      return res.status(400).json({ error: 'The file must be under 4MB.' });
    }
    if (!documentReader.isAvailable()) {
      return res.status(503).json({ error: "We can't read documents right now. Connect your bank instead, or try again later." });
    }
    res.json(await flow.readDocument(req.user.userId, req.params.id, { base64Data: fileBase64, mediaType }));
  } catch (error) { fail(res, error, 'read document'); }
});

router.post('/preapprovals/:id/assess', authenticateToken, async (req, res) => {
  try {
    res.json(await flow.assess(req.user.userId, req.params.id));
  } catch (error) { fail(res, error, 'assess'); }
});

router.post('/preapprovals/:id/review', authenticateToken, async (req, res) => {
  try {
    res.json(await flow.requestReview(req.user.userId, req.params.id));
  } catch (error) { fail(res, error, 'request review'); }
});

router.get('/pass', authenticateToken, async (req, res) => {
  try {
    res.json({ pass: await flow.getPass(req.user.userId) });
  } catch (error) { fail(res, error, 'get pass'); }
});

router.post('/plan-links/redeem', authenticateToken, async (req, res) => {
  try {
    if (!linksEnabled) return linksUnavailable(res);
    res.json(await flow.redeemPlanLink(req.user.userId, String(req.body.token || '')));
  } catch (error) { fail(res, error, 'redeem link'); }
});

// ── Provider ─────────────────────────────────────────────

router.post('/provider/plan-links', authenticateToken, requireProvider, async (req, res) => {
  try {
    if (!linksEnabled) return linksUnavailable(res);
    const providerId = await resolveProviderId(req.user);
    if (!providerId) return res.status(403).json({ error: 'No provider practice is linked to this account.' });
    const { patientPhone, amountCents, billTotalCents, procedureCode, deliver, patientAgreedToWhatsApp } = req.body || {};
    const link = await flow.createProviderPlanLink(providerId, {
      patientPhone,
      amountCents,
      billTotalCents: billTotalCents === undefined ? null : billTotalCents,
      procedureCode: procedureCode ? String(procedureCode).slice(0, 100) : null,
      deliver: deliver === 'whatsapp' ? 'whatsapp' : null,
      patientAgreedToWhatsApp: patientAgreedToWhatsApp === true,
    });
    res.status(201).json(link);
  } catch (error) { fail(res, error, 'create plan link'); }
});

router.get('/provider/passes/:code', authenticateToken, requireProvider, async (req, res) => {
  try {
    const pass = await flow.providerCheckPass(req.params.code);
    if (!pass) return res.status(404).json({ error: 'No pass with that code.' });
    res.json({ pass });
  } catch (error) { fail(res, error, 'check pass'); }
});

module.exports = router;
