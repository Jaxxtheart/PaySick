/**
 * Shared fixture for the Shield underwriting module tests.
 *
 * baselineInput() describes a clean, fully-verified Phase 1 self-pay
 * dentistry application that should be APPROVED. Each test overrides only
 * the field it is exercising.
 */

'use strict';

const NOW = new Date('2026-10-17T10:00:00.000Z');

function daysAgo(d) {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
}

function prodSource(name, ageDays = 1) {
  return { name, isMock: false, retrievedAt: daysAgo(ageDays) };
}

function mergeDeep(a, b) {
  if (b === null || b === undefined) return b;
  const out = { ...(a || {}) };
  Object.keys(b).forEach((k) => {
    const v = b[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? mergeDeep(a ? a[k] : undefined, v)
      : v;
  });
  return out;
}

function baselineInput(overrides = {}) {
  const base = {
    application: {
      applicationId: 'app-1',
      patientId: 'pat-1',
      providerId: 'prov-1',
      segment: 'SEGMENT_2_OOP',
      procedureCode: 'DENT-IMPL-01',
      procedureType: 'dental_implants',
      procedureCategory: 'DENTISTRY',
      urgency: 'ELECTIVE',
      amountCents: 1_200_000,       // R12,000
      termMonths: 12,
      bookingLeadDays: 21
    },
    income: {
      method: 'OPEN_BANKING',
      verifiedAt: daysAgo(2),
      months: [
        { grossCents: 4_000_000, netCents: 3_000_000 },
        { grossCents: 4_000_000, netCents: 3_000_000 },
        { grossCents: 4_000_000, netCents: 3_000_000 }
      ],
      observedDebitOrdersCents: 300_000,
      source: prodSource('open-banking')
    },
    declared: { obligationsCents: 400_000, expensesCents: 0 },
    bureau: {
      score: 690,
      thinFile: false,
      underDebtReview: false,
      sequestrationOrAdministration: false,
      judgmentsCount: 0,
      adverseListingsCount: 0,
      worstArrearsCycles12m: 0,
      enquiries90d: 1,
      revolvingUtilisation: 0.4,
      monthlyObligationsCents: 500_000,
      retrievedAt: daysAgo(1),
      source: prodSource('bureau')
    },
    identity: { saIdValid: true, homeAffairsVerified: true, deceased: false, source: prodSource('dha') },
    fraud: { safpsListed: false, source: prodSource('safps') },
    bankAccount: { avsVerified: true, holderMatch: true, source: prodSource('avs') },
    mandate: { debiCheckAuthorised: false },
    internalHistory: { completedArrangements: 0, instalmentsDue: 0, instalmentsOnTime: 0 },
    provider: {
      providerId: 'prov-1',
      status: 'ACTIVE',
      tier: 'standard',
      billingAgreementSigned: true,
      verification: {
        hpcsaVerified: true,
        practiceNumberVerified: true,
        bankAccountVerified: true,
        verifiedAt: daysAgo(30)
      },
      metrics: {
        arrangements90d: 40,
        missed90dRate: 0.02,
        fpdSample: 30,
        fpdRate: 0,
        disputeRate: 0.01,
        complaints30d: 0,
        costVarianceVsBenchmark: 0.05,
        monthlyVolumeCount: 10,
        outstandingCents: 20_000_000
      },
      source: prodSource('provider-snapshot')
    },
    portfolio: {
      totalOutstandingCents: 1_000_000_000,     // R10m — still in ramp-up
      activeArrangements: 900,
      procedureTypeOutstandingCents: 50_000_000,
      arrears30Rate: 0.02,
      balanceSheetShare: 0.2,
      reserveFundCents: 10_000_000,
      monthlyFeeIncomeCents: 20_000_000,
      gapTariffFlaggedRate: 0,
      source: prodSource('portfolio-metrics')
    },
    segment1: null
  };
  return mergeDeep(base, overrides);
}

module.exports = { NOW, daysAgo, prodSource, baselineInput, mergeDeep };
