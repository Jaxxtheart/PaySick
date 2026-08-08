/**
 * SANParks Media Licensing — rights engine.
 *
 * Everything in here answers one question: may this frame be granted to this
 * buyer, on these terms, right now? It has to be answered before money moves,
 * because an exclusivity promise cannot be withdrawn once it has been sold — and
 * a frame whose copyright has already been assigned is not SANParks' to sell a
 * second time.
 *
 * Three groups of rules:
 *
 *   Asset state      — assigned, withdrawn or embargoed assets are off the table.
 *   Entitlement      — the subscriber's plan bounds the scope, the resolution,
 *                      and whether exclusivity may be bought at all.
 *   Conflicts        — an exclusive grant blocks overlapping grants; exclusivity
 *                      cannot be sold over grants that are already live.
 *
 * Two gates are conservation rather than commercial policy. Commercial
 * exploitation of imagery captured on SANParks land requires a property release,
 * and no asset featuring a sensitive species leaves the platform with its
 * location metadata intact — a geotagged rhino is a poaching map.
 *
 * Every transfer appends a hash-linked entry to the asset's chain of title, so
 * provenance stays verifiable years after the sale.
 */

'use strict';

const crypto = require('crypto');

const LICENCE_SCOPES = ['PERSONAL', 'EDITORIAL', 'COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT'];
const TERRITORIES = ['SINGLE_COUNTRY', 'REGIONAL', 'WORLDWIDE'];
const LICENCE_TERMS = ['ONE_YEAR', 'THREE_YEARS', 'PERPETUAL'];
const RESOLUTION_TIERS = ['WEB', 'FULL', 'MASTER'];

/** Scopes that amount to commercial exploitation of SANParks property. */
const COMMERCIAL_SCOPES = ['COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT'];

const LICENCE_TERM_YEARS = { ONE_YEAR: 1, THREE_YEARS: 3, PERPETUAL: null };

const GENESIS_HASH = '0'.repeat(64);

function resolutionRank(tier) {
  return RESOLUTION_TIERS.indexOf(tier);
}

/** A buyout assigns the copyright; anything else is a licence, exclusive or not. */
function instrumentTypeFor(scope, exclusive) {
  if (scope === 'EXCLUSIVE_BUYOUT') return 'ASSIGNMENT';
  return exclusive ? 'EXCLUSIVE_LICENCE' : 'LICENCE';
}

/**
 * Do two territorial grants cover any of the same ground?
 *
 * Worldwide overlaps everything. Two grants at the same level overlap only when
 * they name the same place. Mixed levels cannot be proven disjoint from the codes
 * alone, so they are treated as overlapping — the conservative answer, since the
 * cost of a false overlap is a refused sale and the cost of a missed one is an
 * exclusivity breach.
 */
function territoriesOverlap(a, b) {
  if (a.territory === 'WORLDWIDE' || b.territory === 'WORLDWIDE') return true;
  if (a.territory === b.territory) {
    return String(a.territoryCode || '') === String(b.territoryCode || '');
  }
  return true;
}

/**
 * Do two scopes compete in the same market?
 *
 * A buyout swallows every market. Personal use competes with nothing — one
 * visitor printing a photograph for their wall does not erode an exclusive
 * broadcast deal. Otherwise, a market only conflicts with itself: editorial
 * exclusivity does not prevent a commercial licence.
 */
function scopesConflict(a, b) {
  if (a === 'EXCLUSIVE_BUYOUT' || b === 'EXCLUSIVE_BUYOUT') return true;
  if (a === 'PERSONAL' || b === 'PERSONAL') return false;
  return a === b;
}

function isGrantLive(grant, now) {
  if (grant.status && grant.status !== 'ACTIVE') return false;
  if (grant.endsAt === null || grant.endsAt === undefined) return true;
  return now.getTime() < new Date(grant.endsAt).getTime();
}

/**
 * Evaluate a proposed grant against the asset, the plan and the live grants.
 *
 * Every blocker is reported at once rather than one at a time — a buyer fixing a
 * missing model release should not then discover the resolution was also wrong.
 *
 * @returns {{ok: boolean, blockers: Array<{code: string, message: string}>, instrumentType: string}}
 */
