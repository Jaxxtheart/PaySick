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
  // Launch verticals. Dentists were added alongside aesthetics: high volume of
  // planned, price-sensitive procedures that patients postpone on price alone.
  // Add "fertility" next. Changing this switches targeting.
  activeVerticals: ['aesthetics', 'dental'],

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

  // THE primary call to action in every outreach message: register as a PaySick
  // provider on the website. The 15 minute demo is secondary, offered only after
  // the registration link. See services/outreach/cta.js for enforcement.
  providerRegistrationPath: '/provider-apply.html',

  // Anything a practice needs before registering goes here.
  contactEmail: 'hello@paysick.co.za',
};

/**
 * The public origin used in outreach copy. Prospects click these links, so a
 * local/staging APP_URL must never leak into a message: PUBLIC_SITE_URL wins,
 * APP_URL is used only when it is not a localhost address, otherwise the live
 * site is assumed.
 * @returns {string} origin with no trailing slash
 */
function publicSiteUrl() {
  const candidates = [process.env.PUBLIC_SITE_URL, process.env.APP_URL];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(candidate)) continue;
    return candidate.replace(/\/+$/, '');
  }
  return 'https://paysick.co.za';
}

/**
 * Absolute link to the provider registration page, for use in outreach copy.
 * @returns {string}
 */
function registrationUrl() {
  return `${publicSiteUrl()}${OUTREACH_CONFIG.providerRegistrationPath}`;
}

// Transparent per-vertical fit weights (§6.2). Tuned later against real conversion.
// Dental sits at launch weight alongside aesthetics now that dentists are an
// active vertical.
const VERTICAL_WEIGHTS = {
  aesthetics: 1.0,
  fertility: 1.0,
  dental: 1.0,
  ophthalmology: 0.8,
  orthopaedics: 0.6,
  general_surgery: 0.4,
};

// Places Text Search query terms per vertical (Stage 1). A string or a list;
// every term in a list is searched per metro. Dental needs several because
// practices list themselves as "dentist", "dental practice" or "dental clinic",
// and the high-ticket work (implants, orthodontics, cosmetic) sits under
// separate listings again.
const VERTICAL_SEARCH_TERMS = {
  aesthetics: 'aesthetic clinic',
  fertility: 'fertility clinic',
  dental: [
    'dentist',
    'dental practice',
    'dental clinic',
    'dental implants',
    'orthodontist',
    'cosmetic dentist',
  ],
  ophthalmology: 'ophthalmology clinic',
  orthopaedics: 'orthopaedic practice',
  general_surgery: 'surgical practice',
};

module.exports = {
  OUTREACH_CONFIG,
  VERTICAL_WEIGHTS,
  VERTICAL_SEARCH_TERMS,
  publicSiteUrl,
  registrationUrl,
};
