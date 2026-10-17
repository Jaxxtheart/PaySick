/**
 * Shield Underwriting — Provider Risk Management.
 *
 * Providers are paid before the patient repays, which is moral hazard. This
 * stage manages exposure to the provider:
 *
 *   verification        HPCSA, BHF practice number, bank account — re-checked yearly
 *   trust tier          per-patient cap, monthly volume cap, holdback
 *   concentration       absolute rand caps during ramp-up, portfolio shares after
 *   performance         missed-payment / first-instalment / dispute breakers,
 *                       applied only once the sample is credible
 *   tariff control      gap invoices against benchmark (Segment 1)
 *   payout plan         80% on two-sided procedure confirmation, balance on
 *                       first collection or EOB reconciliation, holdback retained
 *
 * The provider grade and credibility-weighted missed rate are ALSO passed to
 * the Medical Risk Score as PD features (pdFeatures).
 */

'use strict';

const { ageDays, provenanceIssues, worstStatus } = require('./provenance');

function resolveTier(rawTier, policy) {
  const pp = policy.provider;
  const raw = String(rawTier || '').trim();
  const alias = pp.tierAliases[raw.toUpperCase()];
  if (alias) return alias;
  if (pp.tiers[raw.toLowerCase()]) return raw.toLowerCase();
  return 'probation';
}

function credibleMissedRate(metrics, policy) {
  const prior = policy.mrs.providerPriorMissedRate;
  const k = policy.mrs.providerCredibilityK;
  if (!metrics) return prior;
  const n = Number(metrics.arrangements90d) || 0;
  const obs = Number(metrics.missed90dRate) || 0;
  return Math.round(((n * obs + k * prior) / (n + k)) * 10000) / 10000;
}

function buildPayoutPlan(amountCents, holdbackPct, isGap, policy) {
  const provisional = Math.round(amountCents * policy.provider.payout.provisionalPct / 100);
  const holdback = Math.round(amountCents * holdbackPct / 100);
  const balance = amountCents - provisional - holdback;
  const tranches = [
    { sequence: 1, amountCents: provisional, releaseConditions: ['PATIENT_PROCEDURE_CONFIRMATION', 'PROVIDER_PROCEDURE_CONFIRMATION'] },
    { sequence: 2, amountCents: balance, releaseConditions: [isGap ? 'EOB_RECONCILIATION' : 'FIRST_INSTALMENT_COLLECTED'] }
  ];
  if (holdback > 0) {
    tranches.push({ sequence: 3, amountCents: holdback, releaseConditions: ['HOLDBACK_RELEASE_90_DAYS_CURRENT'] });
  }
  return {
    holdbackPct,
    tranches,
    conditions: ['PROVIDER_RECOURSE_ON_DISPUTE', 'PROVIDER_BANK_ACCOUNT_VERIFIED']
  };
}

