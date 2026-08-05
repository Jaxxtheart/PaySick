'use strict';

/**
 * Unit Tests — v1.9.0 bot blocklist and rate-limit review
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md, "Bot Crawling Prevention": "Rate limit thresholds and the bot
 * User-Agent blocklist must be reviewed and updated with each MINOR or MAJOR
 * version bump." v1.9.0 is a MINOR bump, so this is that review, expressed as
 * tests rather than a note.
 *
 * Two gaps found:
 *
 *   1. The blocklist predates the current generation of AI training and
 *      retrieval crawlers. Several are caught incidentally by the generic
 *      /bot\b/ pattern, but the ones that do not carry "bot" in their token
 *      (anthropic-ai, Google-Extended, Meta-ExternalAgent, cohere-ai, omgili)
 *      pass straight through. Named entries also make the list auditable
 *      instead of relying on an accident of the generic pattern.
 *
 *   2. /api/v1 carries payout endpoints that move money, and inherits only the
 *      general 100-per-15-minutes limiter that a read endpoint gets. It needs
 *      its own tighter bucket.
 *
 * Run: node --test tests/unit/bot-blocklist-review.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

const REPO_ROOT = path.resolve(__dirname, '../../');
const serverSource = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/server.js'),
  'utf8'
);
const blocklistSource = fs.readFileSync(
  path.join(REPO_ROOT, 'backend/src/middleware/bot-blocker.js'),
  'utf8'
);

/** AI training / retrieval crawlers active as of the v1.9.0 review. */
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'anthropic-ai',
  'Claude-Web',
  'CCBot',
  'PerplexityBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'Meta-ExternalAgent',
  'FacebookBot',
  'cohere-ai',
  'Diffbot',
  'ImagesiftBot',
  'omgili',
  'YouBot',
  'TimpiBot',
];

describe('AI crawler User-Agents are blocked', () => {
  for (const crawler of AI_CRAWLERS) {
    test(`${crawler} is classified as a bot`, () => {
      // Deliberately no "+https://.../bot" suffix: that substring alone trips the
      // generic /bot\b/ pattern and would make every case here pass vacuously.
      const ua = `${crawler}/1.0`;
      assert.equal(isBotUserAgent(ua), true, `${crawler} is not blocked`);
    });
  }

  test('the ones with no "bot" token are named explicitly, not caught by luck', () => {
    // These carry no "bot"/"crawler"/"spider" token, so they can only be caught
    // by a named entry. Assert the source actually lists them.
    for (const crawler of ['anthropic-ai', 'Google-Extended', 'Meta-ExternalAgent', 'cohere-ai', 'omgili']) {
      assert.ok(
        blocklistSource.includes(crawler),
        `${crawler} is not named in the blocklist source`
      );
    }
  });
});

describe('Real browsers still pass', () => {
  const BROWSERS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  ];

  for (const ua of BROWSERS) {
    test(`browser UA is not blocked: ${ua.slice(0, 40)}...`, () => {
      assert.equal(isBotUserAgent(ua), false, 'a real browser was blocked');
    });
  }

  test('Applebot-Extended is blocked but plain Safari is not', () => {
    assert.equal(isBotUserAgent('Applebot-Extended/1.0'), true);
    assert.equal(
      isBotUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
      ),
      false
    );
  });
});

describe('/api/v1 has its own rate limit bucket', () => {
  test('a dedicated limiter is defined', () => {
    assert.match(
      serverSource,
      /const v1Limiter = rateLimit\(/,
      'no v1Limiter defined in server.js'
    );
  });

  test('it is applied to /api/v1', () => {
    assert.match(
      serverSource,
      /app\.use\(\s*['"]\/api\/v1['"]\s*,\s*v1Limiter\s*\)/,
      'v1Limiter is not mounted on /api/v1'
    );
  });

  test('it is stricter than the general limiter', () => {
    const general = Number(/max: parseInt\(process\.env\.RATE_LIMIT_MAX_REQUESTS\) \|\| (\d+)/.exec(serverSource)[1]);
    const v1Block = /const v1Limiter = rateLimit\(\{[\s\S]*?\}\);/.exec(serverSource)[0];
    const v1Max = Number(/max:\s*(\d+)/.exec(v1Block)[1]);
    assert.ok(v1Max < general, `v1 max (${v1Max}) should be below the general max (${general})`);
  });

  test('it is mounted before the v1 routes so it actually runs', () => {
    const limiterIdx = serverSource.indexOf("app.use('/api/v1', v1Limiter)");
    const routesIdx = serverSource.indexOf("app.use('/api/v1', v1Routes)");
    assert.ok(limiterIdx !== -1 && routesIdx !== -1, 'both mounts must be present');
    assert.ok(limiterIdx < routesIdx, 'the limiter must be mounted before the routes');
  });
});
