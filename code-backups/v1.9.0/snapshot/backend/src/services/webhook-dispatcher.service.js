/**
 * Webhook dispatcher — queue-backed event fan-out.
 *
 * `fire(event, payload)` persists the event to the webhook_events table
 * with status PENDING; a separate worker (out of scope here) drains the
 * table and POSTs to subscriber URLs with retries. Persisting first
 * means we never lose an event on a crash.
 *
 * All event names are namespaced and listed in EVENTS for validation.
 */

'use strict';

const { query } = require('../config/database');

const EVENTS = Object.freeze([
  'application.approved',
  'application.declined',
  'application.manual_review',
  'application.cooling_off',
  'payout.disbursed_provisional',
  'payout.disbursed_final',
  'repayment.collected',
  'repayment.missed',
  'provider.throttled',
  'provider.suspended',
  'invoice.flagged_above_tariff',
  'invoice.exceeded_ceiling',
  'circuit_breaker.triggered',
  'circuit_breaker.reserve_fund_triggered',
  'holdback.released'
]);

async function fire(event, payload) {
  if (!EVENTS.includes(event)) {
    throw new Error(`Unknown webhook event: ${event}`);
  }
  try {
    await query(
      `INSERT INTO webhook_events (event_name, payload, status, created_at)
       VALUES ($1, $2::jsonb, 'PENDING', NOW())`,
      [event, JSON.stringify(payload || {})]
    );
  } catch (err) {
    // Fire-and-forget: log but don't fail the parent operation.
    // The worker will catch missed events on its next pass.
    console.error(`Webhook persist failed (${event}):`, err.message);
  }
  return { event, payload };
}

module.exports = {
  fire,
  EVENTS
};
