/**
 * Provider scoring service.
 *
 * Pure tier/status logic plus a nightly recalculation job that walks the
 * provider table and updates each provider's tier and status from rolling
 * 90-day performance.
 *
 * Caps and payout delays per tier match the spec exactly.
 */

'use strict';

const tierConfig = {
  NEW:          { perPatientCapCents:  1_000_000, payoutDelayDays: 5, holdbackPercent: 10, holdbackApplications: 20 },
  DEVELOPING:   { perPatientCapCents:  2_500_000, payoutDelayDays: 3, holdbackPercent: 5,  holdbackApplications: 0 },
  ESTABLISHED:  { perPatientCapCents:  5_000_000, payoutDelayDays: 2, holdbackPercent: 0,  holdbackApplications: 0 },
  PREMIUM:      { perPatientCapCents: 10_000_000, payoutDelayDays: 1, holdbackPercent: 0,  holdbackApplications: 0 }
};

function calculateTier(pdRate, applicationCount) {
  if (applicationCount < 20) return 'NEW';
  if (pdRate <= 0.02 && applicationCount >= 100) return 'PREMIUM';
  if (pdRate <= 0.03 && applicationCount >= 50) return 'ESTABLISHED';
  if (pdRate <= 0.05 && applicationCount >= 20) return 'DEVELOPING';
  return 'NEW';
}

function calculateStatus(pdRate, currentStatus) {
  if (pdRate >= 0.08) return 'SUSPENDED';
  if (pdRate >= 0.06) return 'THROTTLED';
  if (currentStatus === 'THROTTLED' && pdRate < 0.04) return 'ACTIVE';
  return currentStatus;
}

/**
 * Run nightly. Returns counts of providers updated by tier transition.
 *
 * @param {object} deps
 * @param {{ query: function }} deps.db - database adapter
 * @param {{ fire: function }} [deps.webhooks]
 */
async function runNightlyScoring({ db, webhooks } = {}) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('runNightlyScoring requires a db adapter');
  }

  const { rows } = await db.query(
    `SELECT provider_id, status, tier,
            COALESCE(applications_90d, 0)::int AS applications_90d,
            COALESCE(pd_rate_90d, 0)::float    AS pd_rate_90d
     FROM provider_scoring_snapshot`
  );

  const updates = { tierChanges: 0, statusChanges: 0, suspended: [] };

  for (const row of rows) {
    const newTier = calculateTier(row.pd_rate_90d, row.applications_90d);
    const newStatus = calculateStatus(row.pd_rate_90d, row.status || 'ACTIVE');

    if (newTier !== row.tier || newStatus !== row.status) {
      await db.query(
        `UPDATE providers
            SET tier = $1, status = $2, scoring_updated_at = NOW()
          WHERE provider_id = $3`,
        [newTier, newStatus, row.provider_id]
      );
      if (newTier !== row.tier) updates.tierChanges += 1;
      if (newStatus !== row.status) {
        updates.statusChanges += 1;
        if (newStatus === 'SUSPENDED') {
          updates.suspended.push(row.provider_id);
          if (webhooks && typeof webhooks.fire === 'function') {
            await webhooks.fire('provider.suspended', {
              providerId: row.provider_id,
              pdRate: row.pd_rate_90d
            });
          }
        }
        if (newStatus === 'THROTTLED' && webhooks && typeof webhooks.fire === 'function') {
          await webhooks.fire('provider.throttled', {
            providerId: row.provider_id,
            pdRate: row.pd_rate_90d
          });
        }
      }
    }
  }

  return updates;
}

module.exports = {
  tierConfig,
  calculateTier,
  calculateStatus,
  runNightlyScoring
};
