/**
 * Shield Underwriting — data provenance checks shared by every stage.
 *
 * A block of external data is usable only when it is present, comes from a
 * production source (mock adapters are refused unless explicitly allowed
 * outside production) and is fresh enough for policy.
 */

'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function ageDays(timestamp, now) {
  if (!timestamp) return Infinity;
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * Returns reason codes for a data block; empty array when usable.
 * Missing block → DATA_UNAVAILABLE:<name>; mock source in production mode →
 * DATA_SOURCE_NOT_PRODUCTION:<name>.
 */
function provenanceIssues(name, block, { allowMockSources = false } = {}) {
  if (block === null || block === undefined) return [`DATA_UNAVAILABLE:${name}`];
  if (block.source && block.source.isMock && !allowMockSources) {
    return [`DATA_SOURCE_NOT_PRODUCTION:${name}`];
  }
  return [];
}

const SEVERITY = { PASS: 0, AMBER: 1, REFER: 2, DECLINE: 3 };

function worstStatus(statuses) {
  return statuses.reduce((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), 'PASS');
}

module.exports = { ageDays, provenanceIssues, worstStatus, SEVERITY };
