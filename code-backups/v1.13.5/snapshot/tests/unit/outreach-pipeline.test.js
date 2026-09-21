/**
 * Unit Tests — Daily outreach pipeline orchestration (§4)
 * Node.js built-in test runner. No DB, no network — dependencies are injected.
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * These lock the load-bearing acceptance criteria (§9):
 *   - a dry-run sources, enriches, scores, and drafts WITHOUT sending anything;
 *   - every draft passed the linter — a denied term => compliance_hold, not draft;
 *   - the pipeline NEVER sets status='sent' (approval in admin is the only path);
 *   - exactly one outreach_runs summary row is written.
 *
 * Run: node --test tests/unit/outreach-pipeline.test.js
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { runDailyPipeline } = require('../../backend/src/services/outreach/pipeline.service');

/** Build an in-memory fake repo capturing all writes. */
function makeFakeRepo(preexistingPlaceIds = []) {
  const state = {
    leads: [],
    touches: [],
    runs: [],
    existingPlaceIds: new Set(preexistingPlaceIds),
    updates: [],
  };
  let idc = 0;
  const repo = {
    async getExistingPlaceIds() { return new Set(state.existingPlaceIds); },
    async insertSourcedLead(lead) {
      const row = { id: `lead-${++idc}`, stage: 'sourced', fit_score: 0, ...lead };
      state.leads.push(row);
      state.existingPlaceIds.add(lead.place_id);
      return row;
    },
    async getLeadsByStage(stage) { return state.leads.filter((l) => l.stage === stage); },
    async updateLead(id, fields) {
      const row = state.leads.find((l) => l.id === id);
      if (row) Object.assign(row, fields);
      state.updates.push({ id, fields });
    },
    async insertTouch(touch) {
      const row = { id: `touch-${++idc}`, ...touch };
      state.touches.push(row);
      return row;
    },
    async getContactedDueForFollowup() { return []; },
    async getLastOutboundStep() { return 0; },
    async insertRun(summary) {
      const row = { id: `run-${++idc}`, ...summary };
      state.runs.push(row);
      return row;
    },
  };
  return { repo, state };
}

function makeDeps(overrides = {}) {
  const { repo, state } = makeFakeRepo(overrides.preexistingPlaceIds);
  const deps = {
    repo,
    places: {
      async textSearch(term, metro) {
        return [
          { place_id: `pid-${metro}-1`, practice_name: `${metro} Aesthetics`, metro, rating: 4.8, ratings_count: 120, address: '1 Main St' },
          { place_id: `pid-${metro}-2`, practice_name: `${metro} Skin Clinic`, metro, rating: 4.2, ratings_count: 40, address: '2 Main St' },
        ];
      },
      async placeDetails() {
        return { website: 'https://clinic.example', phone: '+27 11 000 0000', rating: 4.6, ratings_count: 88 };
      },
      async derivePublicEmail() { return 'hello@clinic.example'; },
    },
    claude: {
      async generateDraft() {
        return {
          subject: 'Paid in full within 24 hours',
          email_body: 'Your patients pay in affordable monthly instalments while you are paid upfront.',
          linkedin_dm: 'Quick 15-min demo?',
        };
      },
    },
    brief: { async deliverDailyBrief() { return { data: {}, html: '' }; } },
    ...overrides.deps,
  };
  return { deps, state };
}

describe('runDailyPipeline — dry run, no send', () => {
  test('sources, enriches, scores and drafts, writing one run row and sending nothing', async () => {
    const { deps, state } = makeDeps();
    const summary = await runDailyPipeline(deps, { send: false });

    // Sourced leads inserted (2 metros x 2 results in the fake, capped by config).
    assert.ok(state.leads.length > 0, 'expected sourced leads');
    assert.equal(summary.leads_sourced, state.leads.length);

    // Drafts created as outreach_touches with sequence_step 0.
    const initialDrafts = state.touches.filter((t) => t.sequence_step === 0);
    assert.ok(initialDrafts.length > 0, 'expected initial drafts');

    // Exactly one run summary row was written.
    assert.equal(state.runs.length, 1);

    // NO touch is ever 'sent' or 'approved' by the pipeline.
    for (const t of state.touches) {
      assert.notEqual(t.status, 'sent', 'pipeline must never set status=sent');
      assert.notEqual(t.status, 'approved', 'pipeline must never set status=approved');
      assert.ok(['draft', 'compliance_hold'].includes(t.status));
    }
  });

  test('a draft containing a denied term is compliance_hold, not draft', async () => {
    const { deps, state } = makeDeps({
      deps: {
        claude: {
          async generateDraft() {
            return {
              subject: 'Low interest loan option', // denied terms
              email_body: 'Flexible credit and repayment terms for your patients.',
              linkedin_dm: 'Ask us about financing.',
            };
          },
        },
      },
    });

    await runDailyPipeline(deps, { send: false });

    const initialTouches = state.touches.filter((t) => t.sequence_step === 0);
    assert.ok(initialTouches.length > 0);
    for (const t of initialTouches) {
      assert.equal(t.status, 'compliance_hold', 'denied terms must route to compliance_hold');
      assert.ok(Array.isArray(t.compliance_flags) && t.compliance_flags.length > 0);
    }
  });

  test('honours the daily source cap', async () => {
    const { deps, state } = makeDeps();
    await runDailyPipeline(deps, { send: false, dailySourceCap: 1 });
    assert.equal(state.leads.length, 1);
  });

  test('dedupes against existing place_ids', async () => {
    const { deps, state } = makeDeps({ preexistingPlaceIds: ['pid-Johannesburg-1'] });
    await runDailyPipeline(deps, { send: false, metros: ['Johannesburg'] });
    assert.ok(!state.leads.some((l) => l.place_id === 'pid-Johannesburg-1'));
  });
});
