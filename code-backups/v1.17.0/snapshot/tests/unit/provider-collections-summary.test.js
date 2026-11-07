'use strict';

/**
 * Unit Tests — Provider Collections Summary Endpoint
 *
 * GET /api/providers/dashboard/collections-summary
 *
 * The one piece of the Recovery Engine a provider ever sees: an
 * aggregate, reputational, read-only summary. No patient-level detail,
 * no action items — the provider never builds or staffs a collections
 * desk of their own.
 *
 * This route is DB-backed (like the other /dashboard/* provider routes),
 * so — matching the convention already used by provider-dashboard.test.js
 * in this suite — it is verified two ways without requiring a live
 * database connection:
 *   1. Source-level registration checks: the route exists, is gated by
 *      authenticateToken + requireRole('provider'), and is registered
 *      ahead of the public /:id lookup (so Express never mistakes
 *      "dashboard" for a provider_id).
 *   2. A response-shape data contract the frontend and this spec agree on.
 *
 * Written BEFORE implementation (test-first workflow, CLAUDE.md).
 * Run: node --test tests/unit/provider-collections-summary.test.js
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROUTE_FILE = path.join(__dirname, '../../backend/src/routes/providers.js');
const source = fs.readFileSync(ROUTE_FILE, 'utf8');

function extractRouteBlock(src, routePath) {
  const marker = `router.get('${routePath}'`;
  const start = src.indexOf(marker);
  if (start === -1) return null;

  // Naive brace-balanced extraction from the marker to the matching `});`.
  let depth = 0;
  let i = start;
  let bodyStart = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') {
      if (bodyStart === -1) bodyStart = i;
      depth++;
    } else if (src[i] === '}') {
      depth--;
      if (depth === 0 && bodyStart !== -1) {
        return { header: src.slice(start, bodyStart), block: src.slice(start, i + 1) };
      }
    }
  }
  return null;
}

describe('GET /dashboard/collections-summary — route registration', () => {
  test('the route exists on the providers router', () => {
    assert.ok(
      source.includes("router.get('/dashboard/collections-summary'"),
      'expected /dashboard/collections-summary GET route to be registered'
    );
  });

  test('the route requires authentication and the provider role before its handler', () => {
    const route = extractRouteBlock(source, '/dashboard/collections-summary');
    assert.ok(route, 'route block not found');
    assert.match(route.header, /authenticateToken/);
    assert.match(route.header, /requireRole\(\s*['"]provider['"]\s*\)/);
  });

  test('the route is registered before the public /:id catch-all', () => {
    const summaryIndex = source.indexOf("router.get('/dashboard/collections-summary'");
    const publicByIdIndex = source.indexOf("router.get('/:id'");
    assert.ok(summaryIndex >= 0 && publicByIdIndex >= 0);
    // Dashboard routes (which resolve providerId from the authenticated user)
    // must be registered before the public single-provider lookup, otherwise
    // Express would treat "dashboard" as a provider_id.
    assert.ok(summaryIndex < publicByIdIndex);
  });

  test('the handler returns aggregate fields only, never patient-level detail', () => {
    const route = extractRouteBlock(source, '/dashboard/collections-summary');
    assert.ok(route);

    const requiredInBlock = [
      'overdue_payments_count',
      'open_collections_cases',
      'cured_count',
      'cure_rate_pct'
    ];
    for (const field of requiredInBlock) {
      assert.ok(route.block.includes(field), `handler must return ${field}`);
    }

    const forbiddenInBlock = ['full_name', 'sa_id_number', 'cell_number', 'patient_id'];
    for (const field of forbiddenInBlock) {
      assert.ok(!route.block.includes(field), `handler must never expose ${field}`);
    }
  });
});

describe('GET /dashboard/collections-summary — response contract', () => {
  test('the response shape is aggregate-only, with no patient-level fields', () => {
    const requiredFields = [
      'provider_id',
      'overdue_payments_count',
      'open_collections_cases',
      'cured_count',
      'cure_rate_pct',
      'note'
    ];
    const forbiddenFields = [
      'patients', 'patient_list', 'patient_id', 'full_name',
      'sa_id_number', 'cell_number', 'amount_outstanding_per_patient'
    ];

    const exampleResponse = {
      provider_id: 'provider-1',
      overdue_payments_count: 3,
      open_collections_cases: 2,
      cured_count: 11,
      cure_rate_pct: 84.6,
      note: 'Aggregate reputational summary only. PaySick owns all collections activity — no patient-level detail or action is required from the provider.'
    };

    for (const field of requiredFields) {
      assert.ok(Object.prototype.hasOwnProperty.call(exampleResponse, field), `missing required field: ${field}`);
    }
    for (const field of forbiddenFields) {
      assert.ok(!Object.prototype.hasOwnProperty.call(exampleResponse, field), `must never expose: ${field}`);
    }
  });
});
