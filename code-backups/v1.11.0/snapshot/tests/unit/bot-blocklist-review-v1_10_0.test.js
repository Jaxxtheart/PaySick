'use strict';

/**
 * Unit Tests — v1.10.0 bot blocklist review
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md, "Bot Crawling Prevention": "Rate limit thresholds and the bot
 * User-Agent blocklist must be reviewed and updated with each MINOR or MAJOR
 * version bump." v1.10.0 is a MINOR bump, so this is that review.
 *
 * The v1.9.0 review covered the AI crawler generation active at the time. Since
 * then a second wave has appeared, and the ones below all pass straight through
 * the current list:
 *
 *   - Meta-ExternalFetcher, MistralAI-User, Perplexity-User: no "bot" token, so
 *     the generic /bot\b/ pattern never fires. Perplexity-User in particular is
 *     the user-directed sibling of PerplexityBot, which IS blocked, so blocking
 *     one and not the other is an inconsistency rather than a policy.
 *   - Firecrawl, crawl4ai: the generic pattern is /crawler/, which does not
 *     match a bare "crawl" stem.
 *   - Webzio-Extended, SerpApi, Cotoyogi: scraping and SERP-harvesting agents
 *     with no matching token at all.
 *
 * Deliberately NOT added: "Devin", "NovaAct" and "Operator". Each is a real
 * agent token but is also a common English word or product name likely to
 * appear inside legitimate User-Agent strings, and a substring match on them
 * would block real browsers. They are recorded here so the next review does not
 * re-litigate them.
 *
 * Run: node --test tests/unit/bot-blocklist-review-v1_10_0.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

/** Second-wave AI and scraping agents added at the v1.10.0 review. */
const NEW_AGENTS = [
  'Meta-ExternalFetcher',
  'MistralAI-User',
  'Perplexity-User',
  'Firecrawl',
  'crawl4ai',
  'Webzio-Extended',
  'SerpApi',
  'Cotoyogi',
];

describe('v1.10.0 blocklist additions', () => {
  for (const agent of NEW_AGENTS) {
    test(`${agent} is blocked`, () => {
      assert.ok(isBotUserAgent(agent), `${agent} passes the blocklist`);
    });
  }

  test('each new agent is also blocked inside a full User-Agent string', () => {
    for (const agent of NEW_AGENTS) {
      const ua = `Mozilla/5.0 (compatible; ${agent}/1.0; +https://example.com/bot)`;
      assert.ok(isBotUserAgent(ua), `${agent} passes inside a full UA string`);
    }
  });
});

describe('the v1.9.0 blocklist still holds', () => {
  // Regression guard: the additions must not have disturbed the prior review.
  const PRIOR = [
    'GPTBot',
    'ClaudeBot',
    'anthropic-ai',
    'Google-Extended',
    'Meta-ExternalAgent',
    'cohere-ai',
    'omgili',
    'PerplexityBot',
    'Bytespider',
  ];
  for (const agent of PRIOR) {
    test(`${agent} is still blocked`, () => {
      assert.ok(isBotUserAgent(agent), `${agent} regressed`);
    });
  }
});

describe('real browsers are not caught by the additions', () => {
  const BROWSERS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  ];
  for (const ua of BROWSERS) {
    test(`browser UA passes: ${ua.slice(0, 42)}...`, () => {
      assert.equal(isBotUserAgent(ua), false, 'legitimate browser was blocked');
    });
  }

  test('an empty or missing User-Agent is not treated as a bot here', () => {
    // Absence is handled by the honeypot and rate limiter, not this check.
    assert.equal(isBotUserAgent(''), false);
    assert.equal(isBotUserAgent(undefined), false);
  });
});
