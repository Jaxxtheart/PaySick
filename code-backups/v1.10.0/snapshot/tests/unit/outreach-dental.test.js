/**
 * Unit Tests - Dental added to the outreach plan
 * Node.js built-in test runner. No DB, no network (dependencies are injected).
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * Dentists become an active outreach vertical alongside aesthetics: they are
 * sourced daily, scored as a launch vertical, and drafted with dental-specific
 * framing. Sourcing a dental practice needs more than one search term, because
 * practices list themselves as "dentist", "dental practice" or "dental clinic".
 *
 * Run: node --test tests/unit/outreach-dental.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  OUTREACH_CONFIG,
  VERTICAL_WEIGHTS,
  VERTICAL_SEARCH_TERMS,
} = require('../../backend/src/config/outreach.config');
const { fitScore } = require('../../backend/src/services/outreach/scoring.service');
const { runDailyPipeline } = require('../../backend/src/services/outreach/pipeline.service');
const { SYSTEM_PROMPT } = require('../../backend/src/services/outreach/claude.service');

describe('dental is an active outreach vertical', () => {
  test('activeVerticals includes dental alongside aesthetics', () => {
    assert.ok(OUTREACH_CONFIG.activeVerticals.includes('dental'), 'dental must be active');
    assert.ok(OUTREACH_CONFIG.activeVerticals.includes('aesthetics'), 'aesthetics stays active');
  });

  test('dental is weighted as a launch vertical', () => {
    assert.equal(VERTICAL_WEIGHTS.dental, 1.0);
  });

  test('dental sourcing uses several search terms', () => {
    const terms = VERTICAL_SEARCH_TERMS.dental;
    assert.ok(Array.isArray(terms), 'dental search terms must be a list');
    assert.ok(terms.length >= 2, 'expected more than one dental search term');
    assert.ok(terms.some((t) => /dentist/i.test(t)), 'expected a "dentist" term');
    assert.ok(terms.some((t) => /dental/i.test(t)), 'expected a "dental" term');
  });

  test('a reachable dental practice in a target metro scores as a top lead', () => {
    const score = fitScore({
      vertical: 'dental',
      metro: 'Johannesburg',
      website: 'https://smile.example',
      email: 'hello@smile.example',
      rating: 4.7,
      ratings_count: 150,
    });
    assert.ok(score >= 90, `expected a strong dental fit score, got ${score}`);
  });

  test('the drafting prompt carries a dental-specific angle', () => {
    assert.match(SYSTEM_PROMPT, /dental|dentist/i);
  });
});

describe('the pipeline sources dental practices', () => {
  function makeDeps() {
    const state = { leads: [], touches: [], runs: [], queries: [] };
    let idc = 0;
    const deps = {
      repo: {
        async getExistingPlaceIds() { return new Set(); },
        async insertSourcedLead(lead) {
          const row = { id: `lead-${++idc}`, stage: 'sourced', fit_score: 0, ...lead };
          state.leads.push(row);
          return row;
        },
        async getLeadsByStage(stage) { return state.leads.filter((l) => l.stage === stage); },
        async updateLead(id, fields) {
          const row = state.leads.find((l) => l.id === id);
          if (row) Object.assign(row, fields);
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
      },
      places: {
        async textSearch(term, metro) {
          state.queries.push({ term, metro });
          // Three results per query, so a single vertical can exhaust a small cap.
          return [1, 2, 3].map((n) => ({
            place_id: `pid-${term}-${metro}-${n}`,
            practice_name: `${metro} ${term} ${n}`,
            metro,
            rating: 4.6,
            ratings_count: 90,
          }));
        },
        async placeDetails() {
          return { website: 'https://smile.example', phone: '+27 11 000 0000', rating: 4.6, ratings_count: 90 };
        },
        async derivePublicEmail() { return 'hello@smile.example'; },
      },
      claude: {
        async generateDraft() {
          return {
            subject: 'Paid in full within 24 hours',
            email_body: 'Your patients pay in affordable monthly instalments while you are paid upfront.',
            linkedin_dm: 'Register as a provider on paysick.co.za.',
          };
        },
      },
      brief: { async deliverDailyBrief() { return { data: {}, html: '' }; } },
    };
    return { deps, state };
  }

  test('queries every dental search term and inserts leads tagged dental', async () => {
    const { deps, state } = makeDeps();
    await runDailyPipeline(deps, { send: false, verticals: ['dental'], metros: ['Johannesburg'] });

    const terms = [].concat(VERTICAL_SEARCH_TERMS.dental);
    for (const term of terms) {
      assert.ok(
        state.queries.some((q) => q.term === term && q.metro === 'Johannesburg'),
        `expected a Places query for "${term}"`
      );
    }
    assert.ok(state.leads.length > 0, 'expected dental leads');
    for (const lead of state.leads) {
      assert.equal(lead.vertical, 'dental');
    }
  });

  test('the daily source cap is shared across verticals, not eaten by the first', async () => {
    // Aesthetics is listed first. Without a per-vertical share it would consume
    // the whole daily cap and dentists would never be sourced.
    const { deps, state } = makeDeps();
    await runDailyPipeline(deps, {
      send: false,
      verticals: ['aesthetics', 'dental'],
      metros: ['Johannesburg', 'Cape Town'],
      dailySourceCap: 4,
    });

    assert.ok(state.leads.length <= 4, 'the global cap still holds');
    const dental = state.leads.filter((l) => l.vertical === 'dental');
    const aesthetics = state.leads.filter((l) => l.vertical === 'aesthetics');
    assert.equal(dental.length, 2, 'dental gets its half of the cap');
    assert.equal(aesthetics.length, 2, 'aesthetics gets its half of the cap');
  });

  test('a mixed aesthetics + dental run tags each lead with its own vertical', async () => {
    const { deps, state } = makeDeps();
    await runDailyPipeline(deps, {
      send: false,
      verticals: ['aesthetics', 'dental'],
      metros: ['Cape Town'],
    });

    const verticals = new Set(state.leads.map((l) => l.vertical));
    assert.ok(verticals.has('aesthetics'), 'expected aesthetics leads');
    assert.ok(verticals.has('dental'), 'expected dental leads');
  });
});