function checkRightsConflicts({ asset, plan, request, activeGrants = [], now }) {
  const blockers = [];
  const add = (code, message) => blockers.push({ code, message });

  const wantsExclusive = request.exclusive === true || request.scope === 'EXCLUSIVE_BUYOUT';
  const instrumentType = instrumentTypeFor(request.scope, request.exclusive);

  // ── Asset state ───────────────────────────────────────────────────────────
  if (asset.rightsStatus === 'ASSIGNED') {
    add(
      'ASSET_ASSIGNED',
      'The copyright in this asset has been assigned to a previous buyer. SANParks no longer holds rights to license it.'
    );
  }
  if (asset.rightsStatus === 'WITHDRAWN') {
    add('ASSET_WITHDRAWN', 'This asset has been withdrawn from the catalogue and cannot be licensed.');
  }
  if (asset.embargoUntil && now.getTime() < new Date(asset.embargoUntil).getTime()) {
    add(
      'EMBARGOED',
      `This asset is under embargo until ${new Date(asset.embargoUntil).toISOString().slice(0, 10)}.`
    );
  }

  // ── Plan entitlement ──────────────────────────────────────────────────────
  if (!plan.allowedScopes.includes(request.scope)) {
    add(
      'SCOPE_NOT_IN_PLAN',
      `A ${plan.code} subscription does not include ${request.scope} licensing. Upgrade the subscription to acquire this scope.`
    );
  }
  if (resolutionRank(request.resolutionTier) > resolutionRank(plan.maxResolutionTier)) {
    add(
      'RESOLUTION_ABOVE_PLAN',
      `A ${plan.code} subscription delivers up to ${plan.maxResolutionTier} resolution.`
    );
  }
  if (resolutionRank(request.resolutionTier) > resolutionRank(asset.maxResolutionTier)) {
    add(
      'RESOLUTION_UNAVAILABLE',
      `This asset is only held up to ${asset.maxResolutionTier} resolution.`
    );
  }
  if (wantsExclusive && !plan.exclusivityEligible) {
    add(
      'EXCLUSIVITY_NOT_ELIGIBLE',
      `Exclusive rights and full buyouts are available on the Broadcast & Rights tier only.`
    );
  }

  // ── Releases and conservation ─────────────────────────────────────────────
  if (COMMERCIAL_SCOPES.includes(request.scope) && !asset.propertyReleaseId) {
    add(
      'MISSING_PROPERTY_RELEASE',
      'Commercial use of imagery captured on SANParks property requires a signed property release, which is not held for this asset.'
    );
  }
  if (
    COMMERCIAL_SCOPES.includes(request.scope) &&
    asset.containsIdentifiablePersons &&
    !asset.modelReleaseId
  ) {
    add(
      'MISSING_MODEL_RELEASE',
      'This asset shows identifiable people and no model release is held, so it cannot be licensed for commercial use.'
    );
  }
  if (asset.sensitiveSpecies && !asset.geoRedacted) {
    add(
      'SENSITIVE_LOCATION_NOT_REDACTED',
      'This asset features a species at poaching risk and still carries location metadata. It cannot be released until the geodata has been stripped.'
    );
  }

  // ── Conflicts with live grants ────────────────────────────────────────────
  const live = activeGrants.filter((g) => isGrantLive(g, now));
  const overlapping = live.filter(
    (g) => territoriesOverlap(g, request) && scopesConflict(g.scope, request.scope)
  );

  if (overlapping.some((g) => g.exclusive)) {
    add(
      'BLOCKED_BY_EXCLUSIVE_GRANT',
      'An exclusive licence covering this market and territory is already live on this asset.'
    );
  }
  if (wantsExclusive && overlapping.length > 0) {
    add(
      'EXCLUSIVITY_UNAVAILABLE',
      `Exclusivity cannot be granted — ${overlapping.length} licence(s) covering this market and territory are already live.`
    );
  }

  return { ok: blockers.length === 0, blockers, instrumentType };
}

/** When a licence granted now would expire. Perpetual licences never do. */
function licenceEndDate(startsAt, licenceTerm) {
  const years = LICENCE_TERM_YEARS[licenceTerm];
  if (years === undefined) throw new Error(`Unknown licence term: ${licenceTerm}`);
  if (years === null) return null;

  const end = new Date(startsAt.getTime());
  end.setUTCFullYear(end.getUTCFullYear() + years);
  return end;
}

/**
 * What the grant does to the asset record itself. An assignment moves the rights
 * holder and takes the asset off sale; an exclusive licence flags it; an ordinary
 * licence changes nothing.
 */
function deriveRightsMutation({ asset, instrumentType, licenseeId }) {
  if (instrumentType === 'ASSIGNMENT') {
    return { rightsStatus: 'ASSIGNED', rightsHolderId: licenseeId, changed: true };
  }
  if (instrumentType === 'EXCLUSIVE_LICENCE') {
    return { rightsStatus: 'EXCLUSIVELY_LICENSED', rightsHolderId: asset.rightsHolderId, changed: true };
  }
  return { rightsStatus: asset.rightsStatus || 'AVAILABLE', rightsHolderId: asset.rightsHolderId, changed: false };
}

