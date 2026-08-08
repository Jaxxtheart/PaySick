'use strict';

/**
 * Unit Tests — SANParks licensing transaction
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The brief's hard requirement: the sale and the transfer of image rights happen
 * in the SAME transaction. Not "the sale, then a rights job". If the rights
 * cannot be granted, the money must not move; if the money cannot be taken, the
 * rights must not appear to have moved; and two broadcasters hitting "buy
 * exclusive" on the same lion-birth clip at the same instant must not both win.
 *
 * So the properties pinned here are transactional, not arithmetical:
 *
 *   - everything happens inside one db.transaction() callback
 *   - the asset row is locked FOR UPDATE before exclusivity is decided
 *   - a rights conflict aborts before any write is issued
 *   - a failure at any later write rejects, so the wrapper rolls the lot back
 *   - a replayed idempotency key returns the first licence instead of selling twice
 *
 * The database is faked here — these are unit tests. The fake matches on SQL
 * text rather than call order, so the implementation stays free to reorder reads.
 *
 * Run: node --test tests/unit/sanparks-licensing.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const licensing = require('../../backend/src/services/sanparks-licensing.service');

const { executeLicensingTransaction, LicensingError } = licensing;

const NOW = new Date('2026-08-08T09:00:00Z');

// ─── Fixtures ────────────────────────────────────────────────────────────────

function assetRow(overrides = {}) {
  return {
    asset_id: 'asset-lion-birth',
    title: 'Lioness giving birth, Satara',
    park: 'KRUGER',
    media_type: 'VIDEO',
    resolution_tier: 'MASTER',
    max_resolution_tier: 'MASTER',
    duration_seconds: 240,
    rarity_tier: 'ONCE_IN_A_LIFETIME',
    demand_index: 900,
    rights_status: 'AVAILABLE',
    rights_holder_id: 'sanparks',
    contributor_id: 'ranger-42',
    contributor_type: 'CONTRIBUTOR',
    contributor_royalty_bps: null,
    property_release_id: 'prop-1',
    contains_identifiable_persons: false,
    model_release_id: null,
    sensitive_species: false,
    geo_redacted: false,
    embargo_until: null,
    ...overrides,
  };
}

function subscriptionRow(overrides = {}) {
  return {
    subscription_id: 'sub-1',
    user_id: 'buyer-9',
    licensee_name: 'Global Wildlife Network',
    plan_code: 'BROADCAST',
    term_months: 24,
    starts_at: new Date('2026-01-01T00:00:00Z'),
    expires_at: new Date('2028-01-01T00:00:00Z'),
    cancelled_at: null,
    credits_remaining: 400,
    ...overrides,
  };
}

function baseRequest(overrides = {}) {
  return {
    subscriptionId: 'sub-1',
    userId: 'buyer-9',
    assetId: 'asset-lion-birth',
    scope: 'BROADCAST',
    territory: 'WORLDWIDE',
    territoryCode: null,
    licenceTerm: 'PERPETUAL',
    resolutionTier: 'MASTER',
    exclusive: false,
    idempotencyKey: 'idem-key-1',
    now: NOW,
    ...overrides,
  };
}

/**
 * Fake database. Routes queries by SQL text; records every statement so the
 * tests can assert on what was and was not issued.
 */
