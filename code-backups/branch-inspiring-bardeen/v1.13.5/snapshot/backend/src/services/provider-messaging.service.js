'use strict';

/**
 * PROVIDER MESSAGING SERVICE
 *
 * Defines the complete provider communication lifecycle —
 * from application submission through active operations.
 *
 * Covers: application status, welcome/onboarding, first patient,
 * settlements, tier upgrades, monthly summaries, and trust score alerts.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_URL  = process.env.APP_URL || 'http://localhost:3000';
const BRAND    = 'PaySick';
const CONTACT  = 'providers@paysick.co.za';

// ─── Provider Message Types ──────────────────────────────────────────────────

const PROVIDER_MESSAGE_TYPES = {
  provider_application_received: 'provider_application_received',
  provider_application_approved: 'provider_application_approved',
  provider_application_declined: 'provider_application_declined',
  provider_welcome:              'provider_welcome',
  provider_first_patient:        'provider_first_patient',
  provider_settlement_ready:     'provider_settlement_ready',
  provider_settlement_paid:      'provider_settlement_paid',
  provider_tier_upgrade:         'provider_tier_upgrade',
  provider_monthly_summary:      'provider_monthly_summary',
  provider_trust_score_alert:    'provider_trust_score_alert'
};

// ─── Provider Journey Stages ─────────────────────────────────────────────────

const PROVIDER_JOURNEY_STAGES = {
  application: {
    label: 'Application & Review',
    messages: [
      'provider_application_received',
      'provider_application_approved',
      'provider_application_declined'
    ]
  },
  onboarding: {
    label: 'Onboarding & Welcome',
    messages: [
      'provider_welcome'
    ]
  },
  active: {
    label: 'Active Operations',
    messages: [
      'provider_first_patient',
      'provider_settlement_ready',
      'provider_settlement_paid'
    ]
  },
  performance: {
    label: 'Performance & Trust',
    messages: [
      'provider_tier_upgrade',
      'provider_monthly_summary',
      'provider_trust_score_alert'
    ]
  }
};

// ─── Template Helpers ────────────────────────────────────────────────────────

function emailFooter() {
  return `<hr style="border:none;border-top:1px solid #F0F0F0;margin:28px 0 16px;">
<p style="margin:0;color:#AAAAAA;font-size:12px;line-height:1.6;text-align:center;">
  ${BRAND} (Pty) Ltd &mdash; ${CONTACT}<br>
  This is an automated message. Please do not reply directly to this email.
</p>`;
}

function btn(label, url) {
  return `<div style="text-align:center;margin:28px 0;">
  <a href="${url}" style="display:inline-block;background:#FF4757;color:#ffffff;text-decoration:none;
     font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">${label}</a>
</div>`;
}

function p(text) {
  return `<p style="margin:0 0 16px;color:#4A4A4A;font-size:15px;line-height:1.6;">${text}</p>`;
}

function h2(text) {
  return `<h2 style="margin:0 0 16px;color:#1A1A1A;font-size:22px;font-weight:700;">${text}</h2>`;
}

// ─── Email Templates ─────────────────────────────────────────────────────────

const PROVIDER_EMAIL_TEMPLATES = {

  provider_application_received: (d) => ({
    subject: `Application received — Ref: ${d.applicationRef || 'N/A'}`,
    body: `${h2('We\'ve received your provider application')}
${p(`Dear ${d.providerName || 'Provider'},`)}
${p(`Your application to join the ${BRAND} network (Ref: <strong>${d.applicationRef || 'N/A'}</strong>) has been received and is under review.`)}
${p('Our partnerships team will review your application within 2 business days. You will be notified of the outcome via email.')}
${p('If you have any questions, contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  provider_application_approved: (d) => ({
    subject: `Approved — Welcome to the ${BRAND} network, ${d.providerName || 'Provider'}!`,
    body: `${h2('Application Approved')}
${p(`Dear ${d.contactName || d.providerName || 'Provider'},`)}
${p(`Great news — your application to join the ${BRAND} provider network has been <strong>approved</strong>.`)}
${p(`You have been assigned to the <strong>${d.tier || 'probation'}</strong> tier. As you build your track record with ${BRAND}, you can progress to higher tiers with faster payouts and higher patient caps.`)}
${btn('Go to Provider Dashboard', `${APP_URL}/provider-dashboard.html`)}
${p('Your next steps:')}
${p('1. Log in to your Provider Dashboard to review your account<br>2. Start referring patients for PaySick payment plans<br>3. Track your settlements and patient portfolio in real time')}
${p('Questions? Contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  provider_application_declined: (d) => ({
    subject: `${BRAND} — Provider application outcome`,
    body: `${h2('Application Outcome')}
${p(`Dear ${d.providerName || 'Provider'},`)}
${p('Unfortunately, we were unable to approve your application to join the PaySick provider network at this time.')}
${p(d.declineReason ? `Reason: ${d.declineReason}` : 'Please contact us for more information.')}
${p('You are welcome to re-apply in 90 days or contact us at ' + CONTACT + ' if you have questions.')}
${emailFooter()}`
  }),

  provider_welcome: (d) => ({
    subject: `Welcome to ${BRAND}, ${d.contactName || d.providerName || 'Partner'}!`,
    body: `${h2(`Welcome to the ${BRAND} Provider Network`)}
${p(`Dear ${d.contactName || d.providerName || 'Partner'},`)}
${p(`Your provider account is now fully set up. Here\'s what you can do from your Provider Dashboard:`)}
${p('<strong>Your Dashboard</strong><br>• View your patient portfolio and payment statuses<br>• Track settlements and revenue<br>• Monitor your trust tier and performance score<br>• Access monthly summaries')}
${btn('Open Provider Dashboard', `${APP_URL}/provider-dashboard.html`)}
${p('Need help? Contact our partnerships team at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  provider_first_patient: (d) => ({
    subject: `Congratulations — Your first ${BRAND} patient!`,
    body: `${h2('Your First Patient')}
${p(`Dear ${d.providerName || 'Partner'},`)}
${p(`Congratulations! You\'ve received your first patient through the ${BRAND} platform.`)}
${p(`Treatment amount: <strong>${d.billAmount || 'N/A'}</strong>`)}
${p('You can track this patient\'s payment plan and your upcoming settlement from your dashboard.')}
${btn('View in Dashboard', `${APP_URL}/provider-dashboard.html`)}
${emailFooter()}`
  }),

  provider_settlement_ready: (d) => ({
    subject: `Settlement ready — ${d.netAmount || 'Amount pending'}`,
    body: `${h2('Settlement Ready for Review')}
${p(`Dear ${d.providerName || 'Partner'},`)}
${p(`A settlement for the period <strong>${d.periodStart || ''}</strong> to <strong>${d.periodEnd || ''}</strong> is ready.`)}
${p(`Net amount (after 5% service fee): <strong>${d.netAmount || 'N/A'}</strong>`)}
${p('The settlement will be paid to your registered bank account within 2 business days.')}
${btn('View Settlement Details', `${APP_URL}/provider-dashboard.html`)}
${emailFooter()}`
  }),

  provider_settlement_paid: (d) => ({
    subject: `Settlement paid — ${d.netAmount || 'Amount confirmed'}`,
    body: `${h2('Settlement Paid')}
${p(`Dear ${d.providerName || 'Partner'},`)}
${p(`Your settlement of <strong>${d.netAmount || 'N/A'}</strong> has been paid to your registered bank account.`)}
${p(`Reference: <strong>${d.paymentReference || 'N/A'}</strong>`)}
${btn('View in Dashboard', `${APP_URL}/provider-dashboard.html`)}
${emailFooter()}`
  }),

  provider_tier_upgrade: (d) => ({
    subject: `Tier upgrade — You\'re now ${d.newTier || 'upgraded'}!`,
    body: `${h2('Trust Tier Upgrade')}
${p(`Dear ${d.providerName || 'Partner'},`)}
${p(`Based on your performance, you have been upgraded from <strong>${d.oldTier || 'previous tier'}</strong> to <strong>${d.newTier || 'new tier'}</strong>.`)}
${p('This means faster payouts, higher patient caps, and reduced holdback percentages.')}
${btn('View Tier Benefits', `${APP_URL}/provider-dashboard.html`)}
${emailFooter()}`
  }),

  provider_monthly_summary: (d) => ({
    subject: `Monthly summary — ${d.month || 'This month'}`,
    body: `${h2(`Monthly Summary: ${d.month || 'This Month'}`)}
${p(`Dear ${d.providerName || 'Partner'},`)}
${p(`Here\'s your ${BRAND} performance summary for <strong>${d.month || 'this month'}</strong>:`)}
${p(`<strong>Patients:</strong> ${d.totalPatients || 0}<br><strong>Revenue:</strong> ${d.totalRevenue || 'R 0.00'}<br><strong>On-time payment rate:</strong> ${d.onTimeRate || '0%'}<br><strong>Trust score:</strong> ${d.trustScore || 'N/A'}`)}
${btn('View Full Report', `${APP_URL}/provider-dashboard.html`)}
${emailFooter()}`
  }),

  provider_trust_score_alert: (d) => ({
    subject: `Trust score alert — Action required`,
    body: `${h2('Trust Score Alert')}
${p(`Dear ${d.providerName || 'Partner'},`)}
${p(`Your trust score has dropped to <strong>${d.trustScore || 'N/A'}</strong>. This may affect your tier status and payout terms.`)}
${p(`Concern: <strong>${d.concern || 'Performance metrics below threshold'}</strong>`)}
${p('Please review your patient outcomes and contact our partnerships team if you have questions.')}
${btn('View Dashboard', `${APP_URL}/provider-dashboard.html`)}
${p('Contact: ' + CONTACT)}
${emailFooter()}`
  })
};

// ─── SMS Templates ───────────────────────────────────────────────────────────

const PROVIDER_SMS_TEMPLATES = {

  provider_application_received: (d) =>
    `PaySick: Application ${d.applicationRef || ''} received. Review in 2 business days. Questions? ${CONTACT}`,

  provider_application_approved: (d) =>
    `PaySick: Your provider application has been approved! Log in to your dashboard: ${APP_URL}/provider-dashboard.html`,

  provider_application_declined: (d) =>
    `PaySick: Your provider application was not approved. Contact ${CONTACT} for details.`,

  provider_welcome: (d) =>
    `PaySick: Welcome ${d.providerName || ''}! Your provider account is active. Dashboard: ${APP_URL}/provider-dashboard.html`,

  provider_first_patient: (d) =>
    `PaySick: Your first patient is on a payment plan! Track it at ${APP_URL}/provider-dashboard.html`,

  provider_settlement_ready: (d) =>
    `PaySick: Settlement of ${d.netAmount || ''} ready. Payout in 2 days. Details: ${APP_URL}/provider-dashboard.html`,

  provider_settlement_paid: (d) =>
    `PaySick: Settlement of ${d.netAmount || ''} paid to your account. Ref: ${d.paymentReference || 'N/A'}`,

  provider_tier_upgrade: (d) =>
    `PaySick: Tier upgrade! ${d.oldTier || ''} -> ${d.newTier || ''}. Faster payouts unlocked. ${APP_URL}/provider-dashboard.html`,

  provider_monthly_summary: (d) =>
    `PaySick ${d.month || ''}: ${d.totalPatients || 0} patients, ${d.totalRevenue || 'R0'} revenue, score ${d.trustScore || 'N/A'}`,

  provider_trust_score_alert: (d) =>
    `PaySick: Trust score ${d.trustScore || 'N/A'}. ${d.concern || 'Review needed'}. Contact ${CONTACT}`
};

// ─── In-App Templates ────────────────────────────────────────────────────────

const PROVIDER_IN_APP_TEMPLATES = {

  provider_application_received: (d) => ({
    title: 'Application Received',
    message: `Your application (${d.applicationRef || 'N/A'}) is under review.`,
    action_url: '/provider-dashboard.html',
    icon: 'clipboard'
  }),

  provider_application_approved: (d) => ({
    title: 'Application Approved',
    message: `Welcome to the ${BRAND} network! You\'re on the ${d.tier || 'probation'} tier.`,
    action_url: '/provider-dashboard.html',
    icon: 'check-circle'
  }),

  provider_application_declined: (d) => ({
    title: 'Application Outcome',
    message: d.declineReason || 'Your application was not approved at this time.',
    action_url: null,
    icon: 'x-circle'
  }),

  provider_welcome: (d) => ({
    title: 'Welcome!',
    message: 'Your provider dashboard is ready. Start tracking patients and settlements.',
    action_url: '/provider-dashboard.html',
    icon: 'home'
  }),

  provider_first_patient: (d) => ({
    title: 'First Patient!',
    message: `Congratulations! Your first patient is on a payment plan.`,
    action_url: '/provider-dashboard.html',
    icon: 'user-plus'
  }),

  provider_settlement_ready: (d) => ({
    title: 'Settlement Ready',
    message: `Settlement of ${d.netAmount || 'N/A'} is ready for payout.`,
    action_url: '/provider-dashboard.html',
    icon: 'dollar-sign'
  }),

  provider_settlement_paid: (d) => ({
    title: 'Settlement Paid',
    message: `${d.netAmount || 'Amount'} paid to your account.`,
    action_url: '/provider-dashboard.html',
    icon: 'check'
  }),

  provider_tier_upgrade: (d) => ({
    title: 'Tier Upgrade',
    message: `You\'ve been upgraded to ${d.newTier || 'a higher tier'}!`,
    action_url: '/provider-dashboard.html',
    icon: 'trending-up'
  }),

  provider_monthly_summary: (d) => ({
    title: `${d.month || 'Monthly'} Summary`,
    message: `${d.totalPatients || 0} patients, ${d.totalRevenue || 'R0'} revenue this month.`,
    action_url: '/provider-dashboard.html',
    icon: 'bar-chart'
  }),

  provider_trust_score_alert: (d) => ({
    title: 'Trust Score Alert',
    message: `Score: ${d.trustScore || 'N/A'}. ${d.concern || 'Review your dashboard.'}`,
    action_url: '/provider-dashboard.html',
    icon: 'alert-triangle'
  })
};

// ─── Trigger Rules ───────────────────────────────────────────────────────────

const PROVIDER_TRIGGER_RULES = {
  provider_application_received:  { channels: ['email', 'sms'], auto: true },
  provider_application_approved:  { channels: ['email', 'sms', 'in_app'], auto: true },
  provider_application_declined:  { channels: ['email'], auto: true },
  provider_welcome:               { channels: ['email', 'in_app'], auto: true },
  provider_first_patient:         { channels: ['email', 'sms', 'in_app'], auto: true },
  provider_settlement_ready:      { channels: ['email', 'in_app'], auto: true },
  provider_settlement_paid:       { channels: ['email', 'sms', 'in_app'], auto: true },
  provider_tier_upgrade:          { channels: ['email', 'sms', 'in_app'], auto: true },
  provider_monthly_summary:       { channels: ['email', 'in_app'], auto: false },
  provider_trust_score_alert:     { channels: ['email', 'sms', 'in_app'], auto: true }
};

// ─── Service Class ───────────────────────────────────────────────────────────

class ProviderMessagingService {

  /**
   * Get the full template for a given message type and channel.
   */
  getTemplate(messageType, channel, data) {
    if (channel === 'email') {
      const fn = PROVIDER_EMAIL_TEMPLATES[messageType];
      return fn ? fn(data) : null;
    }
    if (channel === 'sms') {
      const fn = PROVIDER_SMS_TEMPLATES[messageType];
      return fn ? fn(data) : null;
    }
    if (channel === 'in_app') {
      const fn = PROVIDER_IN_APP_TEMPLATES[messageType];
      return fn ? fn(data) : null;
    }
    return null;
  }

  /**
   * Get trigger rules for a message type.
   */
  getTriggerRules(messageType) {
    return PROVIDER_TRIGGER_RULES[messageType] || null;
  }

  /**
   * Get all messages for a given journey stage.
   */
  getStageMessages(stageName) {
    const stage = PROVIDER_JOURNEY_STAGES[stageName];
    return stage ? stage.messages : [];
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  ProviderMessagingService,
  PROVIDER_MESSAGE_TYPES,
  PROVIDER_JOURNEY_STAGES,
  PROVIDER_EMAIL_TEMPLATES,
  PROVIDER_SMS_TEMPLATES,
  PROVIDER_IN_APP_TEMPLATES,
  PROVIDER_TRIGGER_RULES
};
