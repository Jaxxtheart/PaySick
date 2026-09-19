'use strict';

/**
 * Lender Marketplace Hardening
 *
 * Reproduces three bugs from the marketplace / Shield lender-gate review
 * before touching any implementation (test-first workflow, CLAUDE.md):
 *
 *  1. The 22.25% marketplace rate cap is defined (LENDER_HARD_RULES.max_rate_apr)
 *     but nothing on the offer-write path enforces it.
 *  2. acceptOffer() never locks the parent application, so two concurrent
 *     accepts on two different PENDING offers for the same application can
 *     both succeed and create two loans.
 *  3. lender-gate.service.js queries columns (status, institution_name,
 *     lender_name) that don't exist on the real `lenders` table (active,
 *     name), so every query throws, is swallowed, and silently returns [].
 *
 * These are DB-backed services, normally covered by the jest integration
 * suite with `config/database` mocked via jest.mock(). This sandbox has no
 * network access to install npm dependencies (jest, pg, dotenv included),
 * so this file uses only Node's built-in test runner and mocks the database
 * module by hand: `pg`/`dotenv` are replaced with local no-op stubs
 * (backend/node_modules/, gitignored, never shipped) purely so
 * config/database.js can load, and its exported query()/transaction()
 * functions are swapped for an in-memory recorder before any service module
 * captures them via destructuring at require time. Run:
 *   node --test tests/unit/marketplace-lender-gate.test.js
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../backend/src/config/database');

let queryCalls = [];
let queryImpl = async () => ({ rows: [], rowCount: 0 });
db.query = async (text, params) => {
  queryCalls.push([text, params]);
  return queryImpl(text, params);
};

let transactionImpl = async (cb) => cb({ query: async () => ({ rows: [] }), release: () => {} });
db.transaction = async (cb) => transactionImpl(cb);

const { marketplaceAuctionService } = require('../../backend/src/services/marketplace-auction.service');
const { lenderGateService, LENDER_HARD_RULES } = require('../../backend/src/services/lender-gate.service');

beforeEach(() => {
  queryCalls = [];
  queryImpl = async () => ({ rows: [], rowCount: 0 });
  transactionImpl = async (cb) => cb({ query: async () => ({ rows: [] }), release: () => {} });
});

// ─────────────────────────────────────────────
// Bug 1 — rate cap enforcement
// ─────────────────────────────────────────────
describe('MarketplaceAuctionService.createLenderOffer — 22.25% marketplace rate cap', () => {
  test('rejects an offer priced above the cap, from any caller (webhook or manual entry)', async () => {
    await assert.rejects(
      marketplaceAuctionService.createLenderOffer({
        applicationId: 'app-1',
        lenderId: 'lender-1',
        amount: 20000,
        rate: 0.30, // 30% APR — a lender trying to push a predatory rate
        term: 12
      }),
      /22\.25|exceeds|cap/i
    );

    const insertCalls = queryCalls.filter(([sql]) => /INSERT INTO lender_offers/i.test(sql));
    assert.equal(insertCalls.length, 0, 'must not persist an offer priced above the cap');
  });

  test('allows an offer priced exactly at the cap', async () => {
    let insertSeen = false;
    queryImpl = async (sql) => {
      if (/INSERT INTO lender_offers/i.test(sql)) {
        insertSeen = true;
        return { rows: [{ offer_id: 'offer-1' }] };
      }
      return { rows: [] };
    };

    const offerId = await marketplaceAuctionService.createLenderOffer({
      applicationId: 'app-1',
      lenderId: 'lender-1',
      amount: 20000,
      rate: LENDER_HARD_RULES.max_rate_apr,
      term: 12
    });

    assert.equal(offerId, 'offer-1');
    assert.ok(insertSeen, 'expected the offer to actually be inserted');
  });
});

// ─────────────────────────────────────────────
// Bug 2 — double-accept race
// ─────────────────────────────────────────────
function makeFakeClient(applicationStatus) {
  const offerRow = {
    offer_id: 'offer-2',
    application_id: 'app-1',
    lender_id: 'lender-2',
    user_id: 'user-1',
    provider_id: null,
    approved_amount: '10000.00',
    interest_rate: '0.1800',
    term: 12,
    monthly_payment: '915.83',
    total_repayable: '10989.96',
    origination_fee: '250.00'
  };

  const calls = [];
  const query = async (sql) => {
    calls.push(sql);
    if (/FROM lender_offers lo/i.test(sql)) {
      return { rows: [offerRow] };
    }
    if (/FROM loan_applications/i.test(sql) && /FOR UPDATE/i.test(sql)) {
      return { rows: [{ status: applicationStatus }] };
    }
    if (/INSERT INTO marketplace_loans/i.test(sql)) {
      return { rows: [{ loan_id: 'loan-x' }] };
    }
    return { rows: [] };
  };

  return { query, release: () => {}, calls };
}

describe('MarketplaceAuctionService.acceptOffer — concurrent accept race', () => {
  test('locks the parent application row before creating a loan', async () => {
    const fakeClient = makeFakeClient('OFFERS_RECEIVED');
    transactionImpl = async (cb) => cb(fakeClient);

    const result = await marketplaceAuctionService.acceptOffer('offer-2', 'user-1');

    assert.equal(result.loanId, 'loan-x');
    const lockCalls = fakeClient.calls.filter(
      (sql) => /FROM loan_applications/i.test(sql) && /FOR UPDATE/i.test(sql)
    );
    assert.ok(lockCalls.length > 0, 'expected acceptOffer to lock the application row with SELECT ... FOR UPDATE');
  });

  test('refuses to accept once the application already has a selected offer', async () => {
    // Simulates the second of two concurrent accepts: by the time this
    // transaction's row lock is granted, the first accept has already
    // committed and moved the application to OFFER_SELECTED.
    const fakeClient = makeFakeClient('OFFER_SELECTED');
    transactionImpl = async (cb) => cb(fakeClient);

    await assert.rejects(
      marketplaceAuctionService.acceptOffer('offer-2', 'user-1'),
      /already.*selected/i
    );

    const loanInserts = fakeClient.calls.filter((sql) => /INSERT INTO marketplace_loans/i.test(sql));
    assert.equal(loanInserts.length, 0, 'must not create a second loan for the same application');
  });
});

// ─────────────────────────────────────────────
// Bug 3 — lender-gate schema mismatch
// ─────────────────────────────────────────────
describe('LenderGateService — queries the real lenders table schema', () => {
  test('findEligibleLenders filters on columns that actually exist (active, name)', async () => {
    queryImpl = async () => ({
      rows: [{ lender_id: 'l1', name: 'Test Bank', composite_score: 80, concentration_pct: 10 }]
    });

    const lenders = await lenderGateService.findEligibleLenders({}, 'standard');

    const [sql] = queryCalls[0];
    assert.ok(!/l\.status\s*=/i.test(sql), 'query should not filter on the nonexistent l.status column');
    assert.ok(!/institution_name/i.test(sql), 'query should not select the nonexistent institution_name column');
    assert.equal(lenders.length, 1);
    assert.equal(lenders[0].lender_name, 'Test Bank');
  });

  test('getPortfolioAllocation queries lender concentration without institution_name', async () => {
    const responses = [
      { rows: [{ total_book: '0' }] },        // checkBalanceSheetCapacity: total book
      { rows: [{ marketplace_total: '0' }] }, // checkBalanceSheetCapacity: marketplace total
      { rows: [{ lender_id: 'l1', name: 'Test Bank', loan_count: 3, total_value: '15000' }] }
    ];
    let i = 0;
    queryImpl = async () => responses[i++] || { rows: [] };

    const allocation = await lenderGateService.getPortfolioAllocation();

    const concentrationCall = queryCalls.find(([sql]) => /FROM lenders l/i.test(sql));
    assert.ok(concentrationCall, 'expected a query against the lenders table for concentration');
    // Selecting `l.name AS institution_name` is fine (keeps the response shape
    // stable) — what must not appear is a reference to the column l.institution_name,
    // which doesn't exist on the real lenders table.
    assert.ok(!/l\.institution_name/i.test(concentrationCall[0]));
    assert.equal(allocation.lender_concentration.length, 1);
  });
});