function makeDb(state = {}) {
  const {
    asset = assetRow(),
    subscription = subscriptionRow(),
    activeGrants = [],
    lastChainEntry = null,
    existingLicence = null,
    failOn = null,
  } = state;

  const calls = [];
  let rolledBack = false;
  let committed = false;

  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (failOn && failOn.test(sql)) {
        throw new Error('simulated database failure');
      }

      if (/insert\s+into/i.test(sql) || /^\s*update/i.test(sql)) {
        return { rows: [{}], rowCount: 1 };
      }
      if (/from\s+sanparks_assets/i.test(sql)) {
        return { rows: asset ? [asset] : [], rowCount: asset ? 1 : 0 };
      }
      if (/from\s+sanparks_subscriptions/i.test(sql)) {
        return { rows: subscription ? [subscription] : [], rowCount: subscription ? 1 : 0 };
      }
      if (/from\s+sanparks_licences/i.test(sql)) {
        if (/idempotency_key/i.test(sql)) {
          return { rows: existingLicence ? [existingLicence] : [], rowCount: existingLicence ? 1 : 0 };
        }
        return { rows: activeGrants, rowCount: activeGrants.length };
      }
      if (/from\s+sanparks_rights_chain/i.test(sql)) {
        return { rows: lastChainEntry ? [lastChainEntry] : [], rowCount: lastChainEntry ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const db = {
    calls,
    get rolledBack() {
      return rolledBack;
    },
    get committed() {
      return committed;
    },
    sqlMatching(re) {
      return calls.filter((c) => re.test(c.sql));
    },
    transaction: async (callback) => {
      try {
        const result = await callback(client);
        committed = true;
        return result;
      } catch (err) {
        rolledBack = true;
        throw err;
      }
    },
    query: client.query,
  };

  return db;
}

function grantRow(overrides = {}) {
  return {
    licence_id: 'lic-old',
    scope: 'BROADCAST',
    territory: 'WORLDWIDE',
    territory_code: null,
    exclusive: false,
    starts_at: new Date('2026-01-01T00:00:00Z'),
    ends_at: new Date('2027-01-01T00:00:00Z'),
    status: 'ACTIVE',
    ...overrides,
  };
}

async function expectRejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('expected the transaction to reject, but it resolved');
}

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('executeLicensingTransaction — a completed sale', () => {
  test('resolves with the licence, certificate, quote and splits', async () => {
    const db = makeDb();
    const receipt = await executeLicensingTransaction(baseRequest(), { db });

    assert.ok(receipt.licence, 'no licence returned');
    assert.ok(receipt.certificate, 'no rights certificate returned');
    assert.ok(receipt.quote, 'no price quote returned');
    assert.ok(receipt.splits, 'no revenue split returned');
    assert.ok(receipt.chainEntry, 'no chain-of-title entry returned');
  });

  test('everything happens inside a single transaction', async () => {
    const db = makeDb();
    await executeLicensingTransaction(baseRequest(), { db });
    assert.equal(db.committed, true);
    assert.equal(db.rolledBack, false);
  });

  test('the sale writes the licence, the payment, the splits and the chain entry together', async () => {
    const db = makeDb();
    await executeLicensingTransaction(baseRequest(), { db });

    assert.equal(db.sqlMatching(/insert into sanparks_licences/i).length, 1, 'licence not written');
    assert.equal(db.sqlMatching(/insert into sanparks_payments/i).length, 1, 'payment not written');
    assert.equal(db.sqlMatching(/insert into sanparks_rights_chain/i).length, 1, 'chain of title not appended');
    assert.ok(db.sqlMatching(/insert into sanparks_revenue_splits/i).length >= 1, 'revenue splits not written');
  });

  test('the asset row is locked FOR UPDATE before exclusivity is decided', async () => {
    const db = makeDb();
    await executeLicensingTransaction(baseRequest(), { db });

    const assetReads = db.sqlMatching(/from\s+sanparks_assets/i);
    assert.ok(assetReads.length >= 1, 'the asset was never read');
    assert.ok(
      assetReads.some((c) => /for update/i.test(c.sql)),
      'the asset row must be locked FOR UPDATE or two buyers can win the same exclusive'
    );

    const lockIndex = db.calls.findIndex((c) => /from\s+sanparks_assets/i.test(c.sql) && /for update/i.test(c.sql));
    const firstWrite = db.calls.findIndex((c) => /insert into/i.test(c.sql));
    assert.ok(lockIndex < firstWrite, 'the lock must be taken before anything is written');
  });

  test('the licence returned carries the granted terms', async () => {
    const db = makeDb();
    const { licence } = await executeLicensingTransaction(
      baseRequest({ scope: 'BROADCAST', territory: 'WORLDWIDE', licenceTerm: 'PERPETUAL' }),
      { db }
    );
    assert.equal(licence.scope, 'BROADCAST');
    assert.equal(licence.territory, 'WORLDWIDE');
    assert.equal(licence.licenceTerm, 'PERPETUAL');
    assert.equal(licence.endsAt, null, 'a perpetual licence has no end date');
    assert.equal(licence.licenseeId, 'buyer-9');
    assert.equal(licence.instrumentType, 'LICENCE');
    assert.ok(Number.isInteger(licence.netCents));
  });

  test('the revenue split written reconciles to the net taken', async () => {
    const db = makeDb();
    const { quote, splits } = await executeLicensingTransaction(baseRequest(), { db });
    assert.equal(
      splits.conservationLevyCents + splits.contributorRoyaltyCents + splits.platformFeeCents,
      quote.netCents
    );
  });
});

// ─── Rights transfer in the same transaction ─────────────────────────────────

describe('executeLicensingTransaction — rights move with the money', () => {
  test('a buyout updates the asset holder inside the same transaction', async () => {
    const db = makeDb();
    const { licence } = await executeLicensingTransaction(
      baseRequest({ scope: 'EXCLUSIVE_BUYOUT', exclusive: true }),
      { db }
    );

    assert.equal(licence.instrumentType, 'ASSIGNMENT');
    const assetUpdates = db.sqlMatching(/update sanparks_assets/i);
    assert.equal(assetUpdates.length, 1, 'the asset rights holder was not updated');
    assert.ok(
      assetUpdates[0].params.includes('ASSIGNED'),
      'the asset must be marked ASSIGNED so it cannot be sold again'
    );
    assert.ok(assetUpdates[0].params.includes('buyer-9'), 'the new rights holder was not recorded');
  });

  test('an exclusive licence flags the asset without moving the holder', async () => {
    const db = makeDb();
    const { licence } = await executeLicensingTransaction(baseRequest({ exclusive: true }), { db });

    assert.equal(licence.instrumentType, 'EXCLUSIVE_LICENCE');
    const assetUpdates = db.sqlMatching(/update sanparks_assets/i);
    assert.equal(assetUpdates.length, 1);
    assert.ok(assetUpdates[0].params.includes('EXCLUSIVELY_LICENSED'));
  });

  test('an ordinary licence leaves the asset available for the next buyer', async () => {
    const db = makeDb();
    await executeLicensingTransaction(baseRequest(), { db });
    const assetUpdates = db.sqlMatching(/update sanparks_assets/i);
    assert.ok(
      assetUpdates.every((c) => !c.params.includes('ASSIGNED')),
      'a non-exclusive sale must not take the asset off the catalogue'
    );
  });

  test('the chain-of-title entry links to the previous entry', async () => {
    const previous = {
      chain_id: 'chain-1',
      asset_id: 'asset-lion-birth',
      sequence: 4,
      entry_hash: 'f'.repeat(64),
    };
    const db = makeDb({ lastChainEntry: previous });
    const { chainEntry } = await executeLicensingTransaction(baseRequest(), { db });

    assert.equal(chainEntry.sequence, 5);
    assert.equal(chainEntry.previousHash, 'f'.repeat(64));
  });

  test('the certificate verification hash is the chain entry hash that was stored', async () => {
    const db = makeDb();
    const { certificate, chainEntry } = await executeLicensingTransaction(baseRequest(), { db });
    assert.equal(certificate.verificationHash, chainEntry.entryHash);

    const chainWrite = db.sqlMatching(/insert into sanparks_rights_chain/i)[0];
    assert.ok(
      chainWrite.params.includes(chainEntry.entryHash),
      'the hash on the certificate must be the hash committed to the chain'
    );
  });
});

// ─── Nothing partial ─────────────────────────────────────────────────────────

describe('executeLicensingTransaction — all or nothing', () => {
  test('a rights conflict aborts before any write is issued', async () => {
    const db = makeDb({ activeGrants: [grantRow({ exclusive: true })] });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));

    assert.ok(err instanceof LicensingError);
    assert.equal(err.code, 'RIGHTS_CONFLICT');
    assert.equal(err.status, 409);
    assert.ok(Array.isArray(err.blockers) && err.blockers.length > 0, 'the conflict must say why');

    assert.equal(db.sqlMatching(/insert into/i).length, 0, 'a blocked sale must not write anything');
    assert.equal(db.sqlMatching(/update sanparks_assets/i).length, 0, 'a blocked sale must not touch the asset');
    assert.equal(db.rolledBack, true);
  });

  test('exclusivity already sold to someone else blocks the second buyer', async () => {
    const db = makeDb({ activeGrants: [grantRow({ exclusive: false })] });
    const err = await expectRejection(executeLicensingTransaction(baseRequest({ exclusive: true }), { db }));
    assert.equal(err.code, 'RIGHTS_CONFLICT');
    assert.ok(err.blockers.some((b) => b.code === 'EXCLUSIVITY_UNAVAILABLE'));
  });

  test('an asset already assigned to a previous buyer cannot be sold again', async () => {
    const db = makeDb({ asset: assetRow({ rights_status: 'ASSIGNED', rights_holder_id: 'someone-else' }) });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'RIGHTS_CONFLICT');
    assert.ok(err.blockers.some((b) => b.code === 'ASSET_ASSIGNED'));
  });

  test('a failure writing the payment rejects, so the rights write rolls back too', async () => {
    const db = makeDb({ failOn: /insert into sanparks_payments/i });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));

    assert.match(err.message, /simulated database failure/);
    assert.equal(db.rolledBack, true, 'the transaction must roll back');
    assert.equal(db.committed, false);
  });

  test('a failure writing the chain of title rejects, so the sale rolls back too', async () => {
    const db = makeDb({ failOn: /insert into sanparks_rights_chain/i });
    await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(db.rolledBack, true);
    assert.equal(db.committed, false);
  });

  test('a failure updating the asset holder rejects the whole buyout', async () => {
    const db = makeDb({ failOn: /update sanparks_assets/i });
    await expectRejection(
      executeLicensingTransaction(baseRequest({ scope: 'EXCLUSIVE_BUYOUT', exclusive: true }), { db })
    );
    assert.equal(db.rolledBack, true);
  });
});

