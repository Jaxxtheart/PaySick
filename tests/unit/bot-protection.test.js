'use strict';

/**
 * Unit Tests — Bot Protection
 *
 * Tests for:
 *  - robots.txt existence and content
 *  - Bot User-Agent fingerprinting middleware
 *  - Honeypot trap middleware
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ─── Fix 2: robots.txt ────────────────────────────────────────────────────────

describe('robots.txt', () => {

  const REPO_ROOT = path.resolve(__dirname, '../../');
  const ROBOTS_PATH = path.join(REPO_ROOT, 'public', 'robots.txt');

  test('robots.txt file exists at public/robots.txt', () => {
    assert.ok(
      fs.existsSync(ROBOTS_PATH),
      `robots.txt must exist at ${ROBOTS_PATH}`
    );
  });

  test('robots.txt contains User-agent: *', () => {
    const content = fs.readFileSync(ROBOTS_PATH, 'utf8');
    assert.ok(
      content.includes('User-agent: *'),
      'robots.txt must contain "User-agent: *"'
    );
  });

  test('robots.txt contains Disallow: /', () => {
    const content = fs.readFileSync(ROBOTS_PATH, 'utf8');
    assert.ok(
      content.includes('Disallow: /'),
      'robots.txt must contain "Disallow: /"'
    );
  });

});

// ─── Fix 3: Bot User-Agent fingerprinting ────────────────────────────────────

describe('Bot User-Agent fingerprinting', () => {

  const { isBotUserAgent } = require('../../backend/src/middleware/bot-blocker');

  test('Googlebot UA is classified as a bot', () => {
    assert.ok(
      isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)'),
      'Googlebot should be classified as a bot'
    );
  });

  test('python-requests UA is classified as a bot', () => {
    assert.ok(
      isBotUserAgent('python-requests/2.28.0'),
      'python-requests should be classified as a bot'
    );
  });

  test('Scrapy UA is classified as a bot', () => {
    assert.ok(
      isBotUserAgent('Scrapy/2.11.0'),
      'Scrapy should be classified as a bot'
    );
  });

  test('AhrefsBot UA is classified as a bot', () => {
    assert.ok(
      isBotUserAgent('AhrefsBot/7.0'),
      'AhrefsBot should be classified as a bot'
    );
  });

  test('HeadlessChrome UA is classified as a bot', () => {
    assert.ok(
      isBotUserAgent('HeadlessChrome'),
      'HeadlessChrome should be classified as a bot'
    );
  });

  test('Normal browser UA is NOT classified as a bot', () => {
    assert.ok(
      !isBotUserAgent('Mozilla/5.0 Chrome/120 Safari/537'),
      'Normal browser UA should NOT be classified as a bot'
    );
  });

  test('Bot middleware returns 403 for bot UA', () => {
    const botBlocker = require('../../backend/src/middleware/bot-blocker');
    const middleware = botBlocker.default || botBlocker;

    const req = { headers: { 'user-agent': 'python-requests/2.28.0' } };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(body) { this._json = body; return this; },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);

    assert.equal(res._status, 403, 'should respond with 403 for bot UA');
    assert.equal(res._json.code, 'BOT_BLOCKED', 'should include BOT_BLOCKED code');
    assert.ok(!nextCalled, 'next() should not be called for bot UA');
  });

  test('Bot middleware calls next() for normal browser UA', () => {
    const botBlocker = require('../../backend/src/middleware/bot-blocker');
    const middleware = botBlocker.default || botBlocker;

    const req = { headers: { 'user-agent': 'Mozilla/5.0 Chrome/120 Safari/537' } };
    const res = {
      _status: null,
      status(code) { this._status = code; return this; },
      json(body) { return this; },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    middleware(req, res, next);

    assert.ok(nextCalled, 'next() should be called for normal browser UA');
    assert.equal(res._status, null, 'should not set status for normal UA');
  });

});

// ─── Fix 4: Honeypot trap ─────────────────────────────────────────────────────

describe('Honeypot trap', () => {

  // Clear module cache between tests to reset the blockedIPs Set
  function freshHoneypot() {
    Object.keys(require.cache).forEach(k => {
      if (k.includes('honeypot')) delete require.cache[k];
    });
    return require('../../backend/src/middleware/honeypot');
  }

  test('honeypotTrapHandler returns 200 and records the IP', () => {
    const { honeypotTrapHandler, isHoneypotBlocked } = freshHoneypot();

    const req = { ip: '10.0.0.1', headers: {} };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(body) { this._json = body; return this; },
    };

    honeypotTrapHandler(req, res);

    assert.equal(res._status, 200, 'honeypot trap should return 200 to lure bots');
    assert.deepEqual(res._json, { ok: true }, 'honeypot response should be { ok: true }');
    assert.ok(isHoneypotBlocked('10.0.0.1'), 'IP should be blocked after hitting honeypot');
  });

  test('honeypotBlockMiddleware returns 403 for blocked IP', () => {
    const { honeypotBlockMiddleware, recordHoneypotHit } = freshHoneypot();

    // Manually record a hit for a specific IP
    recordHoneypotHit('192.168.1.99');

    const req = { ip: '192.168.1.99', headers: {} };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(body) { this._json = body; return this; },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    honeypotBlockMiddleware(req, res, next);

    assert.equal(res._status, 403, 'blocked IP should receive 403');
    assert.ok(!nextCalled, 'next() should not be called for blocked IP');
  });

  test('honeypotBlockMiddleware calls next() for clean IP', () => {
    const { honeypotBlockMiddleware } = freshHoneypot();

    const req = { ip: '8.8.8.8', headers: {} };
    const res = {
      _status: null,
      status(code) { this._status = code; return this; },
      json(body) { return this; },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    honeypotBlockMiddleware(req, res, next);

    assert.ok(nextCalled, 'next() should be called for clean IP');
    assert.equal(res._status, null, 'should not set status for clean IP');
  });

});
