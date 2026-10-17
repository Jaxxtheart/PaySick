/**
 * Shield Underwriting — Credit Policy (single source of truth).
 *
 * Every threshold the underwriting module applies lives here, under one
 * version string. The version is stamped on every decision, so any decision
 * can be traced to the exact policy that produced it. Changing a number here
 * means bumping `version` — derivePolicy() enforces that for overrides.
 *
 * Money is integer cents. Rates are fractions (0.20 = 20%).
 */

'use strict';

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

const POLICY_DEFINITION = {
  version: 'SHIELD-POL-2026.10.0',

  // Phase 1 = self-pay Elective Four. Gap financing unlocks in Phase 2 once
  // live scheme-benefit verification and EOB reconciliation are in place.
  segments: {
    SEGMENT_2_OOP: { enabled: true },
    SEGMENT_1_GAP: { enabled: false }
  },

  application: {
    minAmountCents: 100_000,                // R1,000
    minTermMonths: 3,
    maxTermMonths: 36
  },

  dataFreshnessDays: {
    income: 90,
    bureau: 30,
    providerVerification: 365
  },

  income: {
    floorNetCents: 400_000,                 // R4,000 net — ethical floor
    minMonthsEvidence: 3,
    volatilityCvThreshold: 0.25,            // above → assess on lowest month
    verifiedMethods: ['OPEN_BANKING', 'BANK_STATEMENT', 'PAYSLIP_AND_BANK_STATEMENT'],
    humanConfirmedMethods: ['MANUAL_REVIEW'],
    unverifiedMethods: ['SELF_DECLARED']
  },

  affordability: {
    rtiCeiling: 0.20,                       // instalment ÷ NET income
    rtiTightCeiling: 0.15,                  // urgent / manual income / portfolio tightened
    rtiAmber: 0.15,
    dtiCeiling: 0.55,                       // (obligations + instalment) ÷ GROSS — all segments
    dtiAmber: 0.45,
    minDiscretionaryCover: 1.0,             // discretionary income must cover the instalment
    amberDiscretionaryCover: 1.5,
    alternativeHeadroom: 0.9                // alternatives sized at 90% of max capacity
  },

  // NCA Affordability Assessment Regulations — minimum monthly expense norms
  // by GROSS monthly income band. Values must be re-checked against the
  // latest gazetted table at each policy review.
  expenseNorms: [
    { fromCents: 0,          fixedCents: 0,       pctAbove: 1.00 },
    { fromCents: 80_001,     fixedCents: 80_000,  pctAbove: 0.0675 },
    { fromCents: 625_001,    fixedCents: 116_788, pctAbove: 0.09 },
    { fromCents: 2_500_001,  fixedCents: 285_538, pctAbove: 0.082 },
    { fromCents: 5_000_001,  fixedCents: 490_538, pctAbove: 0.0675 }
  ],

  knockouts: {
    maxWorstArrearsCycles12m: 2,            // 3+ cycles → decline
    maxEnquiries90d: 8                      // above → refer (velocity)
  },

  coolingOff: {
    electiveAboveCents: 1_500_000,          // R15,000
    hours: 48
  },

  pricing: {
    mdrPercent: 5,                          // provider-paid facilitation fee
    patientAnnualRate: 0,
    monthlyServiceFeeCents: 0,
    initiationFeeCents: 0
  },

  provider: {
    eligibleStatuses: ['ACTIVE', 'DEVELOPING'],
    tierAliases: { NEW: 'probation', PROBATION: 'probation', STANDARD: 'standard', TRUSTED: 'trusted', PREMIUM: 'premium' },
    tiers: {
      probation: { perPatientCapCents: 1_000_000, maxMonthlyVolume: 10,   holdbackPct: 10 },
      standard:  { perPatientCapCents: 2_500_000, maxMonthlyVolume: 30,   holdbackPct: 5 },
      trusted:   { perPatientCapCents: 4_500_000, maxMonthlyVolume: null, holdbackPct: 0 },
      premium:   { perPatientCapCents: 7_500_000, maxMonthlyVolume: null, holdbackPct: 0 }
    },
    // Until the book is large enough for percentages to mean anything,
    // concentration is capped in absolute rands.
    rampUp: {
      bookThresholdCents: 2_000_000_000,    // R20m outstanding
      providerCapCents: 100_000_000,        // R1m per provider
      procedureTypeCapCents: 400_000_000    // R4m per procedure type
    },
    maxProviderShare: 0.05,
    maxProcedureTypeShare: 0.20,
    performance: {
      minSample: 20,                        // arrangements in 90d before rates count
      missedSuspendRate: 0.08,
      missedWatchRate: 0.05,
      minFpdSample: 10,
      fpdSuspendRate: 0.05,                 // first instalment missed — collusion signal
      fpdWatchRate: 0.03,
      disputeWatchRate: 0.05,
      complaintsWatch30d: 3
    },
    tariff: {
      referMultiple: 1.30,
      declineMultiple: 1.50
    },
    payout: {
      provisionalPct: 80
    }
  },

  portfolio: {
    arrearsTightenRate: 0.04,               // 30+ arrears → tighter RTI ceiling
    arrearsHaltRate: 0.08,                  // → every new origination referred
    balanceSheetMaxShare: 0.40,             // → marketplace-only funding
    reserveFloorShareOfMonthlyFees: 0.15,
    gapTariffFlaggedMaxRate: 0.10
  },

  mrs: {
    championModelId: 'MRS-EXPERT-0.1.0',
    lgd: 0.70,                              // unsecured, until own recoveries data exists
    eadFactor: 0.75,                        // average exposure at the point of non-repayment
    pdReferAbove: 0.06,
    pdDeclineAbove: 0.12,
    elReferAboveRevenueShare: 0.80,
    elDeclineAboveRevenueShare: 1.00,
    providerPriorMissedRate: 0.03,
    providerCredibilityK: 30,
    grades: [
      { grade: 'A', maxPd: 0.015 },
      { grade: 'B', maxPd: 0.03 },
      { grade: 'C', maxPd: 0.06 },
      { grade: 'D', maxPd: 0.10 },
      { grade: 'E', maxPd: 0.15 },
      { grade: 'F', maxPd: 1 }
    ],
    // Outcome the MRS predicts. Fixed now so every decision logged from day
    // one is labelled consistently for model development.
    outcomeDefinition: '90+ days past due within 12 months of first instalment',
    performanceWindowMonths: 12
  },

  modelGovernance: {
    minBadsForInterceptRecalibration: 100,
    minMaturedForInterceptRecalibration: 1000,
    minBadsForChallengerTraining: 300,
    minMaturedForChallengerTraining: 3000,
    promotion: {
      minGini: 0.35,
      maxPsi: 0.10,
      minDevelopmentBads: 300
    }
  }
};

