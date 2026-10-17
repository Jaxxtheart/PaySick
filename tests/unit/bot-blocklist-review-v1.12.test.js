'use strict';

/**
 * Unit Tests — v1.12.0 bot blocklist and rate-limit review
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md requires the bot blocklist and rate limits to be reviewed at
 * every MINOR bump. v1.12.0 ships the Shield Underwriting Module, so the
 * review focuses on what it changes:
 *
 *   1. Every underwriting decision now triggers paid third-party lookups
 *      (credit bureau, Home Affairs, SAFPS, bank account verification) and
 *      each bureau pull leaves an enquiry on the consumer's credit record.
 *      Decision endpoints therefore need their own, much tighter bucket
 *      than the general API limiter: velocity abuse costs money and harms
 *      consumers' enquiry counts (which the Shield knock-outs themselves read).
 *
 *   2. Three AI retrieval agents active since the v1.9.0 review carry no
 *      "bot"/"spider"/"crawler" token and pass the generic patterns:
 *      Perplexity-User, MistralAI-User, Meta-ExternalFetcher.
 *
 * Run: node --test tests/unit/bot-blocklist-review-v1.12.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

const serverSource = fs.readFileSync(path.resolve(__dirname, '../../backend/src/server.js'), 'utf8');

describe('v1.12.0 review — AI retrieval agents', () => {
  for (const ua of [
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)',
    'meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)'
  ]) {
    test(`blocks ${ua.match(/(Perplexity-User|MistralAI-User|meta-externalfetcher)/i)[0]}`, () => {
      assert.equal(isBotUserAgent(ua), true);
    });
  }

  test('still allows a normal browser', () => {
    assert.equal(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'), false);
  });
});

describe('v1.12.0 review — underwriting decision limiter', () => {
  test('defines a dedicated decision limiter at or below 10 requests per 15 minutes', () => {
    const m = serverSource.match(/const decisionLimiter = rateLimit\(\{([\s\S]*?)\}\);/);
    assert.ok(m, 'decisionLimiter not defined');
    assert.match(m[1], /windowMs:\s*15\s*\*\s*60\s*\*\s*1000/);
    const max = Number((m[1].match(/max:\s*(\d+)/) || [])[1]);
    assert.ok(max > 0 && max <= 10, `max is ${max}`);
  });

  test('applies it to both underwriting decision endpoints', () => {
    assert.match(serverSource, /app\.use\(\s*'\/api\/marketplace\/applications',\s*decisionLimiter\s*\)/);
    assert.match(serverSource, /app\.use\(\s*'\/api\/v1\/decisions',\s*decisionLimiter\s*\)/);
  });
});
