'use strict';

/**
 * Unit Tests — SANParks media pricing engine
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * An asset's price is a base rate for its media type and resolution, walked
 * through a fixed chain of integer-basis-point multipliers:
 *
 *   base
 *     × rarity        (a lion giving birth is not a sunset over Kruger)
 *     × demand surge  (bounded — worldwide demand raises the price, but by a
 *                      capped amount, so a viral clip does not become unpriceable)
 *     × licence scope (personal … broadcast … full rights buyout)
 *     × territory     (single country … worldwide)
 *     × licence term  (one year … perpetual)
 *   = list
 *     − subscriber discount (by plan tier)
 *   = net, + 15% VAT = gross
 *
 * Net is then split three ways in the same breath as the sale: a conservation
 * levy back to SANParks, a royalty to the contributor who captured the frame,
 * and the platform fee. The three parts must reconcile to the net exactly — no
 * cent may be created or lost by rounding.
 *
 * Run: node --test tests/unit/sanparks-pricing.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../../backend/src/services/sanparks-pricing.service');

const {
  VAT_RATE_BPS,
  SURGE_CAP_BPS,
  BASE_PRICE_CENTS,
  RARITY_MULTIPLIER_BPS,
  SCOPE_MULTIPLIER_BPS,
  TERRITORY_MULTIPLIER_BPS,
  LICENCE_TERM_MULTIPLIER_BPS,
  surgeMultiplierBps,
  creditCostFor,
  splitRevenue,
  priceLicence,
} = pricing;

/** A plain, unremarkable still: the pricing baseline. */
function stillAsset(overrides = {}) {
  return {
    assetId: 'asset-still',
    mediaType: 'IMAGE',
    resolutionTier: 'FULL',
    rarityTier: 'STANDARD',
    demandIndex: 0,
    contributorType: 'CONTRIBUTOR',
    contributorRoyaltyBps: null,
    ...overrides,
  };
}

/** The scenario in the brief: footage of a lion giving birth, worldwide demand. */
function lionBirthFootage(overrides = {}) {
  return {
    assetId: 'asset-lion-birth',
    mediaType: 'VIDEO',
    resolutionTier: 'MASTER',
    rarityTier: 'ONCE_IN_A_LIFETIME',
    durationSeconds: 240,
    demandIndex: 900,
    contributorType: 'CONTRIBUTOR',
    contributorRoyaltyBps: null,
    ...overrides,
  };
}

const BASE_REQUEST = {
  scope: 'EDITORIAL',
  territory: 'WORLDWIDE',
  licenceTerm: 'ONE_YEAR',
  planCode: 'CREATOR',
};

// ─── Constants ───────────────────────────────────────────────────────────────

describe('pricing constants', () => {
  test('VAT is South Africa\'s 15%', () => {
    assert.equal(VAT_RATE_BPS, 1500);
  });

  test('video is priced above stills at every resolution tier', () => {
    for (const tier of ['WEB', 'FULL', 'MASTER']) {
      assert.ok(
        BASE_PRICE_CENTS.VIDEO[tier] > BASE_PRICE_CENTS.IMAGE[tier],
        `video should out-price stills at ${tier}`
      );
    }
  });

  test('base prices ascend with resolution', () => {
    for (const media of ['IMAGE', 'VIDEO']) {
      assert.ok(BASE_PRICE_CENTS[media].FULL > BASE_PRICE_CENTS[media].WEB);
      assert.ok(BASE_PRICE_CENTS[media].MASTER > BASE_PRICE_CENTS[media].FULL);
    }
  });

  test('all base prices are integer cents', () => {
    for (const media of Object.keys(BASE_PRICE_CENTS)) {
      for (const tier of Object.keys(BASE_PRICE_CENTS[media])) {
        assert.ok(Number.isInteger(BASE_PRICE_CENTS[media][tier]), `${media}.${tier} not integer`);
      }
    }
  });

  test('multiplier tables ascend and are expressed in basis points', () => {
    assert.equal(RARITY_MULTIPLIER_BPS.STANDARD, 10000);
    assert.ok(RARITY_MULTIPLIER_BPS.NOTABLE > RARITY_MULTIPLIER_BPS.STANDARD);
    assert.ok(RARITY_MULTIPLIER_BPS.RARE > RARITY_MULTIPLIER_BPS.NOTABLE);
    assert.ok(RARITY_MULTIPLIER_BPS.ONCE_IN_A_LIFETIME > RARITY_MULTIPLIER_BPS.RARE);

    assert.equal(SCOPE_MULTIPLIER_BPS.PERSONAL, 10000);
    assert.ok(SCOPE_MULTIPLIER_BPS.EDITORIAL > SCOPE_MULTIPLIER_BPS.PERSONAL);
    assert.ok(SCOPE_MULTIPLIER_BPS.COMMERCIAL > SCOPE_MULTIPLIER_BPS.EDITORIAL);
    assert.ok(SCOPE_MULTIPLIER_BPS.BROADCAST > SCOPE_MULTIPLIER_BPS.COMMERCIAL);
    assert.ok(SCOPE_MULTIPLIER_BPS.EXCLUSIVE_BUYOUT > SCOPE_MULTIPLIER_BPS.BROADCAST);

    assert.equal(TERRITORY_MULTIPLIER_BPS.SINGLE_COUNTRY, 10000);
    assert.ok(TERRITORY_MULTIPLIER_BPS.WORLDWIDE > TERRITORY_MULTIPLIER_BPS.REGIONAL);

    assert.equal(LICENCE_TERM_MULTIPLIER_BPS.ONE_YEAR, 10000);
    assert.ok(LICENCE_TERM_MULTIPLIER_BPS.PERPETUAL > LICENCE_TERM_MULTIPLIER_BPS.THREE_YEARS);
  });
});

