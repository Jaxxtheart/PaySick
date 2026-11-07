/**
 * Unit Tests: Kehr Journey A wiring (v1.21.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Static-source checks for the parts that cannot be loaded in this sandbox
 * (express/pg are not installable): migration 014, the SQL repository,
 * routes/kehr.js, the server mount and rate limits, the API client, the
 * patient pass page and the provider links page, and the v1.21.0 bot
 * blocklist review. The logic behind them is covered by
 * kehr-preapproval-flow.test.js and kehr-harness-services.test.js.
 *
 * Run: node --test tests/unit/kehr-wiring.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8') : '');

const migration = read('backend/src/migrations/014_kehr_harness.sql');
const repoSource = read('backend/src/services/kehr-repository.js');
const routeSource = read('backend/src/routes/kehr.js');
const serverSource = read('backend/src/server.js');
const apiClientSource = read('api-client.js');
const passPage = read('kehr-pass.html');
const providerPage = read('provider-kehr.html');
const kehrPage = read('kehr.html');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

function routeBlock(signature) {
  const start = routeSource.indexOf(signature);
  assert.ok(start !== -1, `expected route ${signature}`);
  const next = routeSource.indexOf('\nrouter.', start + signature.length);
  return routeSource.slice(start, next === -1 ? undefined : next);
}

describe('migration 014_kehr_harness.sql', () => {
  test('exists', () => assert.ok(migration.length > 0));

  test('creates the four Kehr tables', () => {
    for (const t of ['kehr_consents', 'kehr_preapprovals', 'kehr_passes', 'kehr_plan_links']) {
      assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`), t);
    }
  });

  test('every consent stores the purpose text agreed to and can be withdrawn', () => {
    assert.match(migration, /purpose_agreed TEXT NOT NULL/);
    assert.match(migration, /withdrawn_at TIMESTAMPTZ/);
  });

  test('pass codes are unique', () => {
    assert.match(migration, /code VARCHAR\(7\) NOT NULL UNIQUE/);
  });

  test('a plan link stores no phone number; the token carries only a hash', () => {
    const block = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS kehr_plan_links'));
    assert.doesNotMatch(block.slice(0, block.indexOf(');')), /phone/i);
  });

  test('amounts are integer cents', () => {
    assert.match(migration, /estimate_cents BIGINT/);
    assert.match(migration, /ceiling_cents BIGINT/);
    assert.match(migration, /amount_cents BIGINT NOT NULL/);
  });
});

describe('kehr-repository.js', () => {
  test('exists and builds from query', () => {
    assert.match(repoSource, /function createKehrRepository\(\{ query \}\)/);
  });

  test('a pre-approval is only ever read for its owner', () => {
    assert.match(repoSource, /FROM kehr_preapprovals[\s\S]*?WHERE preapproval_id = \$1 AND user_id = \$2/);
  });

  test('assessments go to the existing underwriting audit log and review queue', () => {
    assert.match(repoSource, /INSERT INTO underwriting_audit_log/);
    assert.match(repoSource, /INSERT INTO manual_review_queue/);
  });

  test('a duplicate pass code returns null so the flow can retry', () => {
    assert.match(repoSource, /ON CONFLICT \(code\) DO NOTHING/);
  });

  test('a plan link is redeemed at most once', () => {
    assert.match(repoSource, /UPDATE kehr_plan_links[\s\S]*?WHERE link_id = \$1 AND status = 'sent'/);
  });
});

const PATIENT_ROUTES = [
  "router.get('/consents',",
  "router.post('/consents',",
  "router.delete('/consents/:source',",
  "router.post('/preapprovals',",
  "router.post('/preapprovals/:id/documents',",
  "router.post('/preapprovals/:id/assess',",
  "router.post('/preapprovals/:id/review',",
  "router.get('/pass',",
  "router.post('/plan-links/redeem',",
];
const PROVIDER_ROUTES = [
  "router.post('/provider/plan-links',",
  "router.get('/provider/passes/:code',",
];

describe('routes/kehr.js', () => {
  for (const signature of PATIENT_ROUTES) {
    test(`${signature} requires authentication`, () => {
      assert.match(routeBlock(signature), /authenticateToken/);
    });
  }

  for (const signature of PROVIDER_ROUTES) {
    test(`${signature} is for providers only`, () => {
      assert.match(routeBlock(signature), /authenticateToken, requireProvider/);
    });
  }

  test('sets X-Robots-Tag on every response', () => {
    assert.match(routeSource, /X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex'/);
  });

  test('builds one flow from the repository, the adapters and the link secret', () => {
    assert.match(routeSource, /createKehrFlow\(/);
    assert.match(routeSource, /createKehrRepository\(\{ query \}\)/);
    for (const adapter of ['identity-verification.adapter', 'income-verification.adapter', 'medical-scheme.adapter']) {
      assert.match(routeSource, new RegExp(adapter.replace('.', '\\.')), adapter);
    }
    assert.match(routeSource, /KEHR_LINK_SECRET/);
  });

  test('refuses to issue plan links in production without a configured secret', () => {
    assert.match(routeSource, /NODE_ENV === 'production'/);
  });

  test('the patient routes never return the assessment, trace or reasons', () => {
    for (const signature of PATIENT_ROUTES) {
      assert.doesNotMatch(routeBlock(signature), /assessment|trace|reasonCode|gatesPending/, signature);
    }
  });

  test('the provider resolves its own provider id, never one from the request body', () => {
    const block = routeBlock("router.post('/provider/plan-links',");
    assert.match(block, /resolveProviderId\(req\.user\)/);
    assert.doesNotMatch(block, /req\.body\.providerId/);
  });
});

describe('server.js', () => {
  test('mounts /api/kehr', () => {
    assert.match(serverSource, /const kehrRoutes = require\('\.\/routes\/kehr'\)/);
    assert.match(serverSource, /app\.use\('\/api\/kehr', kehrRoutes\)/);
  });

  test('assessing and redeeming have their own tighter buckets', () => {
    const general = /const kehrLimiter = rateLimit\(\{[\s\S]*?max: (\d+)/.exec(serverSource);
    const assess = /const kehrAssessLimiter = rateLimit\(\{[\s\S]*?max: (\d+)/.exec(serverSource);
    assert.ok(general && assess, 'both limiters are defined');
    assert.ok(Number(assess[1]) < Number(general[1]));
    assert.match(serverSource, /app\.use\('\/api\/kehr', kehrLimiter\)/);
    assert.match(serverSource, /app\.use\('\/api\/kehr\/preapprovals\/:id\/assess', kehrAssessLimiter\)/);
    assert.match(serverSource, /app\.use\('\/api\/kehr\/plan-links\/redeem', kehrAssessLimiter\)/);
  });
});

describe('api-client.js', () => {
  test('offers the Kehr calls', () => {
    for (const m of ['getConsents', 'grantConsent', 'withdrawConsent', 'startPreapproval', 'submitDocuments', 'assess', 'requestReview', 'getPass', 'redeemPlanLink', 'createPlanLink', 'checkPass']) {
      assert.match(apiClientSource, new RegExp(`async ${m}\\(`), m);
    }
  });
});

describe('kehr-pass.html (patient)', () => {
  test('exists, uses the API client and the Kehr lockup', () => {
    assert.ok(passPage.length > 0);
    assert.match(passPage, /<script src="api-client\.js"><\/script>/);
    assert.match(passPage, /kehr-wordmark/);
  });

  test('asks for consent per source, not one blanket tick', () => {
    assert.match(passPage, /PaySickAPI\.kehr\.grantConsent/);
    assert.match(passPage, /health_history/);
  });

  test('reads income instead of asking for it: no income or salary inputs', () => {
    assert.doesNotMatch(passPage, /<input[^>]*(income|salary|obligation)/i);
  });

  test('lands a provider link from ?link=', () => {
    assert.match(passPage, /URLSearchParams[\s\S]*?get\('link'\)/);
    assert.match(passPage, /PaySickAPI\.kehr\.redeemPlanLink/);
  });

  test('shows statuses only, never reasons, gates or scores', () => {
    assert.doesNotMatch(passPage, /reasonCode|gatesPending|\.trace\b|pd_score|expectedLoss/);
  });

  test('offers a person to look at any outcome (POPIA s71)', () => {
    assert.match(passPage, /PaySickAPI\.kehr\.requestReview/);
  });

  test('has the honeypot link and needs JavaScript to render', () => {
    assert.match(passPage, /href="\/api\/hp-check"/);
    assert.match(passPage, /<noscript>/);
  });
});

describe('provider-kehr.html', () => {
  test('exists and lets a provider send a plan link and check a pass', () => {
    assert.ok(providerPage.length > 0);
    assert.match(providerPage, /PaySickAPI\.kehr\.createPlanLink/);
    assert.match(providerPage, /PaySickAPI\.kehr\.checkPass/);
  });

  test('has the honeypot link and needs JavaScript to render', () => {
    assert.match(providerPage, /href="\/api\/hp-check"/);
    assert.match(providerPage, /<noscript>/);
  });
});

describe('kehr.html', () => {
  test('points patients planning treatment to the pass', () => {
    assert.match(kehrPage, /href="kehr-pass\.html"/);
  });
});

describe('v1.21.0 bot blocklist review', () => {
  const NEW_AGENTS = [
    'python-httpx/0.27.0',
    'Python/3.12 aiohttp/3.9.5',
    'undici',
    'Apache-HttpClient/4.5.14 (Java/17)',
    'Jina-Reader/1.0',
    'Crawl4AI/0.3',
    'Firecrawl/1.0',
    'Mozilla/5.0 (compatible; Manus-User/1.0)',
  ];
  for (const ua of NEW_AGENTS) {
    test(`blocks ${ua}`, () => assert.equal(isBotUserAgent(ua), true));
  }

  test('still allows ordinary browsers', () => {
    assert.equal(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false);
    assert.equal(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'), false);
  });
});
