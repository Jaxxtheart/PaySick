/**
 * Scheme Benefit Verification Adapter (mock).
 *
 * Interface:
 *   verifySchemeBenefit({ scheme, plan, providerId, procedureCode, invoiceCents })
 *     -> { schemeBenefitCents, schemeMembershipVerified, dspIsOnList, source }
 *
 * schemeBenefitCents is the RAND amount the scheme will pay on this invoice,
 * as confirmed by the scheme. The gap financed by Shield is
 * invoice − schemeBenefitCents. A scheme-rate multiple (e.g. 200% of scheme
 * rate) is NOT a coverage percentage and must never be used as one.
 *
 * Production swap point: scheme pre-authorisation / benefit-check API.
 */

'use strict';

const dsp = require('./dsp-check.adapter');

async function verifySchemeBenefit({ scheme, plan, providerId, invoiceCents } = {}) {
  if (!scheme || !plan || !providerId || !invoiceCents) {
    throw new Error('verifySchemeBenefit requires scheme, plan, providerId and invoiceCents');
  }
  const status = await dsp.checkDspStatus(scheme, plan, providerId);
  const retrievedAt = new Date().toISOString();
  // Mock: schemes typically settle 50–80% of a specialist invoice.
  const settlePct = { FULL_PMB: 0.8, FUND_RATE: 0.65, PARTIAL: 0.5, NONE: 0 }[status.coverageType] ?? 0;
  return {
    schemeBenefitCents: Math.round(invoiceCents * settlePct),
    schemeMembershipVerified: true,
    dspIsOnList: status.isDsp,
    source: { name: 'scheme-benefit-mock', isMock: true, retrievedAt }
  };
}

module.exports = { verifySchemeBenefit };
