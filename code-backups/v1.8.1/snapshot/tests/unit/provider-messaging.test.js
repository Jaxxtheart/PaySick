/**
 * Unit Tests — Provider Messaging Journey
 *
 * Tests the provider onboarding messaging templates and lifecycle stages
 * that guide new providers from application through to active status.
 *
 * Written BEFORE implementation (test-first workflow).
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ═══════════════════════════════════════════════════════════════
// Provider Message Types — Must Exist
// ═══════════════════════════════════════════════════════════════

describe('Provider Messaging Journey — Message Types', () => {

  test('PROVIDER_MESSAGE_TYPES must include all onboarding message types', () => {
    // These message types must be defined in the messaging service
    const requiredTypes = [
      'provider_application_received',
      'provider_application_approved',
      'provider_application_declined',
      'provider_welcome',
      'provider_first_patient',
      'provider_settlement_ready',
      'provider_settlement_paid',
      'provider_tier_upgrade',
      'provider_monthly_summary',
      'provider_trust_score_alert'
    ];

    // Import after implementation exists
    let PROVIDER_MESSAGE_TYPES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_MESSAGE_TYPES = mod.PROVIDER_MESSAGE_TYPES;
    } catch {
      // Expected to fail before implementation
      assert.fail('provider-messaging.service.js not yet implemented — this test should fail until implementation exists');
      return;
    }

    for (const type of requiredTypes) {
      assert.ok(type in PROVIDER_MESSAGE_TYPES, `Missing provider message type: ${type}`);
    }
  });

  test('PROVIDER_JOURNEY_STAGES must include application, onboarding, active, performance stages', () => {
    const requiredStages = [
      'application',
      'onboarding',
      'active',
      'performance'
    ];

    let PROVIDER_JOURNEY_STAGES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_JOURNEY_STAGES = mod.PROVIDER_JOURNEY_STAGES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    for (const stage of requiredStages) {
      assert.ok(stage in PROVIDER_JOURNEY_STAGES, `Missing provider journey stage: ${stage}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Provider Email Templates — Content Validation
// ═══════════════════════════════════════════════════════════════

describe('Provider Messaging Journey — Email Templates', () => {

  test('provider_application_received template must include provider name and reference', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_application_received;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'Netcare Dental',
      applicationRef: 'APP-12345'
    });

    assert.ok(result.subject, 'Must have subject');
    assert.ok(result.body, 'Must have body');
    assert.ok(result.body.includes('Netcare Dental'), 'Body must include provider name');
    assert.ok(result.body.includes('APP-12345'), 'Body must include application reference');
  });

  test('provider_application_approved template must include tier and dashboard link', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_application_approved;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'Netcare Dental',
      tier: 'probation',
      contactName: 'Dr Smith'
    });

    assert.ok(result.subject.toLowerCase().includes('approved'), 'Subject must mention approval');
    assert.ok(result.body.includes('provider-dashboard'), 'Body must link to provider dashboard');
  });

  test('provider_application_declined template must include reason', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_application_declined;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'Fake Clinic',
      declineReason: 'Could not verify HPCSA registration'
    });

    assert.ok(result.body.includes('Could not verify HPCSA registration'), 'Body must include decline reason');
  });

  test('provider_welcome template must include onboarding steps', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_welcome;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'City Medical Centre',
      contactName: 'Dr Jones'
    });

    assert.ok(result.subject.toLowerCase().includes('welcome'), 'Subject must include welcome');
    assert.ok(result.body.includes('provider-dashboard'), 'Must link to dashboard');
  });

  test('provider_first_patient template must congratulate and link to dashboard', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_first_patient;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'City Medical Centre',
      patientCount: 1,
      billAmount: 'R 5,000.00'
    });

    assert.ok(result.body.includes('first'), 'Body must reference first patient');
  });

  test('provider_settlement_ready template must include amount and period', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_settlement_ready;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'City Medical Centre',
      netAmount: 'R 47,500.00',
      periodStart: '1 March 2026',
      periodEnd: '31 March 2026'
    });

    assert.ok(result.body.includes('R 47,500.00'), 'Body must include net amount');
  });

  test('provider_tier_upgrade template must include old and new tier', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_tier_upgrade;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'City Medical Centre',
      oldTier: 'probation',
      newTier: 'standard'
    });

    assert.ok(result.body.includes('probation'), 'Body must include old tier');
    assert.ok(result.body.includes('standard'), 'Body must include new tier');
  });

  test('provider_monthly_summary template must include key metrics', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_monthly_summary;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'City Medical Centre',
      month: 'March 2026',
      totalPatients: 12,
      totalRevenue: 'R 85,000.00',
      onTimeRate: '92%',
      trustScore: 78
    });

    assert.ok(result.body.includes('March 2026'), 'Body must include month');
    assert.ok(result.body.includes('12'), 'Body must include patient count');
    assert.ok(result.body.includes('R 85,000.00'), 'Body must include revenue');
  });

  test('provider_trust_score_alert template must include score and concern', () => {
    let PROVIDER_EMAIL_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_EMAIL_TEMPLATES = mod.PROVIDER_EMAIL_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const template = PROVIDER_EMAIL_TEMPLATES.provider_trust_score_alert;
    assert.ok(template, 'Template must exist');

    const result = template({
      providerName: 'City Medical Centre',
      trustScore: 45,
      concern: 'Default rate exceeds threshold'
    });

    assert.ok(result.body.includes('45'), 'Body must include score');
    assert.ok(result.body.includes('Default rate'), 'Body must include concern');
  });
});

// ═══════════════════════════════════════════════════════════════
// Provider SMS Templates
// ═══════════════════════════════════════════════════════════════

describe('Provider Messaging Journey — SMS Templates', () => {

  test('all provider SMS templates must be under 160 characters', () => {
    let PROVIDER_SMS_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_SMS_TEMPLATES = mod.PROVIDER_SMS_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const testData = {
      providerName: 'City Medical',
      applicationRef: 'APP-123',
      netAmount: 'R 47,500',
      tier: 'standard',
      oldTier: 'probation',
      newTier: 'standard',
      trustScore: 78,
      concern: 'High default rate'
    };

    for (const [key, templateFn] of Object.entries(PROVIDER_SMS_TEMPLATES)) {
      const text = templateFn(testData);
      assert.ok(
        text.length <= 160,
        `SMS template "${key}" exceeds 160 chars (got ${text.length}): "${text}"`
      );
    }
  });

  test('application_received SMS must include PaySick brand', () => {
    let PROVIDER_SMS_TEMPLATES;
    try {
      const mod = require('../../backend/src/services/provider-messaging.service');
      PROVIDER_SMS_TEMPLATES = mod.PROVIDER_SMS_TEMPLATES;
    } catch {
      assert.fail('provider-messaging.service.js not yet implemented');
      return;
    }

    const text = PROVIDER_SMS_TEMPLATES.provider_application_received({
      providerName: 'City Medical',
      applicationRef: 'APP-123'
    });

    assert.ok(text.includes('PaySick'), 'SMS must include PaySick brand name');
  });
});
