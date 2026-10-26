'use strict';

/**
 * Unit Tests — v1.12.0 bot blocklist and rate-limit review
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md requires the bot User-Agent blocklist and rate limits to be
 * reviewed at every MINOR bump. v1.12.0 adds no routes, so rate limits are
 * unchanged. The blocklist gap: user-triggered AI fetchers whose tokens carry
 * no "bot", "crawler" or "spider" and so pass the generic patterns.
 *
 * Run: node --test tests/unit/bot-blocklist-review-v1-12.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

const NEW_AGENTS = [
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  'Webzio-Extended',
];

for (const ua of NEW_AGENTS) {
  test(`blocks ${ua.match(/[A-Za-z]+-[A-Za-z]+/)[0]}`, () => {
    assert.equal(isBotUserAgent(ua), true);
  });
}

test('still allows an ordinary desktop browser', () => {
  assert.equal(
    isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'),
    false
  );
});