// ─── Demand surge ────────────────────────────────────────────────────────────

describe('surgeMultiplierBps', () => {
  test('no demand means no surge', () => {
    assert.equal(surgeMultiplierBps(0), 10000);
  });

  test('surge rises with demand', () => {
    assert.ok(surgeMultiplierBps(20) > surgeMultiplierBps(5));
  });

  test('surge is capped so a viral asset stays priceable', () => {
    assert.equal(surgeMultiplierBps(1_000_000), SURGE_CAP_BPS);
    assert.ok(SURGE_CAP_BPS <= 30000, 'the cap must not exceed 3x');
  });

  test('surge never falls below 1x on odd input', () => {
    assert.equal(surgeMultiplierBps(-50), 10000);
    assert.equal(surgeMultiplierBps(null), 10000);
    assert.equal(surgeMultiplierBps(undefined), 10000);
  });

  test('surge is always an integer bps value', () => {
    for (const d of [1, 7, 33, 101, 999]) {
      assert.ok(Number.isInteger(surgeMultiplierBps(d)), `surge for ${d} not integer`);
    }
  });
});

// ─── Credit cost ─────────────────────────────────────────────────────────────

describe('creditCostFor', () => {
  test('a personal still costs one credit', () => {
    assert.equal(creditCostFor({ mediaType: 'IMAGE' }, 'PERSONAL'), 1);
  });

  test('editorial costs more credits than personal', () => {
    assert.ok(
      creditCostFor({ mediaType: 'IMAGE' }, 'EDITORIAL') >
        creditCostFor({ mediaType: 'IMAGE' }, 'PERSONAL')
    );
  });

  test('video costs more credits than a still for the same scope', () => {
    assert.ok(
      creditCostFor({ mediaType: 'VIDEO' }, 'EDITORIAL') >
        creditCostFor({ mediaType: 'IMAGE' }, 'EDITORIAL')
    );
  });

  test('commercial and above are never credit-covered — they are cash sales', () => {
    for (const scope of ['COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT']) {
      assert.equal(creditCostFor({ mediaType: 'VIDEO' }, scope), 0, `${scope} should not use credits`);
    }
  });
});

// ─── Revenue split ───────────────────────────────────────────────────────────

