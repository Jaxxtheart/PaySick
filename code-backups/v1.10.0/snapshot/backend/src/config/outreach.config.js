'use strict';

/**
 * DAILY PROVIDER OUTREACH AGENT — CONFIGURATION
 *
 * Single source of truth for the outreach agent's targeting and pacing.
 *
 * To switch the launch vertical, change `activeVerticals` to e.g. ["fertility"]
 * — no other code change is required (acceptance criterion §9).
 *
 * Env vars consumed elsewhere (never hardcode secrets here):
 *   GOOGLE_PLACES_API_KEY  — Google Places sourcing/enrichment (Stages 1-2)
 *   ANTHROPIC_API_KEY      — Claude drafting (Stage 3, §6.1)
 *   ANTHROPIC_MODEL        — model string (defaults to a current Sonnet-class model)
 *   CRON_SECRET            — guards the daily cron route (§4)
 *   SMTP_*                 — reused from the existing email service for the daily brief
 */

const OUTREACH_CONFIG = {
  // Launch narrow; add "fertility" next. Changing this switches targeting.
  activeVerticals: ['aesthetics'],

  targetMetros: ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria'],

  // Rate discipline (§2.4) — protect API quota and pipeline quality.
  dailySourceCap: 20,
  dailyDraftCap: 15,

  // Follow-up cadence in days: step 0 (initial), 1 (bump), 2 (value), 3 (breakup).
  sequenceDays: [0, 3, 7, 14],

  senderName: 'Mosiuwa Tshabalala',
  // Cosmetic label only — the actual From is SMTP_FROM (see email.service).
  senderEmail: process.env.SMTP_FROM || 'hello@paysick.co.za',

  // Where the daily brief is emailed. MUST be an inbox that actually exists at
  // your mail host — Resend sends mail but does NOT host mailboxes, so a made-up
  // address (e.g. founder@paysick.co.za with no mailbox) hard-bounces. Set
  // BRIEF_RECIPIENTS (comma-separated) to a real inbox you monitor.
  briefRecipients: (process.env.BRIEF_RECIPIENTS || 'hello@paysick.co.za')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Where the agentic onboarding reply points a provider who replies (§5).
  // Combined with APP_URL to form the full link.
  onboardingLink: '/provider-apply.html',
};

// Transparent per-vertical fit weights (§6.2). Tuned later against real conversion.
const VERTICAL_WEIGHTS = {
  aesthetics: 1.0,
  fertility: 1.0,
  dental: 0.8,
  ophthalmology: 0.8,
  orthopaedics: 0.6,
  general_surgery: 0.4,
};

// Places Text Search query template per vertical (Stage 1).
const VERTICAL_SEARCH_TERMS = {
  aesthetics: 'aesthetic clinic',
  fertility: 'fertility clinic',
  dental: 'dental practice',
  ophthalmology: 'ophthalmology clinic',
  orthopaedics: 'orthopaedic practice',
  general_surgery: 'surgical practice',
};

module.exports = { OUTREACH_CONFIG, VERTICAL_WEIGHTS, VERTICAL_SEARCH_TERMS };
