/**
 * Medical Scheme Adapter — cover and pre-authorisation (mock).
 *
 * Interface:
 *   getCover(params) -> { coverCents, gapCents, preAuthStatus, preAuthReference, tier, schemeName, option }
 *
 * Scheme data is special personal information (POPIA s26), so every call
 * needs the patient's scheme_cover consent token.
 *
 * Production swap point: replace with the scheme switch (or a broker API).
 * The mock is deterministic: the same member and procedure give the same answer.
 */

'use strict';

const crypto = require('crypto');
const { getMedicalAidTier } = require('../services/risk-model');

// Share of the quote the scheme covers, by tier, before the deterministic spread.
const TIER_COVER_SHARE = Object.freeze({
  comprehensive: 0.85,
  classic: 0.70,
  essential: 0.55,
  basic: 0.40,
  none: 0,
});

function seed(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest().readUInt32BE(0);
}

async function getCover(params = {}) {
  const { schemeName, option, membershipNumber, procedureCode, quoteCents, consentToken } = params;
  if (!consentToken) throw new Error('getCover requires a consentToken (scheme_cover consent)');
  if (!Number.isInteger(quoteCents) || quoteCents <= 0) throw new Error('getCover requires quoteCents as a positive integer');

  const tier = getMedicalAidTier(schemeName, option);
  const s = seed(schemeName, option, membershipNumber, procedureCode);
  // ±10 percentage points around the tier share, never the whole quote.
  const share = Math.max(0, Math.min(0.95, TIER_COVER_SHARE[tier] + ((s % 21) - 10) / 100));
  const coverCents = tier === 'none' ? 0 : Math.round(quoteCents * share);
  const preAuthStatus = tier === 'none' ? 'NOT_REQUIRED' : ['APPROVED', 'APPROVED', 'PENDING'][s % 3];

  return {
    schemeName: schemeName || null,
    option: option || null,
    tier,
    coverCents,
    gapCents: quoteCents - coverCents,
    preAuthStatus,
    preAuthReference: preAuthStatus === 'APPROVED' ? `PA-${(s % 1_000_000).toString().padStart(6, '0')}` : null,
  };
}

module.exports = { getCover, TIER_COVER_SHARE };