describe('splitRevenue', () => {
  test('splits into conservation levy, contributor royalty and platform fee', () => {
    const s = splitRevenue(1000000, { contributorType: 'CONTRIBUTOR' });
    assert.ok(s.conservationLevyCents > 0);
    assert.ok(s.contributorRoyaltyCents > 0);
    assert.ok(s.platformFeeCents > 0);
  });

  test('the split reconciles to the net exactly', () => {
    for (const net of [1, 7, 99, 100, 12345, 999999, 1000000, 87654321]) {
      const s = splitRevenue(net, { contributorType: 'CONTRIBUTOR' });
      assert.equal(
        s.conservationLevyCents + s.contributorRoyaltyCents + s.platformFeeCents,
        net,
        `split of ${net} did not reconcile`
      );
    }
  });

  test('every component is a non-negative integer', () => {
    const s = splitRevenue(12345, { contributorType: 'CONTRIBUTOR' });
    for (const key of ['conservationLevyCents', 'contributorRoyaltyCents', 'platformFeeCents']) {
      assert.ok(Number.isInteger(s[key]), `${key} not integer`);
      assert.ok(s[key] >= 0, `${key} negative`);
    }
  });

  test('the conservation levy is the largest single share of a contributor sale', () => {
    const s = splitRevenue(1000000, { contributorType: 'CONTRIBUTOR' });
    assert.ok(s.conservationLevyCents >= s.contributorRoyaltyCents);
    assert.ok(s.conservationLevyCents > s.platformFeeCents);
  });

  test('SANParks-captured media pays no third-party royalty — it all goes to conservation', () => {
    const s = splitRevenue(1000000, { contributorType: 'SANPARKS' });
    assert.equal(s.contributorRoyaltyCents, 0);
    const contributorSale = splitRevenue(1000000, { contributorType: 'CONTRIBUTOR' });
    assert.ok(s.conservationLevyCents > contributorSale.conservationLevyCents);
    assert.equal(s.conservationLevyCents + s.platformFeeCents, 1000000);
  });

  test('a negotiated contributor royalty overrides the default', () => {
    const s = splitRevenue(1000000, { contributorType: 'CONTRIBUTOR', contributorRoyaltyBps: 2000 });
    assert.equal(s.contributorRoyaltyCents, 200000);
    assert.equal(
      s.conservationLevyCents + s.contributorRoyaltyCents + s.platformFeeCents,
      1000000
    );
  });

  test('a royalty that would starve the platform fee is rejected', () => {
    assert.throws(
      () => splitRevenue(1000000, { contributorType: 'CONTRIBUTOR', contributorRoyaltyBps: 9500 }),
      /royalty/i
    );
  });

  test('a zero-value sale splits to zeros rather than throwing', () => {
    const s = splitRevenue(0, { contributorType: 'CONTRIBUTOR' });
    assert.equal(s.conservationLevyCents, 0);
    assert.equal(s.contributorRoyaltyCents, 0);
    assert.equal(s.platformFeeCents, 0);
  });
});

// ─── Full price walk ─────────────────────────────────────────────────────────