// ─── Subscription gate ───────────────────────────────────────────────────────

describe('executeLicensingTransaction — subscription gate', () => {
  test('a missing subscription is a 404', async () => {
    const db = makeDb({ subscription: null });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'SUBSCRIPTION_NOT_FOUND');
    assert.equal(err.status, 404);
    assert.equal(db.sqlMatching(/insert into/i).length, 0);
  });

  test('a missing asset is a 404', async () => {
    const db = makeDb({ asset: null });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'ASSET_NOT_FOUND');
    assert.equal(err.status, 404);
  });

  test('an expired subscription cannot licence', async () => {
    const db = makeDb({
      subscription: subscriptionRow({ expires_at: new Date('2026-01-02T00:00:00Z') }),
    });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'SUBSCRIPTION_NOT_ACTIVE');
    assert.equal(err.status, 403);
    assert.equal(db.sqlMatching(/insert into/i).length, 0);
  });

  test('a cancelled subscription cannot licence', async () => {
    const db = makeDb({ subscription: subscriptionRow({ cancelled_at: new Date('2026-03-01T00:00:00Z') }) });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'SUBSCRIPTION_NOT_ACTIVE');
  });

  test('a subscription belonging to another user cannot be spent', async () => {
    const db = makeDb({ subscription: subscriptionRow({ user_id: 'someone-else' }) });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'SUBSCRIPTION_NOT_FOUND');
  });

  test("a scope outside the subscriber's plan is a rights conflict, not a silent upsell", async () => {
    const db = makeDb({ subscription: subscriptionRow({ plan_code: 'SUPPORTER' }) });
    const err = await expectRejection(executeLicensingTransaction(baseRequest(), { db }));
    assert.equal(err.code, 'RIGHTS_CONFLICT');
    assert.ok(err.blockers.some((b) => b.code === 'SCOPE_NOT_IN_PLAN'));
  });
});

