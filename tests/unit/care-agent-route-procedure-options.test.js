'use strict';

/**
 * Unit Tests — routes/care-agent.js exposes the finite procedure list
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * The frontend must render the finite, recognized procedure list as
 * tappable choices (per explicit product direction: "if it's a finite
 * list then present all the options for the customer to choose from,
 * don't leave it open ended"), not duplicate PROCEDURE_CATEGORIES by hand
 * in care-agent.html — that would drift from the real dictionary in
 * care-agent-nlp.service.js. This is a static-source check (this project
 * has no jest/supertest available in this sandbox — see
 * tests/integration/care-agent.test.js's own environmental note) that the
 * route file imports PROCEDURE_CATEGORIES and includes it, as
 * `procedureOptions`, in both the session-start and per-message response
 * payloads.
 *
 * Run: node --test tests/unit/care-agent-route-procedure-options.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(
  path.join(__dirname, '../../backend/src/routes/care-agent.js'),
  'utf8'
);

describe('routes/care-agent.js exposes PROCEDURE_CATEGORIES to the frontend', () => {
  test('imports PROCEDURE_CATEGORIES from care-agent-nlp.service.js', () => {
    assert.match(routeSource, /PROCEDURE_CATEGORIES/, 'route must import the finite category list');
    assert.match(routeSource, /require\(['"]\.\.\/services\/care-agent-nlp\.service['"]\)/);
  });

  test('includes procedureOptions in the session-start response', () => {
    const createRoute = routeSource.slice(
      routeSource.indexOf("router.post('/sessions',"),
      routeSource.indexOf("router.get('/sessions/:id',")
    );
    assert.match(createRoute, /procedureOptions/, 'POST /sessions must return procedureOptions');
  });

  test('includes procedureOptions in the per-message response', () => {
    const messagesRoute = routeSource.slice(
      routeSource.indexOf("router.post('/sessions/:id/messages',"),
      routeSource.indexOf("router.post('/sessions/:id/confirm',")
    );
    assert.match(messagesRoute, /procedureOptions/, 'POST /sessions/:id/messages must return procedureOptions');
  });

  test('does not expose internal keyword phrases, only id/label pairs', () => {
    // A frontend chip should send back a clean label, not raw dictionary
    // matching phrases — keeps the API surface a stable, presentational
    // contract independent of extraction internals.
    assert.doesNotMatch(routeSource, /\.keywords\b/, 'route must not leak PROCEDURE_CATEGORIES[].keywords to clients');
  });
});
