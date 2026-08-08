'use strict';

/**
 * Unit Tests — SANParks image/footage rights engine
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Selling the file is the easy half. The half that matters is the rights: what
 * the buyer may do with the frame, where, for how long, and whether SANParks
 * still has anything left to sell afterwards. This module decides that, and it
 * has to decide it before a cent moves, because an exclusivity promise cannot be
 * un-promised once the money has been taken.
 *
 * Three things are pinned here:
 *
 *   1. Conflict detection — you cannot grant exclusivity you have already given
 *      away, and you cannot sell a frame whose copyright has been assigned.
 *   2. Release and conservation gates — commercial exploitation of SANParks land
 *      needs a property release, identifiable people need a model release, and
 *      the location of a rhino is never sold with the file.
 *   3. Chain of title — every transfer appends a hash-linked entry, so the
 *      provenance of a frame is tamper-evident years later.
 *
 * Run: node --test tests/unit/sanparks-rights.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const rights = require('../../backend/src/services/sanparks-rights.service');

const {
  LICENCE_SCOPES,
  TERRITORIES,
  LICENCE_TERMS,
  RESOLUTION_TIERS,
  GENESIS_HASH,
  instrumentTypeFor,
  territoriesOverlap,
  scopesConflict,
  checkRightsConflicts,
  deriveRightsMutation,
  licenceEndDate,
  buildChainEntry,
  verifyChain,
  buildRightsCertificate,
} = rights;

const NOW = new Date('2026-08-08T09:00:00Z');

function asset(overrides = {}) {
  return {
    assetId: 'asset-1',
    park: 'KRUGER',
    mediaType: 'VIDEO',
    rightsStatus: 'AVAILABLE',
    rightsHolderId: 'sanparks',
    maxResolutionTier: 'MASTER',
    propertyReleaseId: 'prop-release-1',
    containsIdentifiablePersons: false,
    modelReleaseId: null,
    sensitiveSpecies: false,
    geoRedacted: false,
    embargoUntil: null,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return {
    code: 'BROADCAST',
    allowedScopes: ['PERSONAL', 'EDITORIAL', 'COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT'],
    exclusivityEligible: true,
    maxResolutionTier: 'MASTER',
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    scope: 'BROADCAST',
    territory: 'WORLDWIDE',
    territoryCode: null,
    licenceTerm: 'ONE_YEAR',
    resolutionTier: 'MASTER',
    exclusive: false,
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    licenceId: 'lic-existing',
    scope: 'BROADCAST',
    territory: 'WORLDWIDE',
    territoryCode: null,
    exclusive: false,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2027-01-01T00:00:00Z'),
    status: 'ACTIVE',
    ...overrides,
  };
}

function blockerCodes(result) {
  return result.blockers.map((b) => b.code);
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

describe('rights vocabulary', () => {
  test('licence scopes run from personal use to a full buyout', () => {
    assert.deepEqual(LICENCE_SCOPES, [
      'PERSONAL',
      'EDITORIAL',
      'COMMERCIAL',
      'BROADCAST',
      'EXCLUSIVE_BUYOUT',
    ]);
  });

  test('territories and licence terms are closed sets', () => {
    assert.deepEqual(TERRITORIES, ['SINGLE_COUNTRY', 'REGIONAL', 'WORLDWIDE']);
    assert.deepEqual(LICENCE_TERMS, ['ONE_YEAR', 'THREE_YEARS', 'PERPETUAL']);
    assert.deepEqual(RESOLUTION_TIERS, ['WEB', 'FULL', 'MASTER']);
  });
});

describe('instrumentTypeFor', () => {
  test('a buyout assigns the copyright outright', () => {
    assert.equal(instrumentTypeFor('EXCLUSIVE_BUYOUT', false), 'ASSIGNMENT');
    assert.equal(instrumentTypeFor('EXCLUSIVE_BUYOUT', true), 'ASSIGNMENT');
  });

  test('an exclusive request short of a buyout is an exclusive licence', () => {
    assert.equal(instrumentTypeFor('BROADCAST', true), 'EXCLUSIVE_LICENCE');
  });

  test('everything else is an ordinary licence', () => {
    assert.equal(instrumentTypeFor('EDITORIAL', false), 'LICENCE');
    assert.equal(instrumentTypeFor('PERSONAL', false), 'LICENCE');
  });
});

// ─── Overlap primitives ──────────────────────────────────────────────────────

describe('territoriesOverlap', () => {
  test('worldwide overlaps everything', () => {
    assert.equal(territoriesOverlap({ territory: 'WORLDWIDE' }, { territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' }), true);
    assert.equal(territoriesOverlap({ territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' }, { territory: 'WORLDWIDE' }), true);
  });

  test('two different single countries do not overlap', () => {
    assert.equal(
      territoriesOverlap({ territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' }, { territory: 'SINGLE_COUNTRY', territoryCode: 'DE' }),
      false
    );
  });

  test('the same single country overlaps itself', () => {
    assert.equal(
      territoriesOverlap({ territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' }, { territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' }),
      true
    );
  });

  test('regions overlap only themselves', () => {
    assert.equal(
      territoriesOverlap({ territory: 'REGIONAL', territoryCode: 'EU' }, { territory: 'REGIONAL', territoryCode: 'EU' }),
      true
    );
    assert.equal(
      territoriesOverlap({ territory: 'REGIONAL', territoryCode: 'EU' }, { territory: 'REGIONAL', territoryCode: 'APAC' }),
      false
    );
  });
});

describe('scopesConflict', () => {
  test('a buyout conflicts with every scope', () => {
    for (const scope of LICENCE_SCOPES) {
      assert.equal(scopesConflict('EXCLUSIVE_BUYOUT', scope), true, `buyout vs ${scope}`);
    }
  });

  test('personal use never competes with a commercial market', () => {
    assert.equal(scopesConflict('PERSONAL', 'BROADCAST'), false);
    assert.equal(scopesConflict('BROADCAST', 'PERSONAL'), false);
  });

  test('distinct commercial markets do not conflict with each other', () => {
    assert.equal(scopesConflict('EDITORIAL', 'BROADCAST'), false);
    assert.equal(scopesConflict('COMMERCIAL', 'BROADCAST'), false);
  });

  test('the same market conflicts with itself', () => {
    assert.equal(scopesConflict('BROADCAST', 'BROADCAST'), true);
  });
});

// ─── Conflict detection ──────────────────────────────────────────────────────

describe('checkRightsConflicts — clean grant', () => {
  test('an ordinary grant on an available asset passes', () => {
    const r = checkRightsConflicts({ asset: asset(), plan: plan(), request: request(), activeGrants: [], now: NOW });
    assert.equal(r.ok, true);
    assert.deepEqual(r.blockers, []);
  });

  test('the result names the instrument that would be created', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request({ scope: 'EXCLUSIVE_BUYOUT' }),
      activeGrants: [],
      now: NOW,
    });
    assert.equal(r.instrumentType, 'ASSIGNMENT');
  });
});

describe('checkRightsConflicts — asset state', () => {
  test('an asset whose copyright has been assigned can no longer be licensed', () => {
    const r = checkRightsConflicts({
      asset: asset({ rightsStatus: 'ASSIGNED', rightsHolderId: 'buyer-9' }),
      plan: plan(),
      request: request(),
      activeGrants: [],
      now: NOW,
    });
    assert.equal(r.ok, false);
    assert.ok(blockerCodes(r).includes('ASSET_ASSIGNED'));
  });

  test('a withdrawn asset cannot be licensed', () => {
    const r = checkRightsConflicts({
      asset: asset({ rightsStatus: 'WITHDRAWN' }),
      plan: plan(),
      request: request(),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('ASSET_WITHDRAWN'));
  });

  test('an embargoed asset cannot be licensed until the embargo lifts', () => {
    const embargoed = asset({ embargoUntil: new Date('2026-12-01T00:00:00Z') });
    const during = checkRightsConflicts({ asset: embargoed, plan: plan(), request: request(), activeGrants: [], now: NOW });
    assert.ok(blockerCodes(during).includes('EMBARGOED'));

    const after = checkRightsConflicts({
      asset: embargoed,
      plan: plan(),
      request: request(),
      activeGrants: [],
      now: new Date('2027-01-01T00:00:00Z'),
    });
    assert.equal(after.ok, true);
  });
});

describe('checkRightsConflicts — plan entitlement', () => {
  test('a scope outside the plan is refused', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan({ code: 'SUPPORTER', allowedScopes: ['PERSONAL'], exclusivityEligible: false, maxResolutionTier: 'WEB' }),
      request: request({ scope: 'BROADCAST', resolutionTier: 'WEB' }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('SCOPE_NOT_IN_PLAN'));
  });

  test('a resolution above the plan ceiling is refused', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan({ code: 'CREATOR', allowedScopes: ['PERSONAL', 'EDITORIAL'], exclusivityEligible: false, maxResolutionTier: 'FULL' }),
      request: request({ scope: 'EDITORIAL', resolutionTier: 'MASTER' }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('RESOLUTION_ABOVE_PLAN'));
  });

  test('a resolution the asset does not have is refused', () => {
    const r = checkRightsConflicts({
      asset: asset({ maxResolutionTier: 'FULL' }),
      plan: plan(),
      request: request({ resolutionTier: 'MASTER' }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('RESOLUTION_UNAVAILABLE'));
  });

  test('a plan that is not exclusivity-eligible cannot buy exclusivity', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan({ code: 'COMMERCIAL', allowedScopes: ['PERSONAL', 'EDITORIAL', 'COMMERCIAL'], exclusivityEligible: false }),
      request: request({ scope: 'COMMERCIAL', exclusive: true }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('EXCLUSIVITY_NOT_ELIGIBLE'));
  });
});

describe('checkRightsConflicts — releases and conservation', () => {
  test('commercial exploitation of SANParks land needs a property release', () => {
    const r = checkRightsConflicts({
      asset: asset({ propertyReleaseId: null }),
      plan: plan(),
      request: request({ scope: 'COMMERCIAL' }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('MISSING_PROPERTY_RELEASE'));
  });

  test('personal and editorial use do not need a property release', () => {
    for (const scope of ['PERSONAL', 'EDITORIAL']) {
      const r = checkRightsConflicts({
        asset: asset({ propertyReleaseId: null }),
        plan: plan(),
        request: request({ scope }),
        activeGrants: [],
        now: NOW,
      });
      assert.ok(!blockerCodes(r).includes('MISSING_PROPERTY_RELEASE'), `${scope} should not need a property release`);
    }
  });

  test('identifiable people need a model release for commercial use', () => {
    const r = checkRightsConflicts({
      asset: asset({ containsIdentifiablePersons: true, modelReleaseId: null }),
      plan: plan(),
      request: request({ scope: 'COMMERCIAL' }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(blockerCodes(r).includes('MISSING_MODEL_RELEASE'));
  });

  test('a held model release clears that gate', () => {
    const r = checkRightsConflicts({
      asset: asset({ containsIdentifiablePersons: true, modelReleaseId: 'model-release-4' }),
      plan: plan(),
      request: request({ scope: 'COMMERCIAL' }),
      activeGrants: [],
      now: NOW,
    });
    assert.equal(r.ok, true);
  });

  test('a sensitive species may not be released with its location intact — at any scope', () => {
    for (const scope of ['PERSONAL', 'EDITORIAL', 'COMMERCIAL', 'BROADCAST']) {
      const r = checkRightsConflicts({
        asset: asset({ sensitiveSpecies: true, geoRedacted: false }),
        plan: plan(),
        request: request({ scope }),
        activeGrants: [],
        now: NOW,
      });
      assert.ok(
        blockerCodes(r).includes('SENSITIVE_LOCATION_NOT_REDACTED'),
        `${scope} must still be blocked while geodata is intact`
      );
    }
  });

  test('once the geodata is stripped, the sensitive asset can be licensed', () => {
    const r = checkRightsConflicts({
      asset: asset({ sensitiveSpecies: true, geoRedacted: true }),
      plan: plan(),
      request: request(),
      activeGrants: [],
      now: NOW,
    });
    assert.equal(r.ok, true);
  });
});

describe('checkRightsConflicts — exclusivity', () => {
  test('an existing exclusive grant blocks a new grant in the same market and territory', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request(),
      activeGrants: [grant({ exclusive: true })],
      now: NOW,
    });
    assert.equal(r.ok, false);
    assert.ok(blockerCodes(r).includes('BLOCKED_BY_EXCLUSIVE_GRANT'));
  });

  test('an existing exclusive grant in another territory does not block', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request({ territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' }),
      activeGrants: [grant({ exclusive: true, territory: 'SINGLE_COUNTRY', territoryCode: 'DE' })],
      now: NOW,
    });
    assert.equal(r.ok, true);
  });

  test('an existing exclusive grant in another market does not block', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request({ scope: 'EDITORIAL' }),
      activeGrants: [grant({ exclusive: true, scope: 'BROADCAST' })],
      now: NOW,
    });
    assert.equal(r.ok, true);
  });

  test('an expired exclusive grant no longer blocks', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request(),
      activeGrants: [grant({ exclusive: true, endsAt: new Date('2026-02-01T00:00:00Z') })],
      now: NOW,
    });
    assert.equal(r.ok, true);
  });

  test('a revoked exclusive grant no longer blocks', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request(),
      activeGrants: [grant({ exclusive: true, status: 'REVOKED' })],
      now: NOW,
    });
    assert.equal(r.ok, true);
  });

  test('exclusivity cannot be sold over live non-exclusive grants in the same market', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request({ exclusive: true }),
      activeGrants: [grant({ exclusive: false })],
      now: NOW,
    });
    assert.equal(r.ok, false);
    assert.ok(blockerCodes(r).includes('EXCLUSIVITY_UNAVAILABLE'));
  });

  test('a buyout cannot be sold while ANY grant is live, in any market', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request({ scope: 'EXCLUSIVE_BUYOUT' }),
      activeGrants: [grant({ scope: 'EDITORIAL', territory: 'SINGLE_COUNTRY', territoryCode: 'ZA' })],
      now: NOW,
    });
    assert.equal(r.ok, false);
    assert.ok(blockerCodes(r).includes('EXCLUSIVITY_UNAVAILABLE'));
  });

  test('a perpetual exclusive grant blocks forever', () => {
    const r = checkRightsConflicts({
      asset: asset(),
      plan: plan(),
      request: request(),
      activeGrants: [grant({ exclusive: true, endsAt: null })],
      now: new Date('2099-01-01T00:00:00Z'),
    });
    assert.equal(r.ok, false);
    assert.ok(blockerCodes(r).includes('BLOCKED_BY_EXCLUSIVE_GRANT'));
  });

  test('every blocker carries a code and a human-readable message', () => {
    const r = checkRightsConflicts({
      asset: asset({ rightsStatus: 'ASSIGNED', propertyReleaseId: null }),
      plan: plan(),
      request: request({ scope: 'COMMERCIAL' }),
      activeGrants: [],
      now: NOW,
    });
    assert.ok(r.blockers.length >= 2, 'all blockers should be reported at once, not one at a time');
    for (const b of r.blockers) {
      assert.equal(typeof b.code, 'string');
      assert.ok(b.message.length > 0);
    }
  });
});

// ─── Licence end date ────────────────────────────────────────────────────────

describe('licenceEndDate', () => {
  test('a one-year licence ends a year out', () => {
    assert.equal(licenceEndDate(NOW, 'ONE_YEAR').toISOString().slice(0, 10), '2027-08-08');
  });

  test('a three-year licence ends three years out', () => {
    assert.equal(licenceEndDate(NOW, 'THREE_YEARS').toISOString().slice(0, 10), '2029-08-08');
  });

  test('a perpetual licence has no end date', () => {
    assert.equal(licenceEndDate(NOW, 'PERPETUAL'), null);
  });
});

// ─── Rights mutation ─────────────────────────────────────────────────────────

describe('deriveRightsMutation', () => {
  test('a buyout moves the holder and takes the asset off sale', () => {
    const m = deriveRightsMutation({
      asset: asset(),
      instrumentType: 'ASSIGNMENT',
      licenseeId: 'buyer-9',
    });
    assert.equal(m.rightsStatus, 'ASSIGNED');
    assert.equal(m.rightsHolderId, 'buyer-9');
  });

  test('an exclusive licence flags the asset but does not move the holder', () => {
    const m = deriveRightsMutation({
      asset: asset(),
      instrumentType: 'EXCLUSIVE_LICENCE',
      licenseeId: 'buyer-9',
    });
    assert.equal(m.rightsStatus, 'EXCLUSIVELY_LICENSED');
    assert.equal(m.rightsHolderId, 'sanparks');
  });

  test('an ordinary licence leaves the asset available', () => {
    const m = deriveRightsMutation({
      asset: asset(),
      instrumentType: 'LICENCE',
      licenseeId: 'buyer-9',
    });
    assert.equal(m.rightsStatus, 'AVAILABLE');
    assert.equal(m.rightsHolderId, 'sanparks');
  });
});

// ─── Chain of title ──────────────────────────────────────────────────────────

describe('buildChainEntry', () => {
  test('the first entry links to the genesis hash at sequence 1', () => {
    const e = buildChainEntry({
      previousEntry: null,
      assetId: 'asset-1',
      event: 'ASSET_REGISTERED',
      payload: { holder: 'sanparks' },
      at: NOW,
    });
    assert.equal(e.sequence, 1);
    assert.equal(e.previousHash, GENESIS_HASH);
    assert.match(e.entryHash, /^[0-9a-f]{64}$/);
  });

  test('subsequent entries link to their predecessor and increment the sequence', () => {
    const first = buildChainEntry({ previousEntry: null, assetId: 'asset-1', event: 'ASSET_REGISTERED', payload: {}, at: NOW });
    const second = buildChainEntry({
      previousEntry: first,
      assetId: 'asset-1',
      event: 'LICENCE_GRANTED',
      payload: { licenceId: 'lic-1' },
      at: NOW,
    });
    assert.equal(second.sequence, 2);
    assert.equal(second.previousHash, first.entryHash);
    assert.notEqual(second.entryHash, first.entryHash);
  });

  test('hashing is deterministic for identical content', () => {
    const args = { previousEntry: null, assetId: 'asset-1', event: 'ASSET_REGISTERED', payload: { a: 1, b: 2 }, at: NOW };
    assert.equal(buildChainEntry(args).entryHash, buildChainEntry(args).entryHash);
  });

  test('hashing does not depend on payload key order', () => {
    const a = buildChainEntry({ previousEntry: null, assetId: 'x', event: 'E', payload: { a: 1, b: 2 }, at: NOW });
    const b = buildChainEntry({ previousEntry: null, assetId: 'x', event: 'E', payload: { b: 2, a: 1 }, at: NOW });
    assert.equal(a.entryHash, b.entryHash);
  });

  test('any change to the payload changes the hash', () => {
    const a = buildChainEntry({ previousEntry: null, assetId: 'x', event: 'E', payload: { price: 100 }, at: NOW });
    const b = buildChainEntry({ previousEntry: null, assetId: 'x', event: 'E', payload: { price: 101 }, at: NOW });
    assert.notEqual(a.entryHash, b.entryHash);
  });
});

describe('verifyChain', () => {
  function chainOfThree() {
    const e1 = buildChainEntry({ previousEntry: null, assetId: 'a', event: 'ASSET_REGISTERED', payload: {}, at: NOW });
    const e2 = buildChainEntry({ previousEntry: e1, assetId: 'a', event: 'LICENCE_GRANTED', payload: { licenceId: 'l1' }, at: NOW });
    const e3 = buildChainEntry({ previousEntry: e2, assetId: 'a', event: 'RIGHTS_ASSIGNED', payload: { to: 'buyer' }, at: NOW });
    return [e1, e2, e3];
  }

  test('an intact chain verifies', () => {
    const r = verifyChain(chainOfThree());
    assert.equal(r.valid, true);
    assert.equal(r.brokenAt, null);
  });

  test('an empty chain verifies vacuously', () => {
    assert.equal(verifyChain([]).valid, true);
  });

  test('a tampered payload is detected', () => {
    const chain = chainOfThree();
    chain[1].payload = { licenceId: 'l1', price: 'free' };
    const r = verifyChain(chain);
    assert.equal(r.valid, false);
    assert.equal(r.brokenAt, 2);
  });

  test('a removed entry breaks the link', () => {
    const chain = chainOfThree();
    const r = verifyChain([chain[0], chain[2]]);
    assert.equal(r.valid, false);
  });

  test('a re-ordered chain is detected', () => {
    const chain = chainOfThree();
    const r = verifyChain([chain[1], chain[0], chain[2]]);
    assert.equal(r.valid, false);
  });
});

// ─── Certificate ─────────────────────────────────────────────────────────────

describe('buildRightsCertificate', () => {
  const licence = {
    licenceId: 'lic-77',
    licenseeId: 'buyer-9',
    licenseeName: 'Global Wildlife Network',
    scope: 'BROADCAST',
    territory: 'WORLDWIDE',
    territoryCode: null,
    licenceTerm: 'PERPETUAL',
    resolutionTier: 'MASTER',
    exclusive: true,
    instrumentType: 'EXCLUSIVE_LICENCE',
    startsAt: NOW,
    endsAt: null,
    netCents: 125000000,
  };

  test('states what was granted, to whom, where and for how long', () => {
    const chainEntry = buildChainEntry({ previousEntry: null, assetId: 'asset-1', event: 'LICENCE_GRANTED', payload: {}, at: NOW });
    const cert = buildRightsCertificate({ licence, asset: asset(), chainEntry });

    assert.equal(cert.licenceId, 'lic-77');
    assert.equal(cert.assetId, 'asset-1');
    assert.equal(cert.grantedTo, 'Global Wildlife Network');
    assert.equal(cert.scope, 'BROADCAST');
    assert.equal(cert.territory, 'WORLDWIDE');
    assert.equal(cert.exclusive, true);
    assert.equal(cert.expiresAt, null);
    assert.equal(cert.verificationHash, chainEntry.entryHash);
    assert.equal(cert.chainSequence, chainEntry.sequence);
  });

  test('carries the restrictions the buyer is bound by', () => {
    const chainEntry = buildChainEntry({ previousEntry: null, assetId: 'asset-1', event: 'LICENCE_GRANTED', payload: {}, at: NOW });
    const cert = buildRightsCertificate({
      licence,
      asset: asset({ sensitiveSpecies: true, geoRedacted: true }),
      chainEntry,
    });
    assert.ok(Array.isArray(cert.restrictions));
    assert.ok(
      cert.restrictions.some((r) => /location/i.test(r)),
      'a sensitive-species certificate must state the location restriction'
    );
  });

  test('an assignment certificate says the rights were transferred, not licensed', () => {
    const chainEntry = buildChainEntry({ previousEntry: null, assetId: 'asset-1', event: 'RIGHTS_ASSIGNED', payload: {}, at: NOW });
    const cert = buildRightsCertificate({
      licence: { ...licence, instrumentType: 'ASSIGNMENT', scope: 'EXCLUSIVE_BUYOUT' },
      asset: asset(),
      chainEntry,
    });
    assert.match(cert.instrumentDescription, /assign|transfer/i);
  });
});
