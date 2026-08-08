'use strict';

/**
 * DAILY PIPELINE ORCHESTRATOR (§4)
 *
 * Runs the five stages in order and writes one outreach_runs row:
 *   1. Source   — Google Places text search per active vertical × target metro
 *   2. Enrich   — Places details + public business email derivation
 *   3. Score & draft — fit score, then Claude-generated draft + linter gate
 *   4. Follow-up scheduler — next sequence step for contacted-but-silent leads
 *   5. Brief    — compile + deliver the founder's morning brief
 *
 * HARD CONSTRAINT: the pipeline is human-gated. It only ever produces touches in
 * `draft` or `compliance_hold` status. Nothing here sets `status='sent'` — that
 * happens exclusively through the admin approve-queue (§4 human gate).
 *
 * Dependencies (repo/places/claude/brief) are injected so the pipeline is
 * unit-testable with in-memory fakes and no network. Defaults are the real ones.
 */

const { fitScore } = require('./scoring.service');
const { complianceScan } = require('./compliance.service');
const { stepContent, nextStep, stepDueInDays, scheduleFromNow } = require('./sequence.service');
const { OUTREACH_CONFIG, VERTICAL_SEARCH_TERMS } = require('../../config/outreach.config');

// `repo` and `brief` reach the Postgres client / email service, so they're only
// required lazily — when an injected fake isn't supplied. This keeps the
// orchestrator unit-testable (node:test) with in-memory fakes and no `pg`.
function resolveDeps(deps = {}) {
  return {
    repo: deps.repo || require('./repo'),
    places: deps.places || require('./places.service'),
    claude: deps.claude || require('./claude.service'),
    brief: deps.brief || require('./brief.service'),
  };
}

/** Stage 1 — Source. */
async function stageSource(deps, ctx) {
  const { repo, places } = deps;
  const existing = await repo.getExistingPlaceIds();
  const seen = new Set(existing);
  let inserted = 0;

  // Each active vertical gets an even share of the daily cap. Without this the
  // first vertical in the list would consume the whole budget and the ones after
  // it (dental, listed second) would never be sourced.
  const verticalCap = Math.max(1, Math.ceil(ctx.dailySourceCap / Math.max(ctx.verticals.length, 1)));

  outer: for (const vertical of ctx.verticals) {
    // A vertical may declare one search term or several (dental lists itself
    // under "dentist", "dental practice", "orthodontist" and more).
    const terms = [].concat(VERTICAL_SEARCH_TERMS[vertical] || `${vertical} clinic`);
    let verticalInserted = 0;
    for (const term of terms) {
      if (verticalInserted >= verticalCap) break;
      for (const metro of ctx.metros) {
        if (verticalInserted >= verticalCap) break;
        let results;
        try {
          results = await places.textSearch(term, metro);
        } catch (err) {
          ctx.errors.push({ stage: 'source', vertical, term, metro, error: err.message });
          continue;
        }
        for (const r of results || []) {
          if (inserted >= ctx.dailySourceCap) break outer;
          if (verticalInserted >= verticalCap) break;
          if (!r.place_id || seen.has(r.place_id)) continue;
          seen.add(r.place_id);
          try {
            const row = await repo.insertSourcedLead({
              practice_name: r.practice_name,
              vertical,
              source: 'google_places',
              place_id: r.place_id,
              metro: r.metro || metro,
              address: r.address || null,
              rating: r.rating ?? null,
              ratings_count: r.ratings_count ?? null,
              owner: OUTREACH_CONFIG.senderName,
            });
            if (row) {
              inserted += 1;
              verticalInserted += 1;
            }
          } catch (err) {
            ctx.errors.push({ stage: 'source', place_id: r.place_id, error: err.message });
          }
        }
      }
    }
  }
  ctx.summary.leads_sourced = inserted;
}

/** Stage 2 — Enrich. */
async function stageEnrich(deps, ctx) {
  const { repo, places } = deps;
  const leads = await repo.getLeadsByStage('sourced');
  for (const lead of leads) {
    try {
      const details = await places.placeDetails(lead.place_id);
      let email = null;
      if (details.website) {
        email = await places.derivePublicEmail(details.website).catch(() => null);
      }
      await repo.updateLead(lead.id, {
        website: details.website ?? lead.website ?? null,
        phone: details.phone ?? lead.phone ?? null,
        rating: details.rating ?? lead.rating ?? null,
        ratings_count: details.ratings_count ?? lead.ratings_count ?? null,
        email,
        stage: 'enriched',
      });
    } catch (err) {
      ctx.errors.push({ stage: 'enrich', id: lead.id, error: err.message });
    }
  }
}