const POLICY = deepFreeze(JSON.parse(JSON.stringify(POLICY_DEFINITION)));

function mergeDeep(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...a };
  Object.keys(b).forEach((k) => {
    const v = b[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object'
      ? mergeDeep(a[k], v)
      : v;
  });
  return out;
}

/**
 * Derive a new frozen policy from POLICY. A version suffix is mandatory so a
 * changed policy can never masquerade as the base version.
 */
function derivePolicy(overrides, versionSuffix) {
  if (!versionSuffix) throw new Error('derivePolicy requires a version suffix');
  const merged = mergeDeep(JSON.parse(JSON.stringify(POLICY_DEFINITION)), overrides || {});
  merged.version = `${POLICY.version}+${versionSuffix}`;
  return deepFreeze(merged);
}

/** NCA minimum monthly expense norm for a gross monthly income (cents). */
function expenseNorm(grossMonthlyCents, policy = POLICY) {
  const gross = Math.max(0, Math.round(grossMonthlyCents || 0));
  let band = policy.expenseNorms[0];
  for (const b of policy.expenseNorms) {
    if (gross >= b.fromCents) band = b;
  }
  const lower = band.fromCents === 0 ? 0 : band.fromCents - 1;
  return band.fixedCents + Math.round((gross - lower) * band.pctAbove);
}

module.exports = { POLICY, derivePolicy, expenseNorm, deepFreeze };
