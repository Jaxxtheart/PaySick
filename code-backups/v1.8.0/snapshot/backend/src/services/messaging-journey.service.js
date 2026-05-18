'use strict';

/**
 * MESSAGING JOURNEY SERVICE
 *
 * Defines the complete customer communication lifecycle for PaySick —
 * from registration through to collections resolution.
 *
 * Covers all permutations across three channels: email, SMS, in_app.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS = {
  EMAIL:  'email',
  SMS:    'sms',
  IN_APP: 'in_app',
  PUSH:   'push'
};

const MESSAGE_TYPES = {
  // Registration & verification
  email_verification_reminder: 'email_verification_reminder',
  welcome:                     'welcome',
  // Onboarding
  onboarding_incomplete_24h:   'onboarding_incomplete_24h',
  onboarding_incomplete_72h:   'onboarding_incomplete_72h',
  onboarding_banking_missing:  'onboarding_banking_missing',
  // Application
  application_received:        'application_received',
  application_approved:        'application_approved',
  application_declined:        'application_declined',
  application_more_info:       'application_more_info',
  application_expired:         'application_expired',
  // Active payment plan
  plan_activated:              'plan_activated',
  payment_upcoming_7d:         'payment_upcoming_7d',
  payment_upcoming_3d:         'payment_upcoming_3d',
  payment_upcoming_1d:         'payment_upcoming_1d',
  payment_due_today:           'payment_due_today',
  payment_success:             'payment_success',
  payment_failed:              'payment_failed',
  payment_failed_retry:        'payment_failed_retry',
  // Outcome surveys
  survey_day_3:                'survey_day_3',
  survey_day_30:               'survey_day_30',
  survey_day_90:               'survey_day_90',
  // Pre-collections (1–7 days overdue)
  collections_day_1:           'collections_day_1',
  collections_day_3:           'collections_day_3',
  collections_day_7:           'collections_day_7',
  // Early collections (8–30 days)
  collections_early_8d:        'collections_early_8d',
  collections_early_14d:       'collections_early_14d',
  collections_early_21d:       'collections_early_21d',
  collections_early_30d:       'collections_early_30d',
  // Mid collections (31–60 days)
  collections_mid_31d:         'collections_mid_31d',
  collections_mid_45d:         'collections_mid_45d',
  collections_mid_60d:         'collections_mid_60d',
  // Late / legal (61–90+ days)
  collections_late_61d:        'collections_late_61d',
  collections_late_75d:        'collections_late_75d',
  collections_late_90d:        'collections_late_90d',
  // Resolution
  restructure_offer:           'restructure_offer',
  restructure_accepted:        'restructure_accepted',
  payment_arrangement_set:     'payment_arrangement_set',
  account_settled:             'account_settled',
  account_written_off:         'account_written_off',
  // Account management
  password_changed:            'password_changed',
  banking_details_updated:     'banking_details_updated',
  profile_updated:             'profile_updated',
  security_alert_new_device:   'security_alert_new_device',
  security_alert_failed_logins:'security_alert_failed_logins'
};

// ─── Journey Stages ──────────────────────────────────────────────────────────

const JOURNEY_STAGES = {
  registration: {
    label: 'Registration & Verification',
    messages: ['email_verification_reminder', 'welcome']
  },
  onboarding: {
    label: 'Onboarding',
    messages: ['onboarding_incomplete_24h', 'onboarding_incomplete_72h', 'onboarding_banking_missing']
  },
  application: {
    label: 'Application & Underwriting',
    messages: ['application_received', 'application_approved', 'application_declined', 'application_more_info', 'application_expired']
  },
  active_plan: {
    label: 'Active Payment Plan',
    messages: ['plan_activated', 'payment_upcoming_7d', 'payment_upcoming_3d', 'payment_upcoming_1d', 'payment_due_today', 'payment_success', 'payment_failed', 'payment_failed_retry']
  },
  outcome_survey: {
    label: 'Outcome Surveys',
    messages: ['survey_day_3', 'survey_day_30', 'survey_day_90']
  },
  pre_collections: {
    label: 'Pre-Collections (1–7 days overdue)',
    messages: ['collections_day_1', 'collections_day_3', 'collections_day_7']
  },
  collections_early: {
    label: 'Early Collections (8–30 days overdue)',
    messages: ['collections_early_8d', 'collections_early_14d', 'collections_early_21d', 'collections_early_30d']
  },
  collections_mid: {
    label: 'Mid Collections (31–60 days overdue)',
    messages: ['collections_mid_31d', 'collections_mid_45d', 'collections_mid_60d']
  },
  collections_late: {
    label: 'Late / Legal (61–90+ days overdue)',
    messages: ['collections_late_61d', 'collections_late_75d', 'collections_late_90d']
  },
  resolution: {
    label: 'Resolution & Account Closure',
    messages: ['restructure_offer', 'restructure_accepted', 'payment_arrangement_set', 'account_settled', 'account_written_off']
  }
};

// ─── Collections Ladder ───────────────────────────────────────────────────────

const COLLECTIONS_LADDER = [
  {
    days: 1, stage: 'pre_collections', messageType: 'collections_day_1',
    channels: ['sms'], tone: 'friendly reminder',
    action: 'auto_sms_reminder', requiresHuman: false
  },
  {
    days: 3, stage: 'pre_collections', messageType: 'collections_day_3',
    channels: ['sms', 'email'], tone: 'gentle reminder',
    action: 'gentle_followup', requiresHuman: false
  },
  {
    days: 7, stage: 'pre_collections', messageType: 'collections_day_7',
    channels: ['sms', 'email'], tone: 'direct reminder',
    action: 'direct_reminder', requiresHuman: false
  },
  {
    days: 8, stage: 'collections_early', messageType: 'collections_early_8d',
    channels: ['email'], tone: 'formal request',
    action: 'formal_payment_request', requiresHuman: false
  },
  {
    days: 14, stage: 'collections_early', messageType: 'collections_early_14d',
    channels: ['sms', 'email'], tone: 'escalation notice',
    action: 'escalation_notice', requiresHuman: false
  },
  {
    days: 21, stage: 'collections_early', messageType: 'collections_early_21d',
    channels: ['sms', 'email'], tone: 'restructure offer',
    action: 'restructure_offer', requiresHuman: true
  },
  {
    days: 30, stage: 'collections_early', messageType: 'collections_early_30d',
    channels: ['email'], tone: 'final friendly notice',
    action: 'final_friendly_notice', requiresHuman: true
  },
  {
    days: 31, stage: 'collections_mid', messageType: 'collections_mid_31d',
    channels: ['email'], tone: 'formal collections',
    action: 'formal_collections_notice', requiresHuman: true
  },
  {
    days: 45, stage: 'collections_mid', messageType: 'collections_mid_45d',
    channels: ['sms', 'email'], tone: 'second formal notice',
    action: 'second_formal_notice', requiresHuman: true
  },
  {
    days: 60, stage: 'collections_mid', messageType: 'collections_mid_60d',
    channels: ['email'], tone: 'final notice before legal',
    action: 'final_notice_before_legal', requiresHuman: true
  },
  {
    days: 61, stage: 'collections_late', messageType: 'collections_late_61d',
    channels: ['email'], tone: 'pre-legal notice',
    action: 'pre_legal_notice', requiresHuman: true
  },
  {
    days: 75, stage: 'collections_late', messageType: 'collections_late_75d',
    channels: ['email'], tone: 'legal referral warning',
    action: 'legal_referral_warning', requiresHuman: true
  },
  {
    days: 90, stage: 'collections_late', messageType: 'collections_late_90d',
    channels: ['email'], tone: 'legal action',
    action: 'legal_action_commenced', requiresHuman: true
  }
];

// ─── Template helpers ─────────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const BRAND   = 'PaySick';
const CONTACT = 'hello@paysick.co.za';

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

// ─── Email templates ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = {

  email_verification_reminder: (d) => ({
    subject: 'Reminder: Please verify your PaySick email address',
    body: `${h2('Verify your email address')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('You registered a PaySick account but haven\'t verified your email address yet. Your account will remain inactive until verification is complete.')}
${btn('Verify Email Now', `${APP_URL}/verify-email.html?token=${d.token || ''}`)}
${p('If you did not create a PaySick account, you can safely ignore this message.')}
${emailFooter()}`
  }),

  welcome: (d) => ({
    subject: `Welcome to PaySick, ${d.firstName || 'there'}!`,
    body: `${h2(`Welcome to ${BRAND}!`)}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your email has been verified and your PaySick account is now active. You can now apply for a healthcare payment plan at any of our partner providers.')}
${btn('Go to Dashboard', `${APP_URL}/dashboard.html`)}
${p('If you have any questions, contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  onboarding_incomplete_24h: (d) => ({
    subject: 'Complete your PaySick profile',
    body: `${h2('Your profile is almost ready')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('You\'re one step away from being able to use PaySick. Please complete your profile so we can process your payment plans.')}
${btn('Complete Profile', `${APP_URL}/onboarding.html`)}
${emailFooter()}`
  }),

  onboarding_incomplete_72h: (d) => ({
    subject: 'Don\'t forget — complete your PaySick profile',
    body: `${h2('Complete your profile to get started')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your PaySick profile is still incomplete. Without a completed profile, we\'re unable to process payment plan applications on your behalf.')}
${btn('Complete My Profile', `${APP_URL}/onboarding.html`)}
${p('Need help? Contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  onboarding_banking_missing: (d) => ({
    subject: 'Add your banking details to activate debit orders',
    body: `${h2('One last step: banking details')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your profile is complete, but we still need your banking details to set up your debit order. This allows us to collect your monthly payments automatically.')}
${btn('Add Banking Details', `${APP_URL}/dashboard.html`)}
${p('Your banking information is encrypted and stored securely in compliance with POPIA.')}
${emailFooter()}`
  }),

  application_received: (d) => ({
    subject: `Application received — Ref: ${d.applicationRef || 'N/A'}`,
    body: `${h2('We\'ve received your application')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment plan application (Ref: <strong>${d.applicationRef || 'N/A'}</strong>) has been received and is currently under review. You will be notified of the outcome within 24 hours.`)}
${btn('Track Application', `${APP_URL}/dashboard.html`)}
${emailFooter()}`
  }),

  application_approved: (d) => ({
    subject: 'Great news — your application has been approved!',
    body: `${h2('Application Approved')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your PaySick payment plan application has been approved. Your plan is now active and your first payment will be due on the schedule shown in your dashboard.')}
${btn('View My Plan', `${APP_URL}/dashboard.html`)}
${p('Need help? Contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  application_declined: (d) => ({
    subject: 'PaySick — Application outcome',
    body: `${h2('Application Outcome')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Unfortunately, we were unable to approve your payment plan application at this time.')}
${p(d.declineReason ? `Reason: ${d.declineReason}` : 'Please contact us for more information.')}
${p('You are welcome to re-apply in 30 days or contact us at ' + CONTACT + ' if you have questions.')}
${emailFooter()}`
  }),

  application_more_info: (d) => ({
    subject: 'Action required — additional information needed',
    body: `${h2('We need more information')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('We\'re unable to finalise your application without some additional information. Please log in to your dashboard to review and provide the required details.')}
${btn('Update Application', `${APP_URL}/dashboard.html`)}
${emailFooter()}`
  }),

  application_expired: (d) => ({
    subject: 'Your PaySick application has expired',
    body: `${h2('Application Expired')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your payment plan application has expired because it was not completed within the required timeframe.')}
${p('You are welcome to start a new application at any time.')}
${btn('Apply Again', `${APP_URL}/marketplace-apply.html`)}
${emailFooter()}`
  }),

  plan_activated: (d) => ({
    subject: 'Your PaySick payment plan is now active',
    body: `${h2('Payment Plan Activated')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment plan with <strong>${d.providerName || 'your provider'}</strong> is now active. Payments will be collected via debit order on your scheduled dates.`)}
${btn('View Payment Schedule', `${APP_URL}/payments.html`)}
${p('Need help? Contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  payment_upcoming_7d: (d) => ({
    subject: `Upcoming payment — ${d.amount || ''} due on ${d.dueDate || ''}`,
    body: `${h2('Payment Due in 7 Days')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`This is a reminder that your payment of <strong>${d.amount || 'your scheduled amount'}</strong> is due on <strong>${d.dueDate || 'your scheduled date'}</strong>.`)}
${p('Please ensure your bank account has sufficient funds to avoid any missed payment fees.')}
${btn('View Payment Details', `${APP_URL}/payments.html`)}
${emailFooter()}`
  }),

  payment_upcoming_3d: (d) => ({
    subject: `Reminder: Payment of ${d.amount || ''} due in 3 days`,
    body: `${h2('Payment Due in 3 Days')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment of <strong>${d.amount || 'your scheduled amount'}</strong> is due on <strong>${d.dueDate || 'your scheduled date'}</strong> — that\'s in 3 days.`)}
${p('Please ensure your account has sufficient funds.')}
${btn('View Payment', `${APP_URL}/payments.html`)}
${emailFooter()}`
  }),

  payment_upcoming_1d: (d) => ({
    subject: `Payment due tomorrow — ${d.amount || ''}`,
    body: `${h2('Payment Due Tomorrow')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment of <strong>${d.amount || 'your scheduled amount'}</strong> is due tomorrow on <strong>${d.dueDate || 'your scheduled date'}</strong>.`)}
${p('Please make sure your account has sufficient funds.')}
${btn('View Payment', `${APP_URL}/payments.html`)}
${emailFooter()}`
  }),

  payment_due_today: (d) => ({
    subject: `Payment due today — ${d.amount || ''}`,
    body: `${h2('Payment Due Today')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment of <strong>${d.amount || 'your scheduled amount'}</strong> is due today. We will attempt to collect it via debit order.`)}
${btn('View Payment Details', `${APP_URL}/payments.html`)}
${emailFooter()}`
  }),

  payment_success: (d) => ({
    subject: `Payment confirmed — ${d.amount || ''}`,
    body: `${h2('Payment Successful')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment of <strong>${d.amount || 'your scheduled amount'}</strong> has been successfully processed. Thank you!`)}
${btn('View Payment History', `${APP_URL}/payments.html`)}
${p('Questions? Contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  payment_failed: (d) => ({
    subject: 'Action required — payment unsuccessful',
    body: `${h2('Payment Unsuccessful')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment of <strong>${d.amount || 'your scheduled amount'}</strong> could not be processed. This may be due to insufficient funds or a banking issue.`)}
${p('We will retry the payment in 2 business days. Please ensure your account has sufficient funds, or make a manual payment to avoid any late fees.')}
${btn('Make a Payment', `${APP_URL}/make-payment.html`)}
${p('Need help? Contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  payment_failed_retry: (d) => ({
    subject: 'Payment retry unsuccessful — action required',
    body: `${h2('Payment Retry Failed')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`We attempted to collect your payment of <strong>${d.amount || 'your scheduled amount'}</strong> again, but it was unsuccessful.`)}
${p('To prevent your account from falling into arrears, please make a manual payment as soon as possible.')}
${btn('Pay Now', `${APP_URL}/make-payment.html`)}
${p('If you are experiencing financial difficulty, contact us at ' + CONTACT + ' to discuss your options.')}
${emailFooter()}`
  }),

  survey_day_3: (d) => ({
    subject: 'How was your experience? — quick 1-minute survey',
    body: `${h2('How was your experience?')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`We hope your procedure at <strong>${d.providerName || 'your provider'}</strong> went well. We\'d love to hear about your experience — it only takes a minute.`)}
${btn('Share Your Feedback', `${APP_URL}/survey.html?type=day_3&token=${d.surveyToken || ''}`)}
${p('Your feedback helps us improve care for all PaySick patients.')}
${emailFooter()}`
  }),

  survey_day_30: (d) => ({
    subject: 'One month on — how are you feeling?',
    body: `${h2('One-Month Check-In')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('It\'s been a month since your procedure. We\'d like to know how you\'re recovering and whether your payment plan is working for you.')}
${btn('Complete Survey', `${APP_URL}/survey.html?type=day_30&token=${d.surveyToken || ''}`)}
${p('This survey takes about 3 minutes. Your responses are confidential.')}
${emailFooter()}`
  }),

  survey_day_90: (d) => ({
    subject: '3-month follow-up — your PaySick experience',
    body: `${h2('3-Month Follow-Up')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Three months have passed since your procedure. We\'d love to know how you\'re doing and whether the PaySick payment plan met your needs.')}
${btn('Share Your Experience', `${APP_URL}/survey.html?type=day_90&token=${d.surveyToken || ''}`)}
${emailFooter()}`
  }),

  // ── Pre-collections (friendly, no legal threats) ──────────────────────────

  collections_day_1: (d) => ({
    subject: 'Missed payment — we\'re here to help',
    body: `${h2('We noticed a missed payment')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`It looks like your payment of <strong>${d.amount || 'your scheduled amount'}</strong> was not collected. This can happen — please don\'t worry.`)}
${p('If your account had insufficient funds, please top it up and make a manual payment at your earliest convenience.')}
${btn('Make a Payment', `${APP_URL}/make-payment.html`)}
${p('If you\'re experiencing difficulty, please contact us at ' + CONTACT + '. We\'re here to help.')}
${emailFooter()}`
  }),

  collections_day_3: (d) => ({
    subject: 'Payment still outstanding — please action',
    body: `${h2('Payment Still Outstanding')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your payment of <strong>${d.amount || 'your scheduled amount'}</strong> remains unpaid. To keep your account in good standing, please make a payment as soon as possible.`)}
${btn('Pay Now', `${APP_URL}/make-payment.html`)}
${p('If there is something preventing you from paying, please reach out to us at ' + CONTACT + '. We want to find a solution that works for you.')}
${emailFooter()}`
  }),

  collections_day_7: (d) => ({
    subject: 'Urgent: 7-day overdue payment',
    body: `${h2('Payment 7 Days Overdue')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account has an outstanding payment of <strong>${d.amount || 'your scheduled amount'}</strong> that is now 7 days overdue.`)}
${p('Please make a payment immediately to avoid further action on your account.')}
${btn('Pay Now', `${APP_URL}/make-payment.html`)}
${p('If you are facing financial hardship, contact us at ' + CONTACT + ' to discuss a payment arrangement before this escalates further.')}
${emailFooter()}`
  }),

  // ── Early collections (formal, no credit bureau threats yet) ─────────────

  collections_early_8d: (d) => ({
    subject: 'Formal payment request — account overdue',
    body: `${h2('Formal Payment Request')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account has an outstanding balance of <strong>${d.amount || 'your scheduled amount'}</strong> which is now 8 days overdue. We require payment or contact from you within 5 business days.`)}
${btn('Make Payment', `${APP_URL}/make-payment.html`)}
${p('To discuss a payment arrangement, contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  collections_early_14d: (d) => ({
    subject: 'Account escalation notice — 14 days overdue',
    body: `${h2('Account Escalation Notice')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account remains <strong>${d.daysOverdue || 14} days overdue</strong> with an outstanding balance of <strong>${d.amount || 'your scheduled amount'}</strong>.`)}
${p('We have attempted to contact you. If we do not hear from you within 5 business days, your account will be escalated to our collections team.')}
${btn('Contact Us', `${APP_URL}/contact.html`)}
${p('Alternatively, email us at ' + CONTACT + ' to arrange a payment plan.')}
${emailFooter()}`
  }),

  collections_early_21d: (d) => ({
    subject: 'Payment arrangement offer — let\'s work together',
    body: `${h2('We\'d like to help — payment arrangement available')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`We understand that circumstances change. Your account currently has an outstanding balance of <strong>${d.amount || 'your scheduled amount'}</strong> that is 21 days overdue.`)}
${p('We are offering a flexible payment arrangement or restructuring option to help you get back on track. Please contact us before this escalates further.')}
${btn('Discuss My Options', `${APP_URL}/contact.html`)}
${p('Email us at ' + CONTACT + ' or reply to this message to arrange a call.')}
${emailFooter()}`
  }),

  collections_early_30d: (d) => ({
    subject: 'Final notice before formal collections — please respond',
    body: `${h2('Final Notice Before Formal Collections')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is now <strong>30 days overdue</strong> with an outstanding balance of <strong>${d.amount || 'your scheduled amount'}</strong>.`)}
${p('This is our final notice before we refer your account to our formal collections process. To avoid this, please make payment or contact us immediately.')}
${btn('Pay Now', `${APP_URL}/make-payment.html`)}
${p('Contact: ' + CONTACT)}
${emailFooter()}`
  }),

  // ── Mid collections (formal collections, provider notified) ──────────────

  collections_mid_31d: (d) => ({
    subject: 'Account referred to collections — immediate action required',
    body: `${h2('Account Referred to Collections')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is now <strong>31 days overdue</strong> with an outstanding balance of <strong>${d.outstandingBalance || d.amount || 'your scheduled amount'}</strong>. Your account has been referred to our formal collections process.`)}
${p('Your healthcare provider has been notified of the overdue status. Immediate payment or contact is required.')}
${btn('Make Payment', `${APP_URL}/make-payment.html`)}
${p('To discuss your account, contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  collections_mid_45d: (d) => ({
    subject: 'Second collections notice — 45 days overdue',
    body: `${h2('Second Collections Notice')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is <strong>45 days overdue</strong>. Outstanding balance: <strong>${d.outstandingBalance || d.amount || 'your scheduled amount'}</strong>.`)}
${p('Despite previous notices, we have not received payment or a response from you. This matter is being handled by our collections team.')}
${btn('Resolve Now', `${APP_URL}/make-payment.html`)}
${p('Contact ' + CONTACT + ' immediately to avoid further escalation.')}
${emailFooter()}`
  }),

  collections_mid_60d: (d) => ({
    subject: 'Final notice — 60 days overdue. Legal process will follow.',
    body: `${h2('Final Notice — 60 Days Overdue')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is <strong>60 days overdue</strong>. Outstanding balance: <strong>${d.outstandingBalance || d.amount || 'your scheduled amount'}</strong>.`)}
${p('This is your final notice before your account is referred for legal proceedings. Please make full payment or contact us within 5 business days.')}
${btn('Pay Immediately', `${APP_URL}/make-payment.html`)}
${p('Contact ' + CONTACT + ' urgently.')}
${emailFooter()}`
  }),

  // ── Late / legal stage ────────────────────────────────────────────────────

  collections_late_61d: (d) => ({
    subject: 'Pre-legal notice — account 61 days overdue',
    body: `${h2('Pre-Legal Notice')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is now <strong>61 days overdue</strong>. Outstanding balance: <strong>${d.outstandingBalance || d.amount || 'your scheduled amount'}</strong>.`)}
${p('Your account is in the pre-legal stage. If we do not receive payment or a written response within 5 business days, we will refer this matter to our legal attorney for recovery proceedings.')}
${btn('Make Payment Now', `${APP_URL}/make-payment.html`)}
${p('This is a formal notice issued in compliance with applicable South African law. Contact ' + CONTACT + '.')}
${emailFooter()}`
  }),

  collections_late_75d: (d) => ({
    subject: 'Legal referral warning — 75 days overdue',
    body: `${h2('Legal Referral Warning')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is <strong>75 days overdue</strong>. Outstanding balance: <strong>${d.outstandingBalance || d.amount || 'your scheduled amount'}</strong>.`)}
${p('We are preparing to refer this matter to our legal attorney. To prevent legal action, you must make full payment or contact us within 48 hours.')}
${btn('Resolve Immediately', `${APP_URL}/make-payment.html`)}
${p('Legal notice: Failure to respond may result in attorney recovery proceedings and associated costs. Contact ' + CONTACT + '.')}
${emailFooter()}`
  }),

  collections_late_90d: (d) => ({
    subject: 'Legal action commenced — account 90 days overdue',
    body: `${h2('Legal Action Commenced')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`Your account is <strong>90 days overdue</strong>. Outstanding balance: <strong>${d.outstandingBalance || d.amount || 'your scheduled amount'}</strong>.`)}
${p('PaySick has referred this matter to our attorney for legal recovery proceedings. Additional legal costs and attorney fees may be added to your outstanding balance.')}
${p('To halt legal proceedings, you must contact our legal team immediately.')}
${btn('Contact Legal Team', `${APP_URL}/contact.html`)}
${p('This is a formal legal notice. Contact ' + CONTACT + ' to discuss resolution before further proceedings are initiated.')}
${emailFooter()}`
  }),

  // ── Resolution ────────────────────────────────────────────────────────────

  restructure_offer: (d) => ({
    subject: 'Payment restructuring option available for your account',
    body: `${h2('We have a restructuring option for you')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`We understand that medical expenses can be unpredictable. Your outstanding balance of <strong>${d.outstandingBalance || 'your outstanding amount'}</strong> is overdue, and we would like to help you get back on track.`)}
${p('We are able to offer you a flexible payment arrangement or restructuring option that may better suit your current financial situation. These options include extended payment terms, a payment holiday, or a partial settlement.')}
${btn('View My Options', `${APP_URL}/dashboard.html`)}
${p('Our goal is to support your recovery — not to add to your stress. Contact us at ' + CONTACT + ' to discuss the right option for you.')}
${emailFooter()}`
  }),

  restructure_accepted: (d) => ({
    subject: 'Payment restructuring confirmed',
    body: `${h2('Restructuring Arrangement Confirmed')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your payment restructuring arrangement has been accepted and your new plan is now active. Your updated payment schedule is available in your dashboard.')}
${btn('View Updated Plan', `${APP_URL}/dashboard.html`)}
${p('If you have any questions, contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  payment_arrangement_set: (d) => ({
    subject: 'Payment arrangement confirmed',
    body: `${h2('Payment Arrangement Confirmed')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your custom payment arrangement has been set up. Please ensure you adhere to the agreed schedule to avoid further escalation.')}
${btn('View Arrangement', `${APP_URL}/dashboard.html`)}
${emailFooter()}`
  }),

  account_settled: (d) => ({
    subject: 'Account fully settled — thank you!',
    body: `${h2('Account Fully Settled')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Congratulations — your PaySick account has been fully settled. Thank you for completing your payment plan.')}
${p('We hope the PaySick experience was a positive one and that your healthcare journey went well.')}
${btn('View Account', `${APP_URL}/dashboard.html`)}
${p('Thank you for choosing ' + BRAND + '. Contact us at ' + CONTACT + ' anytime.')}
${emailFooter()}`
  }),

  account_written_off: (d) => ({
    subject: 'Account status update',
    body: `${h2('Account Status Update')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your PaySick account has been written off. This means we have closed your outstanding balance in our records.')}
${p('Please note that written-off accounts may be reported to credit bureaus in accordance with applicable South African law and the National Credit Act.')}
${p('If you wish to discuss this matter, please contact us at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  // ── Account management ────────────────────────────────────────────────────

  password_changed: (d) => ({
    subject: 'Your PaySick password was changed',
    body: `${h2('Password Changed')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your PaySick account password was recently changed. If you made this change, no further action is required.')}
${p('If you did not change your password, please contact us immediately at ' + CONTACT + ' and reset your password.')}
${btn('Reset Password', `${APP_URL}/forgot-password.html`)}
${emailFooter()}`
  }),

  banking_details_updated: (d) => ({
    subject: 'Banking details updated on your PaySick account',
    body: `${h2('Banking Details Updated')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your banking details on your PaySick account have been updated. Your future debit orders will be collected from your new account.')}
${p('If you did not make this change, please contact us immediately at ' + CONTACT + '.')}
${emailFooter()}`
  }),

  profile_updated: (d) => ({
    subject: 'Your PaySick profile has been updated',
    body: `${h2('Profile Updated')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('Your PaySick profile has been updated. If you did not make these changes, please contact us at ' + CONTACT + '.')}
${btn('View Profile', `${APP_URL}/dashboard.html`)}
${emailFooter()}`
  }),

  security_alert_new_device: (d) => ({
    subject: 'New login detected on your PaySick account',
    body: `${h2('New Device Login Detected')}
${p(`Hi ${d.firstName || 'there'},`)}
${p(`We detected a login to your PaySick account from a new device or location${d.ipAddress ? ' (' + d.ipAddress + ')' : ''}.`)}
${p('If this was you, no action is needed. If you do not recognise this activity, please secure your account immediately.')}
${btn('Secure My Account', `${APP_URL}/forgot-password.html`)}
${p('Contact us at ' + CONTACT + ' if you need assistance.')}
${emailFooter()}`
  }),

  security_alert_failed_logins: (d) => ({
    subject: 'Multiple failed login attempts on your PaySick account',
    body: `${h2('Security Alert: Multiple Failed Logins')}
${p(`Hi ${d.firstName || 'there'},`)}
${p('We have detected multiple failed login attempts on your PaySick account. Your account has been temporarily locked for your protection.')}
${p('If this was you, please reset your password to unlock your account.')}
${btn('Reset Password', `${APP_URL}/forgot-password.html`)}
${p('If you believe someone is trying to access your account, contact us immediately at ' + CONTACT + '.')}
${emailFooter()}`
  })
};

// ─── SMS templates (≤ 320 chars, plain text) ──────────────────────────────────

const SMS_TEMPLATES = {
  collections_day_1: (d) => ({
    message: `PaySick: Hi ${d.firstName || 'there'}, we noticed your payment of ${d.amount || 'your instalment'} was not collected. Please make a manual payment at ${APP_URL}/make-payment.html or call us. We're here to help.`
  }),
  collections_day_3: (d) => ({
    message: `PaySick: Your payment of ${d.amount || 'your instalment'} is still outstanding. Please pay at ${APP_URL}/make-payment.html or contact us at ${CONTACT}. Let's sort this out together.`
  }),
  collections_day_7: (d) => ({
    message: `PaySick URGENT: Your payment of ${d.amount || 'your instalment'} is 7 days overdue. Please pay immediately at ${APP_URL}/make-payment.html or contact us at ${CONTACT} to avoid escalation.`
  }),
  collections_early_8d: (d) => ({
    message: `PaySick: Formal payment request. Your account is 8 days overdue (${d.amount || 'outstanding balance'}). Please pay or contact us within 5 business days. ${APP_URL}/make-payment.html | ${CONTACT}`
  }),
  collections_early_14d: (d) => ({
    message: `PaySick: Your account is now 14 days overdue. Outstanding: ${d.amount || 'your balance'}. Contact us urgently to avoid escalation to formal collections. ${CONTACT}`
  }),
  collections_early_21d: (d) => ({
    message: `PaySick: We want to help. Your account is 21 days overdue (${d.amount || 'outstanding'}). Payment arrangements available. Contact us at ${CONTACT} before this escalates.`
  }),
  payment_upcoming_1d: (d) => ({
    message: `PaySick: Reminder — your payment of ${d.amount || 'your instalment'} is due tomorrow (${d.dueDate || 'scheduled date'}). Ensure funds are available. View at ${APP_URL}/payments.html`
  }),
  payment_due_today: (d) => ({
    message: `PaySick: Your payment of ${d.amount || 'your instalment'} is due today. We will collect via debit order. Ensure your account has sufficient funds. ${APP_URL}/payments.html`
  }),
  payment_success: (d) => ({
    message: `PaySick: Payment confirmed! ${d.amount || 'Your payment'} has been successfully processed. Thank you. View your plan at ${APP_URL}/payments.html`
  }),
  payment_failed: (d) => ({
    message: `PaySick: Your payment of ${d.amount || 'your instalment'} could not be collected. Please make a manual payment at ${APP_URL}/make-payment.html or contact us at ${CONTACT}.`
  }),
  collections_mid_45d: (d) => ({
    message: `PaySick COLLECTIONS: Your account is 45 days overdue. Outstanding: ${d.outstandingBalance || d.amount || 'your balance'}. Immediate action required. Contact ${CONTACT} now.`
  }),
  survey_day_3: (d) => ({
    message: `PaySick: Hi ${d.firstName || 'there'}, how was your experience at ${d.providerName || 'your provider'}? Share your feedback in 60 seconds: ${APP_URL}/survey.html?type=day_3&token=${d.surveyToken || ''}`
  })
};

// ─── In-app notification templates ───────────────────────────────────────────

const IN_APP_TEMPLATES = {
  welcome: (d) => ({
    title: `Welcome to ${BRAND}!`,
    message: `Hi ${d.firstName || 'there'}, your account is active. You can now apply for a healthcare payment plan.`
  }),
  plan_activated: (d) => ({
    title: 'Payment Plan Active',
    message: `Your payment plan with ${d.providerName || 'your provider'} is now active. View your payment schedule.`
  }),
  payment_success: (d) => ({
    title: 'Payment Confirmed',
    message: `Your payment of ${d.amount || 'your instalment'} has been processed successfully.`
  }),
  payment_failed: (d) => ({
    title: 'Payment Failed',
    message: `Your payment of ${d.amount || 'your instalment'} could not be collected. Please make a manual payment.`
  }),
  application_approved: (d) => ({
    title: 'Application Approved!',
    message: 'Your PaySick application has been approved. Your payment plan is now active.'
  }),
  application_declined: (d) => ({
    title: 'Application Outcome',
    message: 'Your application could not be approved at this time. Please contact us for more information.'
  }),
  collections_day_1: (d) => ({
    title: 'Missed Payment',
    message: `Your payment of ${d.amount || 'your instalment'} was not collected. Please make a payment or contact us.`
  }),
  restructure_offer: (d) => ({
    title: 'Payment Arrangement Available',
    message: 'We have a flexible payment option available for your account. Tap to view your options.'
  }),
  account_settled: (d) => ({
    title: 'Account Settled',
    message: 'Your PaySick account is fully settled. Thank you for completing your payment plan!'
  })
};

// ─── MessagingJourneyService class ───────────────────────────────────────────

class MessagingJourneyService {
  /**
   * Get a message template for a given type and channel.
   * Returns null if the type is unknown.
   *
   * @param {string} type    - A MESSAGE_TYPES key
   * @param {string} channel - 'email' | 'sms' | 'in_app'
   * @param {object} data    - Template interpolation data
   * @returns {object|null}
   */
  getMessageTemplate(type, channel, data = {}) {
    if (!Object.prototype.hasOwnProperty.call(MESSAGE_TYPES, type)) {
      return null;
    }

    if (channel === 'email') {
      const fn = EMAIL_TEMPLATES[type];
      return fn ? fn(data) : null;
    }

    if (channel === 'sms') {
      const fn = SMS_TEMPLATES[type];
      return fn ? fn(data) : null;
    }

    if (channel === 'in_app') {
      const fn = IN_APP_TEMPLATES[type];
      return fn ? fn(data) : null;
    }

    return null;
  }

  /**
   * Get all trigger rules — when each message type fires, on which channels.
   * @returns {Array<{type, event, channels, description, delayHours?}>}
   */
  getTriggerRules() {
    return [
      // Registration
      { type: 'email_verification_reminder', event: 'registration_unverified_24h', channels: ['email'], description: 'Resend verification email 24h after registration if email not verified' },
      { type: 'welcome',                     event: 'email_verified',              channels: ['email', 'in_app'], description: 'Welcome message after email verification' },

      // Onboarding
      { type: 'onboarding_incomplete_24h',  event: 'onboarding_not_completed_24h', channels: ['email'], description: '24h nudge to complete profile' },
      { type: 'onboarding_incomplete_72h',  event: 'onboarding_not_completed_72h', channels: ['email'], description: '72h nudge to complete profile' },
      { type: 'onboarding_banking_missing', event: 'banking_details_absent',       channels: ['email'], description: 'Nudge to add banking details after profile completion' },

      // Application lifecycle
      { type: 'application_received',  event: 'application_submitted',  channels: ['email', 'in_app'], description: 'Confirm application received' },
      { type: 'application_approved',  event: 'application_approved',   channels: ['email', 'in_app', 'sms'], description: 'Notify of approval' },
      { type: 'application_declined',  event: 'application_declined',   channels: ['email', 'in_app'], description: 'Notify of decline with reason' },
      { type: 'application_more_info', event: 'application_info_needed',channels: ['email', 'in_app'], description: 'Request additional information' },
      { type: 'application_expired',   event: 'application_expired',    channels: ['email'], description: 'Notify that application has expired' },

      // Active plan — reminders
      { type: 'plan_activated',       event: 'plan_activated',          channels: ['email', 'in_app', 'sms'], description: 'Notify patient that plan is live' },
      { type: 'payment_upcoming_7d',  event: 'payment_due_in_7_days',   channels: ['email'], description: '7-day payment reminder' },
      { type: 'payment_upcoming_3d',  event: 'payment_due_in_3_days',   channels: ['email'], description: '3-day payment reminder' },
      { type: 'payment_upcoming_1d',  event: 'payment_due_in_1_day',    channels: ['email', 'sms'], description: '1-day payment reminder' },
      { type: 'payment_due_today',    event: 'payment_due_today',       channels: ['sms'], description: 'Same-day payment reminder' },
      { type: 'payment_success',      event: 'payment_collected',       channels: ['email', 'sms', 'in_app'], description: 'Payment success confirmation' },
      { type: 'payment_failed',       event: 'payment_collection_failed', channels: ['email', 'sms', 'in_app'], description: 'Payment failure alert' },
      { type: 'payment_failed_retry', event: 'payment_retry_failed',    channels: ['email', 'sms', 'in_app'], description: 'Payment retry failure alert' },

      // Outcome surveys
      { type: 'survey_day_3',  event: 'loan_disbursed_plus_3_days',  channels: ['sms', 'email'], description: 'Day-3 procedure experience survey' },
      { type: 'survey_day_30', event: 'loan_disbursed_plus_30_days', channels: ['email'], description: 'Day-30 satisfaction survey' },
      { type: 'survey_day_90', event: 'loan_disbursed_plus_90_days', channels: ['email'], description: 'Day-90 long-term follow-up survey' },

      // Pre-collections
      { type: 'collections_day_1', event: 'payment_1_day_overdue',  channels: ['sms'],           description: 'Friendly day-1 missed payment reminder' },
      { type: 'collections_day_3', event: 'payment_3_days_overdue', channels: ['sms', 'email'],  description: 'Gentle day-3 follow-up' },
      { type: 'collections_day_7', event: 'payment_7_days_overdue', channels: ['sms', 'email'],  description: 'Direct day-7 reminder before escalation' },

      // Early collections
      { type: 'collections_early_8d',  event: 'payment_8_days_overdue',  channels: ['email'],        description: 'Formal 8-day payment request' },
      { type: 'collections_early_14d', event: 'payment_14_days_overdue', channels: ['email', 'sms'], description: '14-day escalation notice' },
      { type: 'collections_early_21d', event: 'payment_21_days_overdue', channels: ['email', 'sms'], description: '21-day restructure offer' },
      { type: 'collections_early_30d', event: 'payment_30_days_overdue', channels: ['email'],        description: '30-day final friendly notice' },

      // Mid collections
      { type: 'collections_mid_31d', event: 'payment_31_days_overdue', channels: ['email'],        description: 'Formal collections referral notice' },
      { type: 'collections_mid_45d', event: 'payment_45_days_overdue', channels: ['email', 'sms'], description: 'Second formal collections notice' },
      { type: 'collections_mid_60d', event: 'payment_60_days_overdue', channels: ['email'],        description: 'Final notice before legal referral' },

      // Late / legal
      { type: 'collections_late_61d', event: 'payment_61_days_overdue', channels: ['email'], description: 'Pre-legal notice' },
      { type: 'collections_late_75d', event: 'payment_75_days_overdue', channels: ['email'], description: 'Legal referral warning' },
      { type: 'collections_late_90d', event: 'payment_90_days_overdue', channels: ['email'], description: 'Legal action commenced notice' },

      // Resolution
      { type: 'restructure_offer',       event: 'restructure_proposed',        channels: ['email', 'in_app'], description: 'Restructuring option offered to patient' },
      { type: 'restructure_accepted',    event: 'restructure_accepted',         channels: ['email', 'in_app'], description: 'Restructured plan confirmed' },
      { type: 'payment_arrangement_set', event: 'payment_arrangement_created',  channels: ['email', 'in_app'], description: 'Custom payment arrangement confirmed' },
      { type: 'account_settled',         event: 'account_fully_settled',        channels: ['email', 'in_app'], description: 'Account fully settled notification' },
      { type: 'account_written_off',     event: 'account_written_off',          channels: ['email'], description: 'Account written off notification' },

      // Account management
      { type: 'password_changed',            event: 'password_changed',            channels: ['email'], description: 'Password change confirmation' },
      { type: 'banking_details_updated',     event: 'banking_details_updated',     channels: ['email'], description: 'Banking details update confirmation' },
      { type: 'profile_updated',             event: 'profile_updated',             channels: ['email'], description: 'Profile update confirmation' },
      { type: 'security_alert_new_device',   event: 'login_new_device_detected',   channels: ['email'], description: 'New device login security alert' },
      { type: 'security_alert_failed_logins',event: 'multiple_failed_login_attempts', channels: ['email'], description: 'Multiple failed login attempts alert' }
    ];
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  MessagingJourneyService,
  JOURNEY_STAGES,
  COLLECTIONS_LADDER,
  MESSAGE_TYPES,
  CHANNELS
};