// ─── Credits ─────────────────────────────────────────────────────────────────

describe('executeLicensingTransaction — credits', () => {
  test('a credit-covered licence debits the subscription balance', async () => {
    const db = makeDb({ subscription: subscriptionRow({ plan_code: 'CREATOR', credits_remaining: 10 }) });
    const receipt = await executeLicensingTransaction(
      baseRequest({ scope: 'EDITORIAL', resolutionTier: 'FULL', licenceTerm: 'ONE_YEAR' }),
      { db }
    );

    assert.ok(receipt.credits.creditsSpent > 0, 'an editorial download should spend credits');
    assert.equal(receipt.credits.creditsRemainingAfter, 10 - receipt.credits.creditsSpent);
    assert.equal(db.sqlMatching(/update sanparks_subscriptions/i).length, 1, 'credits were not debited');
  });

  test('a cash sale spends no credits', async () => {
    const db = makeDb();
    const receipt = await executeLicensingTransaction(baseRequest(), { db });
    assert.equal(receipt.credits.creditsSpent, 0);
  });

  test('running out of credits bills the shortfall rather than failing', async () => {
    const db = makeDb({ subscription: subscriptionRow({ plan_code: 'CREATOR', credits_remaining: 1 }) });
    const receipt = await executeLicensingTransaction(
      baseRequest({ scope: 'EDITORIAL', resolutionTier: 'FULL', licenceTerm: 'ONE_YEAR' }),
      { db }
    );
    assert.ok(receipt.credits.overageUnits > 0);
    assert.equal(receipt.credits.creditsRemainingAfter, 0);
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe('executeLicensingTransaction — idempotency', () => {
  test('a replayed idempotency key returns the original licence without selling twice', async () => {
    const db = makeDb({
      existingLicence: {
        licence_id: 'lic-first',
        asset_id: 'asset-lion-birth',
        licensee_id: 'buyer-9',
        scope: 'BROADCAST',
        territory: 'WORLDWIDE',
        territory_code: null,
        licence_term: 'PERPETUAL',
        resolution_tier: 'MASTER',
        exclusive: false,
        instrument_type: 'LICENCE',
        starts_at: NOW,
        ends_at: null,
        net_cents: 123456,
        idempotency_key: 'idem-key-1',
      },
    });

    const receipt = await executeLicensingTransaction(baseRequest(), { db });

    assert.equal(receipt.replayed, true);
    assert.equal(receipt.licence.licenceId, 'lic-first');
    assert.equal(db.sqlMatching(/insert into sanparks_licences/i).length, 0, 'the licence must not be written twice');
    assert.equal(db.sqlMatching(/insert into sanparks_payments/i).length, 0, 'the buyer must not be charged twice');
  });

  test('a fresh key is not treated as a replay', async () => {
    const db = makeDb();
    const receipt = await executeLicensingTransaction(baseRequest({ idempotencyKey: 'brand-new' }), { db });
    assert.equal(receipt.replayed, false);
    assert.equal(db.sqlMatching(/insert into sanparks_licences/i).length, 1);
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe('executeLicensingTransaction — input validation', () => {
  test('missing required fields are rejected before the database is touched', async () => {
    const db = makeDb();
    const err = await expectRejection(executeLicensingTransaction(baseRequest({ assetId: undefined }), { db }));
    assert.equal(err.code, 'INVALID_REQUEST');
    assert.equal(err.status, 400);
    assert.equal(db.calls.length, 0, 'no query should have been issued');
  });

  test('an unknown scope is rejected as invalid input', async () => {
    const db = makeDb();
    const err = await expectRejection(executeLicensingTransaction(baseRequest({ scope: 'NFT' }), { db }));
    assert.equal(err.code, 'INVALID_REQUEST');
    assert.equal(err.status, 400);
  });

  test('LicensingError carries a code, a status and a message', () => {
    const err = new LicensingError('nope', { code: 'X', status: 418 });
    assert.equal(err.code, 'X');
    assert.equal(err.status, 418);
    assert.equal(err.message, 'nope');
    assert.ok(err instanceof Error);
  });
});
