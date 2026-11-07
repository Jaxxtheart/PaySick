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
 * Also covers three gaps found while diagramming the lender's actual path
 * through this code (fixed together, same file, same workflow):
 *
 *  4. sendLoanPackageToLender() never actually calls the lender's webhook —
 *     the fetch() call is commented out — and the signature it would have
 *     sent was computed over the ENCRYPTED api_key_encrypted ciphertext
 *     instead of the decrypted plaintext key (the same class of bug already
 *     fixed on the inbound validateWebhookSignature middleware).
 *  5. acceptOffer() never tells any lender whether they won or lost — every
 *     losing offer just flips to DECLINED in the database, silently.
 *  6. scoreLender() never computes bid_coverage_pct, even though the column
 *     exists and LENDER_HARD_RULES.min_bid_coverage_pct is a hard rule.
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

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// security.service.js's AES key falls back to a fresh random 32 bytes on
// every call when ENCRYPTION_KEY isn't set, which would make encrypt/decrypt
// round-trips fail in this sandbox. Pin one for the life of this test process.
process.env.ENCRYPTION_KEY = '0'.repeat(64);

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
const { encryptBankingData } = require('../../backend/src/services/security.service');

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

// ─────────────────────────────────────────────
// Bug 4 — webhook is never actually sent, and would have signed with
// the encrypted ciphertext instead of the decrypted key
// ─────────────────────────────────────────────
describe('MarketplaceAuctionService.sendLoanPackageToLender — webhook delivery', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  test('POSTs the loan package to the lender webhook, signed with the decrypted API key', async () => {
    const plaintextKey = 'lender-plaintext-secret';
    const lender = {
      lender_id: 'lender-1',
      name: 'Test Bank',
      type: 'BANK',
      webhook_url: 'https://lender.example.com/hooks/paysick',
      api_key_encrypted: encryptBankingData(plaintextKey)
    };

    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200 };
    };

    await marketplaceAuctionService.sendLoanPackageToLender(lender, {
      applicationId: 'app-1',
      preApprovedTerms: { amount: 10000, rate: 0.18, term: 12, monthlyPayment: 915.83 },
      riskProfile: { score: 65, tier: 'MEDIUM', affordability: 60 },
      patientInfo: { income: 15000, employment: 'employed' }
    });

    assert.equal(calls.length, 1, 'expected the webhook to actually be POSTed, not just logged');
    assert.equal(calls[0].url, lender.webhook_url);

    const sentPayload = JSON.parse(calls[0].opts.body);
    assert.equal(sentPayload.event, 'loan.available');
    assert.equal(sentPayload.application_id, 'app-1');

    // If the code signed with the ciphertext instead of the decrypted key,
    // this comparison (computed with the plaintext) would not match.
    const expectedSignature = marketplaceAuctionService.generateWebhookSignature(plaintextKey, sentPayload);
    assert.equal(calls[0].opts.headers['X-PaySick-Signature'], expectedSignature);

    const auditCalls = queryCalls.filter(([sql]) => /INSERT INTO marketplace_audit_log/i.test(sql));
    assert.ok(auditCalls.length > 0, 'still expected a lender_notified audit event');
  });

  test('does not throw when webhook delivery fails, and still logs that the lender was notified', async () => {
    global.fetch = async () => { throw new Error('ECONNREFUSED'); };

    const lender = {
      lender_id: 'lender-2',
      name: 'Flaky Bank',
      type: 'BANK',
      webhook_url: 'https://flaky.example.com/hook',
      api_key_encrypted: encryptBankingData('another-secret')
    };

    await marketplaceAuctionService.sendLoanPackageToLender(lender, {
      applicationId: 'app-2',
      preApprovedTerms: { amount: 5000, rate: 0.15, term: 6, monthlyPayment: 870 },
      riskProfile: { score: 80, tier: 'LOW', affordability: 70 },
      patientInfo: { income: 20000, employment: 'employed' }
    });

    const auditCalls = queryCalls.filter(([sql]) => /INSERT INTO marketplace_audit_log/i.test(sql));
    assert.ok(auditCalls.length > 0, 'a failed delivery must not prevent the lender_notified audit log');
  });
});