/** Stage 3 — Score & draft. */
async function stageScoreAndDraft(deps, ctx) {
  const { repo, claude } = deps;
  const leads = await repo.getLeadsByStage('enriched');

  // Score first so we can prioritise the top leads for the (capped) drafting budget.
  const scored = [];
  for (const lead of leads) {
    const score = fitScore(lead);
    await repo.updateLead(lead.id, { fit_score: score });
    scored.push({ ...lead, fit_score: score });
  }
  scored.sort((a, b) => b.fit_score - a.fit_score);

  const budget = scored.slice(0, ctx.dailyDraftCap);
  for (const lead of budget) {
    let draft;
    try {
      draft = await claude.generateDraft(lead);
    } catch (err) {
      ctx.errors.push({ stage: 'draft', id: lead.id, error: err.message });
      continue;
    }

    const combined = [draft.subject, draft.email_body, draft.linkedin_dm].filter(Boolean).join('\n');
    const flags = complianceScan(combined);
    const status = flags.length ? 'compliance_hold' : 'draft';
    const channel = lead.email ? 'email' : 'linkedin';
    const body = channel === 'email' ? draft.email_body : draft.linkedin_dm;

    try {
      await repo.insertTouch({
        provider_id: lead.id,
        channel,
        direction: 'outbound',
        sequence_step: 0,
        subject: draft.subject,
        body,
        status,
        compliance_flags: flags,
      });
      await repo.updateLead(lead.id, { stage: 'drafted' });
      if (status === 'compliance_hold') ctx.summary.compliance_holds += 1;
      else ctx.summary.drafts_created += 1;
    } catch (err) {
      ctx.errors.push({ stage: 'draft', id: lead.id, error: err.message });
    }
  }
}

/** Stage 4 — Follow-up scheduler. */
async function stageFollowups(deps, ctx) {
  const { repo } = deps;
  let due;
  try {
    due = await repo.getContactedDueForFollowup(new Date());
  } catch (err) {
    ctx.errors.push({ stage: 'followup', error: err.message });
    return;
  }

  for (const lead of due) {
    try {
      const lastStep = await repo.getLastOutboundStep(lead.id);
      const step = nextStep(lastStep);
      if (step === null) continue; // sequence exhausted
      const content = stepContent(step, lead.practice_name);
      if (!content) continue;

      const combined = [content.subject, content.email_body, content.linkedin_dm].filter(Boolean).join('\n');
      const flags = complianceScan(combined);
      const status = flags.length ? 'compliance_hold' : 'draft';
      const channel = lead.email ? 'email' : 'linkedin';
      const body = channel === 'email' ? content.email_body : content.linkedin_dm;

      await repo.insertTouch({
        provider_id: lead.id,
        channel,
        direction: 'outbound',
        sequence_step: step,
        subject: content.subject,
        body,
        status,
        compliance_flags: flags,
      });
      ctx.summary.followups_due += 1;
      if (status === 'compliance_hold') ctx.summary.compliance_holds += 1;
    } catch (err) {
      ctx.errors.push({ stage: 'followup', id: lead.id, error: err.message });
    }
  }
}

/**
 * Run the full daily pipeline.
 * @param {object} deps       injectable { repo, places, claude, brief }
 * @param {object} [opts]
 * @param {boolean} [opts.send=true]   deliver the brief + emails (false = dry-run)
 * @param {string[]} [opts.verticals]  override active verticals
 * @param {string[]} [opts.metros]     override target metros
 * @param {number} [opts.dailySourceCap]
 * @param {number} [opts.dailyDraftCap]
 * @returns {Promise<object>} the run summary
 */
async function runDailyPipeline(deps = {}, opts = {}) {
  const resolved = resolveDeps(deps);
  const ctx = {
    verticals: opts.verticals || OUTREACH_CONFIG.activeVerticals,
    metros: opts.metros || OUTREACH_CONFIG.targetMetros,
    dailySourceCap: opts.dailySourceCap ?? OUTREACH_CONFIG.dailySourceCap,
    dailyDraftCap: opts.dailyDraftCap ?? OUTREACH_CONFIG.dailyDraftCap,
    errors: [],
    summary: { leads_sourced: 0, drafts_created: 0, followups_due: 0, compliance_holds: 0 },
  };

  await stageSource(resolved, ctx);
  await stageEnrich(resolved, ctx);
  await stageScoreAndDraft(resolved, ctx);
  await stageFollowups(resolved, ctx);

  // Stage 5 — Brief. Dry-run passes send:false so nothing leaves the system.
  try {
    await resolved.brief.deliverDailyBrief({ send: opts.send !== false });
  } catch (err) {
    ctx.errors.push({ stage: 'brief', error: err.message });
  }

  ctx.summary.errors = ctx.errors;
  const run = await resolved.repo.insertRun(ctx.summary);
  return { ...ctx.summary, run_id: run && run.id };
}

module.exports = {
  runDailyPipeline,
  stageSource,
  stageEnrich,
  stageScoreAndDraft,
  stageFollowups,
  // exposed for the follow-up interval scheduling used by the approve worker
  stepDueInDays,
  scheduleFromNow,
};