describe('priceLicence', () => {
  test('returns every step of the walk, all in integer cents', () => {
    const q = priceLicence({ asset: stillAsset(), ...BASE_REQUEST });
    for (const key of ['baseCents', 'listCents', 'subscriberDiscountCents', 'netCents', 'vatCents', 'grossCents']) {
      assert.ok(Number.isInteger(q[key]), `${key} is not an integer: ${q[key]}`);
    }
    assert.equal(q.grossCents, q.netCents + q.vatCents);
    assert.equal(q.vatCents, Math.round(q.netCents * 0.15));
  });

  test('the base is the media/resolution matrix entry', () => {
    const q = priceLicence({ asset: stillAsset({ resolutionTier: 'WEB' }), ...BASE_REQUEST });
    assert.equal(q.baseCents, BASE_PRICE_CENTS.IMAGE.WEB);
  });

  test('long footage costs more than short footage at the same tier', () => {
    const short = priceLicence({ asset: lionBirthFootage({ durationSeconds: 15 }), ...BASE_REQUEST });
    const long = priceLicence({ asset: lionBirthFootage({ durationSeconds: 600 }), ...BASE_REQUEST });
    assert.ok(long.baseCents > short.baseCents, 'duration must feed the base rate for video');
  });

  test('still images ignore durationSeconds entirely', () => {
    const a = priceLicence({ asset: stillAsset(), ...BASE_REQUEST });
    const b = priceLicence({ asset: stillAsset({ durationSeconds: 9999 }), ...BASE_REQUEST });
    assert.equal(a.baseCents, b.baseCents);
  });

  test('rarity raises the price', () => {
    const plain = priceLicence({ asset: stillAsset(), ...BASE_REQUEST });
    const rare = priceLicence({ asset: stillAsset({ rarityTier: 'ONCE_IN_A_LIFETIME' }), ...BASE_REQUEST });
    assert.ok(rare.netCents > plain.netCents);
    assert.equal(rare.rarityMultiplierBps, RARITY_MULTIPLIER_BPS.ONCE_IN_A_LIFETIME);
  });

  test('worldwide demand raises the price, but only up to the surge cap', () => {
    const quiet = priceLicence({ asset: stillAsset({ demandIndex: 0 }), ...BASE_REQUEST });
    const busy = priceLicence({ asset: stillAsset({ demandIndex: 40 }), ...BASE_REQUEST });
    const viral = priceLicence({ asset: stillAsset({ demandIndex: 5_000_000 }), ...BASE_REQUEST });

    assert.ok(busy.netCents > quiet.netCents);
    assert.ok(viral.netCents > busy.netCents);
    assert.equal(viral.surgeMultiplierBps, SURGE_CAP_BPS);
    assert.ok(
      viral.netCents <= quiet.netCents * 3 + 1,
      'surge must not raise the price by more than the cap'
    );
  });

  test('scope escalates the price: personal < editorial < commercial < broadcast < buyout', () => {
    const prices = ['PERSONAL', 'EDITORIAL', 'COMMERCIAL', 'BROADCAST', 'EXCLUSIVE_BUYOUT'].map(
      (scope) => priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope, planCode: 'BROADCAST' }).listCents
    );
    for (let i = 1; i < prices.length; i += 1) {
      assert.ok(prices[i] > prices[i - 1], `scope step ${i} did not increase the price`);
    }
  });

  test('territory and licence term both escalate the price', () => {
    const single = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, territory: 'SINGLE_COUNTRY' });
    const world = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, territory: 'WORLDWIDE' });
    assert.ok(world.listCents > single.listCents);

    const oneYear = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, licenceTerm: 'ONE_YEAR' });
    const perpetual = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, licenceTerm: 'PERPETUAL' });
    assert.ok(perpetual.listCents > oneYear.listCents);
  });

  test('higher plan tiers get a bigger subscriber discount', () => {
    const supporter = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope: 'PERSONAL', planCode: 'SUPPORTER' });
    const creator = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope: 'PERSONAL', planCode: 'CREATOR' });
    const broadcast = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope: 'PERSONAL', planCode: 'BROADCAST' });

    assert.equal(supporter.subscriberDiscountCents, 0);
    assert.ok(creator.subscriberDiscountBps > supporter.subscriberDiscountBps);
    assert.ok(broadcast.subscriberDiscountBps > creator.subscriberDiscountBps);
    assert.ok(broadcast.netCents < creator.netCents);
    assert.equal(creator.netCents, creator.listCents - creator.subscriberDiscountCents);
  });

  test('a full rights buyout gets no subscriber discount — it is a rights sale, not a download', () => {
    const q = priceLicence({
      asset: stillAsset(),
      ...BASE_REQUEST,
      scope: 'EXCLUSIVE_BUYOUT',
      planCode: 'BROADCAST',
    });
    assert.equal(q.subscriberDiscountCents, 0);
    assert.equal(q.netCents, q.listCents);
  });

  test('the quote carries a reconciling revenue split', () => {
    const q = priceLicence({ asset: stillAsset(), ...BASE_REQUEST });
    assert.equal(
      q.splits.conservationLevyCents + q.splits.contributorRoyaltyCents + q.splits.platformFeeCents,
      q.netCents
    );
  });

  test('the quote carries the credit cost for the scope', () => {
    const personal = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope: 'PERSONAL' });
    const commercial = priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope: 'COMMERCIAL', planCode: 'COMMERCIAL' });
    assert.equal(personal.creditCost, 1);
    assert.equal(commercial.creditCost, 0);
  });

  test('unknown scope, territory, term, media type or resolution is rejected', () => {
    assert.throws(() => priceLicence({ asset: stillAsset(), ...BASE_REQUEST, scope: 'NFT' }), /scope/i);
    assert.throws(() => priceLicence({ asset: stillAsset(), ...BASE_REQUEST, territory: 'MARS' }), /territory/i);
    assert.throws(() => priceLicence({ asset: stillAsset(), ...BASE_REQUEST, licenceTerm: 'FOREVER_AND_A_DAY' }), /term/i);
    assert.throws(() => priceLicence({ asset: stillAsset({ mediaType: 'AUDIO' }), ...BASE_REQUEST }), /media type/i);
    assert.throws(() => priceLicence({ asset: stillAsset({ resolutionTier: '8K' }), ...BASE_REQUEST }), /resolution/i);
  });

  test('pricing is deterministic — the same inputs give the same cents', () => {
    const args = { asset: lionBirthFootage(), ...BASE_REQUEST, scope: 'BROADCAST', planCode: 'BROADCAST' };
    assert.deepEqual(priceLicence(args), priceLicence(args));
  });

  test('the lion-birth scenario: a worldwide perpetual broadcast licence prices in the millions of cents', () => {
    const q = priceLicence({
      asset: lionBirthFootage(),
      scope: 'BROADCAST',
      territory: 'WORLDWIDE',
      licenceTerm: 'PERPETUAL',
      planCode: 'BROADCAST',
    });
    assert.ok(q.netCents > 100_000_000, `expected a seven-figure rand price, got ${q.netCents} cents`);
    assert.equal(q.surgeMultiplierBps, SURGE_CAP_BPS);
    assert.equal(q.rarityMultiplierBps, RARITY_MULTIPLIER_BPS.ONCE_IN_A_LIFETIME);
    assert.equal(
      q.splits.conservationLevyCents + q.splits.contributorRoyaltyCents + q.splits.platformFeeCents,
      q.netCents
    );
  });
});
