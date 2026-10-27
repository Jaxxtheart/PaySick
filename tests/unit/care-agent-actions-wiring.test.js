/**
 * Unit Tests — v1.18.0 Care Agent value-chain wiring
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Static-source checks for the parts that cannot be loaded in this sandbox
 * (express/pg are not installable, see care-agent-route-llm-wiring.test.js):
 * the new routes in routes/care-agent.js, migration 013, the rate limit on
 * confirm, the API client, and the v1.18.0 bot-protection review. The logic
 * behind them is covered by the executable service tests.
 *
 * Run: node --test tests/unit/care-agent-actions-wiring.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const routeSource = read('backend/src/routes/care-agent.js');
const serverSource = read('backend/src/server.js');
const apiClientSource = read('api-client.js');
const migrationPath = path.join(REPO_ROOT, 'backend/src/migrations/013_care_agent_actions.sql');

const { ACTION_REGISTRY, AUTHORITY } = require('../../backend/src/services/care-agent-actions.service');
const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

function routeBlock(signature) {
  const start = routeSource.indexOf(signature);
  assert.ok(start !== -1, `expected route ${signature}`);
  const next = routeSource.indexOf('\nrouter.', start + signature.length);
  return routeSource.slice(start, next === -1 ? undefined : next);
}

const NEW_ROUTES = [
  "router.get('/sessions/:id/account',",
  "router.post('/sessions/:id/actions',",
  "router.post('/sessions/:id/actions/:proposalId/confirm',",
  "router.post('/sessions/:id/actions/:proposalId/decline',",
  "router.get('/sessions/:id/decisions',",
];

describe('new Care Agent routes', () => {
  for (const signature of NEW_ROUTES) {
    test(`${signature} requires authentication and session ownership`, () => {
      const block = routeBlock(signature);
      assert.match(block, /authenticateToken/);
      assert.match(block, /getOwnedSession\(req\.params\.id, req\.user\.userId\)/);
    });
  }

  test('the routes build one executor from the account snapshot, acceptOffer and the shared payment service', () => {
    assert.match(routeSource, /require\(['"]\.\.\/services\/care-agent-action-executor\.service['"]\)/);
    assert.match(routeSource, /require\(['"]\.\.\/services\/care-agent-account\.service['"]\)/);
    assert.match(routeSource, /require\(['"]\.\.\/services\/plan-payment\.service['"]\)/);
    assert.match(routeSource, /marketplaceAuctionService\.acceptOffer/);
  });

  test('GET /account records the agent decisions before returning them', () => {
    assert.match(routeBlock("router.get('/sessions/:id/account',"), /recordAgentDecisions/);
  });

  test('POST /actions marks the proposal as the patient\'s own', () => {
    assert.match(routeBlock("router.post('/sessions/:id/actions',"), /proposedBy: 'patient'/);
  });

  test('confirm passes consent only when it is literally true', () => {
    assert.match(routeBlock("router.post('/sessions/:id/actions/:proposalId/confirm',"), /consent: req\.body\.consent === true/);
  });

  test('confirm and decline are unreachable from the LLM', () => {
    for (const signature of NEW_ROUTES.slice(2, 4)) {
      assert.doesNotMatch(routeBlock(signature), /runCareAgentTurn|CARE_AGENT_TOOLS|care-agent-llm/);
    }
  });

  test('GET /decisions reads only this session\'s audit trail and describes each row', () => {
    const block = routeBlock("router.get('/sessions/:id/decisions',");
    assert.match(block, /WHERE session_id = \$1/);
    assert.match(block, /describeAuditEvent/);
    assert.match(block, /care_agent_action_proposals/);
  });

  test('error responses carry the plain message in `error` so the API client shows it', () => {
    assert.match(routeSource, /error: result\.httpStatus >= 400 \? result\.message : undefined/);
  });
});

describe('POST /messages handles account actions', () => {
  const block = routeBlock("router.post('/sessions/:id/messages',");

  test('loads the account snapshot and gives it to the LLM turn', () => {
    assert.match(block, /loadAccountSnapshot/);
    assert.match(block, /runCareAgentTurn\(\{[^}]*account/);
  });

  test('stores the model\'s drafts as proposals made by the agent', () => {
    assert.match(block, /proposalDrafts/);
    assert.match(block, /proposedBy: 'agent'/);
  });

  test('without an LLM, falls back to deterministic intent detection', () => {
    assert.match(block, /detectAccountIntent/);
    assert.match(block, /suggestParamsFor/);
  });

  test('returns proposals and suggested actions to the page', () => {
    assert.match(block, /proposals,/);
    assert.match(block, /suggestedAction/);
  });
});

describe('the registry tells the page what to ask the patient for', () => {
  test('actions that need the patient\'s input declare their inputs', () => {
    assert.deepEqual(ACTION_REGISTRY.REQUEST_PAYMENT_DATE_CHANGE.inputs.map((i) => i.name), ['preferredDay', 'reason']);
    assert.deepEqual(ACTION_REGISTRY.REQUEST_RESTRUCTURE.inputs.map((i) => i.name), ['newTermMonths', 'reason']);
    assert.deepEqual(ACTION_REGISTRY.PROMISE_TO_PAY.inputs.map((i) => i.name), ['promisedDate']);
    assert.deepEqual(ACTION_REGISTRY.REPORT_HARDSHIP.inputs.map((i) => i.name), ['reason']);
  });

  test('no input ever asks for an amount the patient would owe', () => {
    for (const def of Object.values(ACTION_REGISTRY)) {
      for (const input of def.inputs || []) {
        assert.doesNotMatch(input.name, /amountCents|totalDue|lateFee/, `${def.actionType}.${input.name}`);
      }
    }
  });

  test('prohibited actions declare no inputs', () => {
    for (const def of Object.values(ACTION_REGISTRY)) {
      if (def.authority === AUTHORITY.PROHIBITED) assert.equal(def.inputs, undefined, def.actionType);
    }
  });
});

describe('migration 013_care_agent_actions.sql', () => {
  test('exists', () => {
    assert.ok(fs.existsSync(migrationPath));
  });

  const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

  test('creates care_agent_action_proposals owned by a session and a user', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS care_agent_action_proposals/);
    assert.match(sql, /session_id UUID NOT NULL REFERENCES care_agent_sessions\(session_id\)/);
    assert.match(sql, /user_id UUID NOT NULL REFERENCES users\(user_id\)/);
    for (const column of ['action_type', 'authority', 'params', 'summary', 'consent_text', 'effect', 'proposed_by', 'status', 'result', 'expires_at', 'decided_at', 'executed_at']) {
      assert.match(sql, new RegExp(`\\b${column}\\b`), column);
    }
  });

  test('limits status, authority and proposer to known values', () => {
    for (const status of ['awaiting_consent', 'confirming', 'executed', 'lodged', 'declined', 'expired', 'refused', 'failed']) {
      assert.match(sql, new RegExp(`'${status}'`), status);
    }
    assert.match(sql, /'patient_consent', 'human_review'/);
    assert.match(sql, /proposed_by IN \('agent', 'patient'\)/);
  });

  test('adds details and review_queue_id to care_agent_manage_requests', () => {
    assert.match(sql, /ALTER TABLE care_agent_manage_requests[\s\S]*ADD COLUMN IF NOT EXISTS details JSONB/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS review_queue_id INTEGER/);
  });
});

describe('rate limits (v1.18.0 review)', () => {
  test('confirming an action has its own tighter bucket than the Care Agent conversation', () => {
    const conversation = /const careAgentLimiter = rateLimit\(\{[\s\S]*?max: (\d+)/.exec(serverSource);
    const actions = /const careAgentActionLimiter = rateLimit\(\{[\s\S]*?max: (\d+)/.exec(serverSource);
    assert.ok(conversation && actions, 'both limiters are defined');
    assert.ok(Number(actions[1]) < Number(conversation[1]));
    assert.match(serverSource, /app\.use\('\/api\/care-agent\/sessions\/:id\/actions\/:proposalId\/confirm', careAgentActionLimiter\)/);
  });
});

describe('bot blocklist (v1.18.0 review)', () => {
  for (const ua of [
    'meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (compatible; FirecrawlAgent/1.0; +https://firecrawl.dev)',
    'Google-NotebookLM',
  ]) {
    test(`blocks ${ua.split(/[ /;(]/)[0]}`, () => {
      assert.equal(isBotUserAgent(ua), true);
    });
  }

  test('still lets a normal browser through', () => {
    assert.equal(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), false);
  });
});

describe('PaySickAPI.careAgent client', () => {
  for (const [method, pathPattern] of [
    ['getAccount', /\/care-agent\/sessions\/\$\{sessionId\}\/account/],
    ['proposeAction', /\/care-agent\/sessions\/\$\{sessionId\}\/actions`/],
    ['confirmAction', /\/actions\/\$\{proposalId\}\/confirm/],
    ['declineAction', /\/actions\/\$\{proposalId\}\/decline/],
    ['getDecisions', /\/care-agent\/sessions\/\$\{sessionId\}\/decisions/],
  ]) {
    test(`${method} calls its endpoint`, () => {
      assert.match(apiClientSource, new RegExp(`async ${method}\\(`));
      assert.match(apiClientSource, pathPattern);
    });
  }

  test('confirmAction sends consent: true', () => {
    assert.match(apiClientSource, /body: JSON\.stringify\(\{ consent: true \}\)/);
  });
});
