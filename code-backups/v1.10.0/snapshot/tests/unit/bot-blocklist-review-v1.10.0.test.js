'use strict';

/**
 * Unit Tests - v1.10.0 bot blocklist and rate-limit review
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md, "Bot Crawling Prevention": "Rate limit thresholds and the bot
 * User-Agent blocklist must be reviewed and updated with each MINOR or MAJOR
 * version bump." v1.10.0 is a MINOR bump (dentists added to the outreach plan,
 * plus the house-style and call-to-action gates), so this is that review,
 * expressed as tests rather than a note.
 *
 * Two gaps found since the v1.9.0 review:
 *
 *   1. A newer class of agent fetches on behalf of a user rather than for
 *      training, and carries no "bot", "crawler" or "spider" token, so the
 *      generic patterns miss them entirely: Perplexity-User, Claude-User,
 *      meta-externalfetcher, Firecrawl, Webzio-Extended. Note that
 *      "meta-externalfetcher" is not caught by /fetch\b/ either, because the
 *      token continues into "fetcher".
 *
 *   2. /api/outreach inherits only the general 100-per-15-minutes bucket. It
 *      carries two endpoints that are reachable without a session: the Resend
 *      inbound webhook (public, signature-gated) and the daily cron route
 *      (secret-gated, and one call runs a Places + Anthropic pipeline). Both
 *      want a tighter bucket than a read endpoint gets.
 *
 * Run: node --test tests/unit/bot-blocklist-review-v1.10.0.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

const REPO_ROOT = path.resolve(__dirname, '../../');
const serverSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/server.js'), 'utf8');
const blocklistSource = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/middleware/bot-blocker.js'),
  'utf8'
);

/** Agents added at the v1.10.0 review. */
const NEW_AGENTS = [
  'Perplexity-User',
  'Claude-User',
  'meta-externalfetcher',
  'Firecrawl',
  'Webzio-Extended',
  'AI2Bot',
  'PanguBot',
  'DuckAssistBot',
  'okhttp',
  'Apache-HttpClient',
];

describe('v1.10.0 blocklist additions', () => {
  for (const agent of NEW_AGENTS) {
    test(`${agent} is classified as a bot`, () => {
      assert.equal(isBotUserAgent(`${agent}/1.0`), true, `${agent} is not blocked`);
    });
  }

  test('the tokenless agents are named explicitly, not caught by luck', () => {
    for (const agent of ['Perplexity-User', 'Claude-User', 'meta-externalfetcher', 'Firecrawl', 'Webzio-Extended']) {
      assert.ok(blocklistSource.includes(agent), `${agent} is not named in the blocklist source`);
    }
  });

  test('real browsers still pass', () => {
    const browsers = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    ];
    for (const ua of browsers) {
      assert.equal(isBotUserAgent(ua), false, `a real browser was blocked: ${ua.slice(0, 40)}`);
    }
  });
});

describe('/api/outreach has its own rate limit bucket', () => {
  test('a dedicated limiter is defined', () => {
    assert.match(serverSource, /const outreachLimiter = rateLimit\(/, 'no outreachLimiter in server.js');
  });

  test('it is applied to /api/outreach', () => {
    assert.match(
      serverSource,
      /app\.use\(\s*['"]\/api\/outreach['"]\s*,\s*outreachLimiter\s*\)/,
      'outreachLimiter is not mounted on /api/outreach'
    );
  });

  test('it is stricter than the general limiter', () => {
    const general = Number(
      /max: parseInt\(process\.env\.RATE_LIMIT_MAX_REQUESTS\) \|\| (\d+)/.exec(serverSource)[1]
    );
    const block = /const outreachLimiter = rateLimit\(\{[\s\S]*?\}\);/.exec(serverSource)[0];
    const max = Number(/max:\s*(\d+)/.exec(block)[1]);
    assert.ok(max < general, `outreach max (${max}) should be below the general max (${general})`);
  });

  test('it is mounted before the outreach routes so it actually runs', () => {
    const limiterIdx = serverSource.indexOf("app.use('/api/outreach', outreachLimiter)");
    const routesIdx = serverSource.indexOf("app.use('/api/outreach', outreachRoutes)");
    assert.ok(limiterIdx !== -1 && routesIdx !== -1, 'both mounts must be present');
    assert.ok(limiterIdx < routesIdx, 'the limiter must be mounted before the routes');
  });
});
