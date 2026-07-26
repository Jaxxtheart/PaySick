'use strict';

/**
 * FIT SCORING (§6.2)
 *
 * Transparent weights, tuned later against real conversion. Produces a 0–100
 * fit_score used to prioritise which enriched leads get drafted first.
 */

const { OUTREACH_CONFIG, VERTICAL_WEIGHTS } = require('../../config/outreach.config');

/**
 * @param {object} p  outreach_providers row (or a partial shape)
 * @returns {number}  integer 0–100
 */
function fitScore(p = {}) {
  const targetMetros = OUTREACH_CONFIG.targetMetros;
  let s = 0;

  s += (VERTICAL_WEIGHTS[p.vertical] ?? 0.3) * 40;          // sector fit
  s += targetMetros.includes(p.metro ?? '') ? 20 : 5;       // geo concentration
  s += p.website ? 15 : 0;                                  // established / reachable
  s += p.email ? 15 : 0;                                    // email channel available

  if (p.rating && p.ratings_count) {                        // credible, real practice
    s += Math.min(p.rating / 5, 1) * 5;
    s += Math.min((p.ratings_count ?? 0) / 100, 1) * 5;
  }

  return Math.round(s);                                     // 0–100
}

module.exports = { fitScore };
