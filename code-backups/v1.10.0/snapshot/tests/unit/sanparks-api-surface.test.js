'use strict';

/**
 * Unit Tests — SANParks API surface
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * CLAUDE.md, "Bot Crawling Prevention": "every API endpoint must require
 * authentication. No endpoint may return business logic, source structure, or
 * sensitive data to an unauthenticated caller." For a media catalogue that rule
 * is load-bearing — an open GET /assets is a scraper's entire job done for it.
 *
 * These assertions read the route source rather than booting express, matching
 * the approach already used for the bot-blocklist and static-protection reviews,
 * and keeping the suite runnable under `node --test` with no dependencies.
 *
 * Run: node --test tests/unit/sanparks-api-surface.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../');
const ROUTE_FILE = path.join(REPO_ROOT, 'backend/src/routes/sanparks.js');
const SERVER_FILE = path.join(REPO_ROOT, 'backend/src/server.js');
const MIGRATION_FILE = path.join(REPO_ROOT, 'backend/src/migrations/010_sanparks_media.sql');

// ─── The route module ────────────────────────────────────────────────────────

describe('backend/src/routes/sanparks.js', () => {
  test('the route module exists', () => {
    assert.ok(fs.existsSync(ROUTE_FILE), 'sanparks route missing');
  });

  const source = fs.existsSync(ROUTE_FILE) ? fs.readFileSync(ROUTE_FILE, 'utf8') : '';

  test('every declared route requires authentication', () => {
    const declarations = source.match(/router\.(get|post|put|patch|delete)\([^\n]*/g) || [];
    assert.ok(declarations.length >= 6, `expected a real surface, found ${declarations.length} routes`);
    for (const line of declarations) {
      assert.ok(
        line.includes('authenticateToken'),
        `unauthenticated endpoint: ${line.trim()}`
      );
    }
  });

  test('sets X-Robots-Tag on every response', () => {
    assert.match(source, /X-Robots-Tag/);
    for (const directive of ['noindex', 'nofollow', 'noarchive', 'nosnippet', 'noimageindex']) {
      assert.ok(source.includes(directive), `X-Robots-Tag missing "${directive}"`);
    }
  });

  test('covers the subscription lifecycle: quote, subscribe, renew, cancel', () => {
    assert.match(source, /router\.get\(\s*['"]\/plans['"]/, 'no plans endpoint');
    assert.match(source, /router\.post\(\s*['"]\/subscriptions['"]/, 'no subscribe endpoint');
    assert.match(source, /router\.post\(\s*['"]\/subscriptions\/:subscriptionId\/renew['"]/, 'no renew endpoint');
    assert.match(source, /router\.post\(\s*['"]\/subscriptions\/:subscriptionId\/cancel['"]/, 'no cancel endpoint');
  });

  test('covers the catalogue and the licensing transaction', () => {
    assert.match(source, /router\.get\(\s*['"]\/assets['"]/, 'no catalogue endpoint');
    assert.match(source, /router\.post\(\s*['"]\/quotes['"]/, 'no price-quote endpoint');
    assert.match(source, /router\.post\(\s*['"]\/licences['"]/, 'no licensing endpoint');
  });

  test('exposes the chain of title for an asset', () => {
    assert.match(source, /router\.get\(\s*['"]\/assets\/:assetId\/chain['"]/, 'no chain-of-title endpoint');
  });

  test('the licensing endpoint delegates to the transactional service', () => {
    assert.match(source, /executeLicensingTransaction/);
  });

  test('licensing failures are mapped to the error status the service reports', () => {
    assert.match(source, /err\.status|error\.status/, 'LicensingError.status is never used');
  });
});

// ─── Wiring ──────────────────────────────────────────────────────────────────

describe('server wiring', () => {
  const server = fs.readFileSync(SERVER_FILE, 'utf8');

  test('the router is required and mounted at /api/sanparks', () => {
    assert.match(server, /require\(['"]\.\/routes\/sanparks['"]\)/, 'route never required');
    assert.match(server, /app\.use\(\s*['"]\/api\/sanparks['"]\s*,\s*sanparksRoutes\s*\)/, 'route never mounted');
  });

  test('the root endpoint advertises the new surface', () => {
    assert.match(server, /sanparks:\s*['"]\/api\/sanparks['"]/);
  });
});

// ─── Schema ──────────────────────────────────────────────────────────────────

describe('migration 010 — SANParks media schema', () => {
  test('the migration exists', () => {
    assert.ok(fs.existsSync(MIGRATION_FILE), 'migration 010_sanparks_media.sql missing');
  });

  const sql = fs.existsSync(MIGRATION_FILE) ? fs.readFileSync(MIGRATION_FILE, 'utf8') : '';

  const REQUIRED_TABLES = [
    'sanparks_subscriptions',
    'sanparks_subscription_terms',
    'sanparks_assets',
    'sanparks_licences',
    'sanparks_rights_chain',
    'sanparks_revenue_splits',
    'sanparks_payments',
  ];

  for (const table of REQUIRED_TABLES) {
    test(`creates ${table}`, () => {
      assert.ok(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(sql),
        `${table} not created`
      );
    });
  }

  test('every table is created idempotently — the runner re-applies all migrations on boot', () => {
    const creates = sql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || [];
    assert.deepEqual(creates, [], 'found a CREATE TABLE without IF NOT EXISTS');
  });

  test('the idempotency key is unique, so a replayed sale cannot write two licences', () => {
    assert.match(sql, /idempotency_key[\s\S]{0,120}UNIQUE|UNIQUE[\s\S]{0,120}idempotency_key/i);
  });

  test('money columns are integer cents, never floating point', () => {
    const moneyColumns = sql.match(/^\s*\w*_cents\s+\w+/gim) || [];
    assert.ok(moneyColumns.length > 0, 'no _cents columns found — is money stored as a float?');
    for (const col of moneyColumns) {
      assert.match(col, /BIGINT|INTEGER/i, `money column is not an integer type: ${col.trim()}`);
    }
    assert.ok(
      !/\b(FLOAT|REAL|DOUBLE PRECISION)\b/i.test(sql),
      'floating-point column type found in a schema that stores money'
    );
  });

  test('the rights chain records the hash link', () => {
    assert.match(sql, /entry_hash/i);
    assert.match(sql, /previous_hash/i);
    assert.match(sql, /sequence/i);
  });
});