function assessProviderRisk(input, policy, opts = {}) {
  const { provider, portfolio, application, segment1 } = input;
  const { now, allowMockSources = false } = opts;
  const pp = policy.provider;
  const amount = Math.round(input.facilitationAmountCents ?? application.amountCents);
  const isGap = application.segment === 'SEGMENT_1_GAP';

  const reasons = [];
  const statuses = [];
  const add = (status, code) => { statuses.push(status); reasons.push(code); };
  const info = (code) => reasons.push(code);

  if (!provider) {
    return {
      status: 'REFER',
      grade: null,
      reasonCodes: ['DATA_UNAVAILABLE:provider'],
      limits: null,
      payoutPlan: null,
      measures: {},
      pdFeatures: { providerGrade: null, providerMissedRateCredible: credibleMissedRate(null, policy), providerDisputeRate: null }
    };
  }

  provenanceIssues('provider', provider, { allowMockSources }).forEach((c) => add('REFER', c));

  if (!pp.eligibleStatuses.includes(provider.status)) add('DECLINE', 'PROVIDER_STATUS');

  // ── Verification ──
  const v = provider.verification || {};
  if (!v.hpcsaVerified || !v.practiceNumberVerified || !v.bankAccountVerified) {
    add('REFER', 'PROVIDER_VERIFICATION_INCOMPLETE');
  }
  if (ageDays(v.verifiedAt, now) > policy.dataFreshnessDays.providerVerification) {
    add('REFER', 'PROVIDER_VERIFICATION_STALE');
  }

  // ── Trust tier ──
  const tierKey = resolveTier(provider.tier, policy);
  const tier = pp.tiers[tierKey];
  if (amount > tier.perPatientCapCents) add('DECLINE', 'PROVIDER_TIER_PATIENT_CAP');

  // ── Performance (credible samples only) ──
  const metrics = provider.metrics;
  let watch = false;
  let credibleSample = false;
  if (!metrics) {
    add('REFER', 'DATA_UNAVAILABLE:providerMetrics');
  } else {
    const perf = pp.performance;
    if (tier.maxMonthlyVolume !== null && (metrics.monthlyVolumeCount || 0) >= tier.maxMonthlyVolume) {
      add('REFER', 'PROVIDER_MONTHLY_VOLUME_CAP');
    }
    const n = Number(metrics.arrangements90d) || 0;
    credibleSample = n >= perf.minSample;
    if (!credibleSample) {
      info('PROVIDER_METRICS_LOW_CREDIBILITY');
    } else if (metrics.missed90dRate > perf.missedSuspendRate) {
      add('DECLINE', 'PROVIDER_PERFORMANCE_SUSPENSION');
      watch = true;
    } else if (metrics.missed90dRate > perf.missedWatchRate) {
      add('REFER', 'PROVIDER_PERFORMANCE_WATCH');
      watch = true;
    }
    if ((Number(metrics.fpdSample) || 0) >= perf.minFpdSample) {
      if (metrics.fpdRate > perf.fpdSuspendRate) {
        add('DECLINE', 'PROVIDER_FIRST_INSTALMENT_FAILURE');
        watch = true;
      } else if (metrics.fpdRate > perf.fpdWatchRate) {
        add('REFER', 'PROVIDER_FIRST_INSTALMENT_WATCH');
        watch = true;
      }
    }
    if ((metrics.disputeRate || 0) > perf.disputeWatchRate) {
      add('REFER', 'PROVIDER_DISPUTE_RATE');
      watch = true;
    }
    if ((metrics.complaints30d || 0) >= perf.complaintsWatch30d) {
      add('REFER', 'PROVIDER_COMPLAINTS');
      watch = true;
    }
  }

  // ── Concentration ──
  const measures = { tier: tierKey, credibleSample };
  if (!portfolio) {
    add('REFER', 'DATA_UNAVAILABLE:portfolio');
  } else if (metrics) {
    const total = Number(portfolio.totalOutstandingCents) || 0;
    const projectedTotal = total + amount;
    const projectedProvider = (Number(metrics.outstandingCents) || 0) + amount;
    const procTypeOutstanding = portfolio.procedureTypeOutstandingCents;
    const ramp = total < pp.rampUp.bookThresholdCents;
    measures.concentrationMode = ramp ? 'RAMP_UP_ABSOLUTE' : 'PORTFOLIO_SHARE';
    measures.projectedProviderExposureCents = projectedProvider;
    measures.projectedProviderShare = Math.round((projectedProvider / projectedTotal) * 10000) / 10000;

    if (ramp ? projectedProvider > pp.rampUp.providerCapCents
             : projectedProvider / projectedTotal > pp.maxProviderShare) {
      add('DECLINE', 'CONCENTRATION_PROVIDER');
    }

    if (procTypeOutstanding === null || procTypeOutstanding === undefined) {
      add('REFER', 'DATA_UNAVAILABLE:procedureTypeExposure');
    } else {
      const projectedProc = Number(procTypeOutstanding) + amount;
      measures.projectedProcedureTypeExposureCents = projectedProc;
      measures.projectedProcedureTypeShare = Math.round((projectedProc / projectedTotal) * 10000) / 10000;
      if (ramp ? projectedProc > pp.rampUp.procedureTypeCapCents
               : projectedProc / projectedTotal > pp.maxProcedureTypeShare) {
        add('DECLINE', 'CONCENTRATION_PROCEDURE_TYPE');
      }
    }
  }

  // ── Tariff control (gap) ──
  if (isGap) {
    if (!provider.billingAgreementSigned) add('DECLINE', 'PROVIDER_NO_BILLING_AGREEMENT');
    const benchmark = Number(segment1?.benchmarkCents) || 0;
    if (!benchmark) {
      add('REFER', 'TARIFF_BENCHMARK_UNAVAILABLE');
    } else {
      const ratio = application.amountCents / benchmark;
      measures.tariffRatio = Math.round(ratio * 1000) / 1000;
      if (ratio > pp.tariff.declineMultiple) add('DECLINE', 'TARIFF_ABOVE_HARD_LIMIT');
      else if (ratio > pp.tariff.referMultiple) add('REFER', 'TARIFF_ABOVE_BENCHMARK');
    }
    if (segment1 && segment1.dspIsOnList === false) info('DSP_WARNING_REQUIRED');
  }

  // ── Grade ──
  const missedCredible = credibleMissedRate(metrics, policy);
  let grade;
  if (watch) grade = 'P4';
  else if (tierKey === 'probation') grade = 'P3';
  else if ((tierKey === 'trusted' || tierKey === 'premium') && credibleSample
           && metrics.missed90dRate <= policy.mrs.providerPriorMissedRate) grade = 'P1';
  else grade = 'P2';

  const monthlyUsed = Number(metrics?.monthlyVolumeCount) || 0;
  return {
    status: worstStatus(statuses),
    grade,
    reasonCodes: reasons,
    limits: {
      perPatientCapCents: tier.perPatientCapCents,
      maxMonthlyVolume: tier.maxMonthlyVolume,
      remainingMonthlyVolume: tier.maxMonthlyVolume === null ? null : Math.max(0, tier.maxMonthlyVolume - monthlyUsed)
    },
    payoutPlan: buildPayoutPlan(amount, tier.holdbackPct, isGap, policy),
    measures,
    pdFeatures: {
      providerGrade: grade,
      providerMissedRateCredible: missedCredible,
      providerDisputeRate: metrics ? Number(metrics.disputeRate) || 0 : null
    }
  };
}

module.exports = { assessProviderRisk, resolveTier };
