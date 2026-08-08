'use strict';

/**
 * Unit Tests — v1.10.0 bot blocklist and rate-limit review
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md, "Bot Crawling Prevention": "Rate limit thresholds and the bot
 * User-Agent blocklist must be reviewed and updated with each MINOR or MAJOR
 * version bump." v1.10.0 is a MINOR bump, so this is that review.
 *
 * The v1.9.0 review covered search engines, SEO crawlers, HTTP client libraries
 * and AI training crawlers. What it did not cover is the class of tool that
 * matters most to a media licensing catalogue: bulk media downloaders and image
 * harvesters. gallery-dl and yt-dlp exist specifically to walk a gallery and
 * pull every original file behind it; HTTrack and its relatives mirror a whole
 * site to disk. None of them carry a "bot" token, so none of them are caught by
 * the generic pattern.
 *
 * Second gap: /api/sanparks serves the catalogue and executes rights transfers.
 * It needs its own rate-limit bucket rather than the general read allowance,
 * for the same reason /api/v1 got one at v1.9.0.
 *
 * Run: node --test tests/unit/media-scraper-blocklist.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

const REPO_ROOT = path.resolve(__dirname, '../../');
const serverSource = fs.readFileSync(path.join(REPO_ROOT, 'backend/src/server.js'), 'utf8');

/** Bulk media downloaders and image harvesters — the v1.10.0 additions. */
const MEDIA_HARVESTERS = [
  'gallery-dl/1.26.9',
  'yt-dlp/2026.01.15',
  'youtube-dl/2021.12.17',
  'HTTrack 3.49-2',
  'Offline Explorer/7.7',
  'Teleport Pro/1.29',
  'WebCopier v4.6',
  'WebZIP/5.0',
  'SiteSucker/5.1.3',
  'aria2/1.36.0',
  'img2dataset',
  'ImagesiftBot',
  'TinEye-bot/1.0',
  'PetalBot',
  'Screaming Frog SEO Spider/19.2',
  'Bytespider',
];

/** Still blocked from the v1.9.0 review — this must not regress. */
const PREVIOUSLY_BLOCKED = [
  'Googlebot/2.1',
  'GPTBot/1.2',
  'anthropic-ai',
  'CCBot/2.0',
  'python-requests/2.31.0',
  'curl/8.4.0',
  'Scrapy/2.11',
  'HeadlessChrome/121.0.0.0',
];

/** Real people on real browsers must still get through. */
const REAL_BROWSERS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

// ─── Media harvesters ────────────────────────────────────────────────────────

describe('bulk media downloaders are blocked', () => {
  for (const ua of MEDIA_HARVESTERS) {
    test(`blocks "${ua}"`, () => {
      assert.equal(isBotUserAgent(ua), true, `${ua} walked straight through the blocklist`);
    });
  }
});

describe('the v1.9.0 blocklist has not regressed', () => {
  for (const ua of PREVIOUSLY_BLOCKED) {
    test(`still blocks "${ua}"`, () => {
      assert.equal(isBotUserAgent(ua), true);
    });
  }
});

describe('real browsers are not blocked', () => {
  for (const ua of REAL_BROWSERS) {
    test(`allows ${ua.slice(0, 40)}…`, () => {
      assert.equal(isBotUserAgent(ua), false, 'a real browser was blocked — false positive');
    });
  }
});

// ─── Rate limiting on the new surface ────────────────────────────────────────

describe('/api/sanparks has its own rate-limit bucket', () => {
  test('server.js declares a limiter for the SANParks surface', () => {
    assert.match(
      serverSource,
      /sanparksLimiter\s*=\s*rateLimit\(/,
      'the SANParks media surface must not inherit the general read allowance — it executes rights transfers'
    );
  });

  test('the limiter is applied to /api/sanparks', () => {
    assert.match(
      serverSource,
      /app\.use\(\s*['"]\/api\/sanparks['"]\s*,\s*sanparksLimiter\s*\)/,
      'the SANParks limiter is declared but never mounted'
    );
  });

  test('the SANParks bucket is tighter than the general 100-per-window allowance', () => {
    const block = serverSource.match(/sanparksLimiter\s*=\s*rateLimit\(\{[\s\S]*?\}\)/);
    assert.ok(block, 'could not read the sanparksLimiter config');
    const max = block[0].match(/max:\s*(\d+)/);
    assert.ok(max, 'sanparksLimiter declares no max');
    assert.ok(
      Number(max[1]) <= 60,
      `expected a tighter bucket than the general limiter, got max: ${max[1]}`
    );
  });

  test('the limiter returns a 429-shaped error body', () => {
    const block = serverSource.match(/sanparksLimiter\s*=\s*rateLimit\(\{[\s\S]*?\}\)/);
    assert.match(block[0], /code:\s*['"]SANPARKS_RATE_LIMITED['"]/);
  });
});
