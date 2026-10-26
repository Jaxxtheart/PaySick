/**
 * DSP Check Adapter — scheme Designated Service Provider registry (mock).
 *
 * Interface:
 *   checkDspStatus(schemeCode, planCode, providerId) -> Promise<{
 *     isDsp: boolean
 *     coverageType: 'FULL_PMB' | 'FUND_RATE' | 'PARTIAL' | 'NONE'
 *     schemeRateMultiple: number      // e.g. 200 = 200% of scheme rate
 *   }>
 *
 * The mock returns deterministic values based on the inputs so the same
 * scheme+plan+provider triple always resolves to the same DSP outcome.
 * Production swap point: query the real DSP registry table or scheme API.
 */

'use strict';

function hashSeed(...parts) {
  let h = 0;
  const s = parts.map(String).join('|');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function checkDspStatus(schemeCode, planCode, providerId) {
  if (!schemeCode || !planCode || !providerId) {
    throw new Error('checkDspStatus requires schemeCode, planCode, providerId');
  }

  const seed = hashSeed(schemeCode, planCode, providerId);
  const isDsp = seed % 3 !== 0; // ~67% are DSP
  const coverageTypes = isDsp
    ? ['FULL_PMB', 'FUND_RATE', 'PARTIAL']
    : ['FUND_RATE', 'PARTIAL', 'NONE'];
  const coverageType = coverageTypes[seed % coverageTypes.length];

  // Common scheme rate multiples: 100%, 150%, 200%, 300%.
  const multiples = [100, 150, 200, 300];
  const schemeRateMultiple = multiples[seed % multiples.length];

  return { isDsp, coverageType, schemeRateMultiple };
}

module.exports = {
  checkDspStatus
};