// ─────────────────────────────────────────────
// Bug 5 — no win/loss notification
// ─────────────────────────────────────────────
describe('MarketplaceAuctionService.acceptOffer — win/loss notification', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  test('notifies the winning and losing lenders by webhook once the transaction commits', async () => {
    const fakeClient = makeFakeClient('OFFERS_RECEIVED');
    const baseQuery = fakeClient.query;
    const notifyRows = [
      {
        offer_id: 'offer-2', status: 'ACCEPTED', lender_id: 'lender-2', name: 'Winner Bank',
        webhook_url: 'https://winner.example.com/hook', api_key_encrypted: encryptBankingData('winner-secret')
      },
      {
        offer_id: 'offer-3', status: 'DECLINED', lender_id: 'lender-3', name: 'Loser Bank',
        webhook_url: 'https://loser.example.com/hook', api_key_encrypted: encryptBankingData('loser-secret')
      },
      {
        offer_id: 'offer-4', status: 'DECLINED', lender_id: 'lender-4', name: 'PaySick Balance Sheet',
        webhook_url: null, api_key_encrypted: null
      }
    ];
    fakeClient.query = async (sql, params) => {
      fakeClient.calls.push(sql);
      if (/FROM lender_offers lo/i.test(sql) && /JOIN lenders l/i.test(sql)) {
        return { rows: notifyRows };
      }
      return baseQuery(sql, params);
    };
    transactionImpl = async (cb) => cb(fakeClient);

    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200 };
    };

    await marketplaceAuctionService.acceptOffer('offer-2', 'user-1');

    assert.equal(calls.length, 2, 'expected one webhook per lender that has a webhook_url');
    const winnerCall = calls.find((c) => c.url === 'https://winner.example.com/hook');
    const loserCall = calls.find((c) => c.url === 'https://loser.example.com/hook');
    assert.ok(winnerCall, 'expected the winning lender to be notified');
    assert.ok(loserCall, 'expected the losing lender to be notified');
    assert.equal(JSON.parse(winnerCall.opts.body).event, 'offer.won');
    assert.equal(JSON.parse(loserCall.opts.body).event, 'offer.lost');
  });

  test('a lender notification failure does not fail the accept', async () => {
    const fakeClient = makeFakeClient('OFFERS_RECEIVED');
    const baseQuery = fakeClient.query;
    fakeClient.query = async (sql, params) => {
      if (/FROM lender_offers lo/i.test(sql) && /JOIN lenders l/i.test(sql)) {
        return {
          rows: [{
            offer_id: 'offer-2', status: 'ACCEPTED', lender_id: 'lender-2', name: 'Winner Bank',
            webhook_url: 'https://winner.example.com/hook', api_key_encrypted: encryptBankingData('winner-secret')
          }]
        };
      }
      return baseQuery(sql, params);
    };
    transactionImpl = async (cb) => cb(fakeClient);
    global.fetch = async () => { throw new Error('ECONNREFUSED'); };

    const result = await marketplaceAuctionService.acceptOffer('offer-2', 'user-1');
    assert.equal(result.loanId, 'loan-x');
  });
});

// ─────────────────────────────────────────────
// Bug 6 — bid_coverage_pct never computed
// ─────────────────────────────────────────────
describe('LenderGateService.scoreLender — bid coverage', () => {
  test('computes bid_coverage_pct as offers created over times presented, and persists it', async () => {
    const responses = [
      { rows: [{ funded_count: '2', total_offers: '4', avg_rate: '0.15', approval_rate: '0.5' }] }, // metrics
      { rows: [{ presented_count: '10' }] } // times this lender was presented a package
    ];
    let i = 0;
    let insertParams = null;
    queryImpl = async (sql, params) => {
      if (/INSERT INTO lender_scores/i.test(sql)) {
        insertParams = params;
        return { rows: [] };
      }
      return responses[i++] || { rows: [] };
    };

    await lenderGateService.scoreLender('lender-1', '2026-08-01', '2026-08-31');

    assert.ok(insertParams, 'expected an INSERT into lender_scores');
    // 4 offers created (total_offers) out of 10 times presented = 40%
    assert.ok(insertParams.includes(40), 'expected bid_coverage_pct (40) among the inserted values');

    const presentedCall = queryCalls.find(([sql]) => /FROM marketplace_audit_log/i.test(sql));
    assert.ok(presentedCall, 'expected a query counting lender_notified audit events for this lender');
    assert.match(presentedCall[0], /lender_notified/);
  });

  test('does not divide by zero when a lender has never been presented a package', async () => {
    const responses = [
      { rows: [{ funded_count: '0', total_offers: '0', avg_rate: '0', approval_rate: '0' }] },
      { rows: [{ presented_count: '0' }] }
    ];
    let i = 0;
    let insertParams = null;
    queryImpl = async (sql, params) => {
      if (/INSERT INTO lender_scores/i.test(sql)) {
        insertParams = params;
        return { rows: [] };
      }
      return responses[i++] || { rows: [] };
    };

    await lenderGateService.scoreLender('lender-2', '2026-08-01', '2026-08-31');
    assert.ok(insertParams.includes(0), 'expected bid_coverage_pct to default to 0, not NaN or Infinity');
    assert.ok(!insertParams.some((v) => typeof v === 'number' && Number.isNaN(v)));
  });
});