// ─── Chain of title ──────────────────────────────────────────────────────────

/** Stable stringify — key order must not change the hash. */
function canonicalise(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalise(value[k])}`).join(',')}}`;
}

function hashEntry({ assetId, sequence, previousHash, event, payload, recordedAt }) {
  return crypto
    .createHash('sha256')
    .update(canonicalise({ assetId, sequence, previousHash, event, payload, recordedAt }))
    .digest('hex');
}

/**
 * Append an entry to an asset's chain of title.
 * The first entry links to the genesis hash at sequence 1.
 */
function buildChainEntry({ previousEntry, assetId, event, payload, at }) {
  const sequence = previousEntry ? Number(previousEntry.sequence) + 1 : 1;
  const previousHash = previousEntry ? previousEntry.entryHash : GENESIS_HASH;
  const recordedAt = new Date(at).toISOString();

  const entry = { assetId, sequence, previousHash, event, payload: payload || {}, recordedAt };
  return { ...entry, entryHash: hashEntry(entry) };
}

/**
 * Verify a chain end to end: contents unaltered, sequence unbroken, links intact.
 *
 * @returns {{valid: boolean, brokenAt: number|null}} brokenAt is the sequence
 *          number of the first entry that fails.
 */
function verifyChain(entries) {
  let expectedPreviousHash = GENESIS_HASH;
  let expectedSequence = 1;

  for (const entry of entries) {
    if (Number(entry.sequence) !== expectedSequence || entry.previousHash !== expectedPreviousHash) {
      return { valid: false, brokenAt: Number(entry.sequence) };
    }
    if (hashEntry(entry) !== entry.entryHash) {
      return { valid: false, brokenAt: Number(entry.sequence) };
    }
    expectedPreviousHash = entry.entryHash;
    expectedSequence += 1;
  }

  return { valid: true, brokenAt: null };
}

const INSTRUMENT_DESCRIPTIONS = {
  ASSIGNMENT:
    'Full assignment — the copyright in this asset is transferred to the licensee. SANParks retains no licensing rights.',
  EXCLUSIVE_LICENCE:
    'Exclusive licence — copyright remains with the rights holder, who may not licence this market and territory to anyone else while this grant is live.',
  LICENCE:
    'Non-exclusive licence — copyright remains with the rights holder, who may licence the same asset to others.',
};

/**
 * The document the buyer receives: what was granted, to whom, where, for how
 * long, and the chain-of-title hash that proves it.
 */
function buildRightsCertificate({ licence, asset, chainEntry }) {
  const restrictions = [
    `Use is limited to the ${licence.scope} scope in ${licence.territory}; any other use requires a further licence.`,
    'The asset may not be used to train machine-learning models, or supplied to any third party for that purpose.',
  ];

  if (asset.sensitiveSpecies) {
    restrictions.push(
      'Capture location metadata has been redacted. The location of this sighting may not be published, inferred or re-attached to the file.'
    );
  }
  if (licence.instrumentType !== 'ASSIGNMENT') {
    restrictions.push('Copyright is not transferred by this licence and remains with the rights holder.');
  }
  if (!licence.exclusive && licence.instrumentType === 'LICENCE') {
    restrictions.push('This grant is non-exclusive — SANParks may licence the same asset to others.');
  }

  return {
    certificateId: `SPC-${String(licence.licenceId).toUpperCase()}`,
    licenceId: licence.licenceId,
    assetId: asset.assetId,
    grantedTo: licence.licenseeName || licence.licenseeId,
    licenseeId: licence.licenseeId,
    instrumentType: licence.instrumentType,
    instrumentDescription: INSTRUMENT_DESCRIPTIONS[licence.instrumentType],
    scope: licence.scope,
    territory: licence.territory,
    territoryCode: licence.territoryCode || null,
    licenceTerm: licence.licenceTerm,
    resolutionTier: licence.resolutionTier,
    exclusive: Boolean(licence.exclusive),
    grantedAt: licence.startsAt,
    expiresAt: licence.endsAt,
    restrictions,
    chainSequence: chainEntry.sequence,
    verificationHash: chainEntry.entryHash,
  };
}

module.exports = {
  LICENCE_SCOPES,
  TERRITORIES,
  LICENCE_TERMS,
  RESOLUTION_TIERS,
  COMMERCIAL_SCOPES,
  GENESIS_HASH,
  instrumentTypeFor,
  territoriesOverlap,
  scopesConflict,
  checkRightsConflicts,
  licenceEndDate,
  deriveRightsMutation,
  buildChainEntry,
  verifyChain,
  buildRightsCertificate,
};
