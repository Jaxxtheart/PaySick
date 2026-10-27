/**
 * Unit Tests: WhatsApp delivery of Kehr plan links (v1.22.0)
 *
 * Written BEFORE the implementation (test-first, per CLAUDE.md).
 *
 * whatsapp.adapter.js sends the plan link as an approved WhatsApp template
 * (Meta Cloud API) when WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID
 * are set, and is a mock otherwise. The message names the provider and
 * carries the link; it carries no amount, no patient name and no health
 * information, because WhatsApp is a third party.
 *
 * Run: node --test tests/unit/kehr-whatsapp.test.js
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const whatsapp = require('../../backend/src/adapters/whatsapp.adapter');
const { createKehrFlow } = require('../../backend/src/services/kehr-preapproval-flow.service');

const ENV = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];
let saved;
beforeEach(() => { saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]])); ENV.forEach((k) => delete process.env[k]); });
afterEach(() => { ENV.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

describe('whatsapp.adapter', () => {
  test('without credentials it is a mock and sends nothing', async () => {
    let called = false;
    const r = await whatsapp.sendPlanLink({ to: '082 123 4567', token: 'abc.def', providerName: 'Sandton Ortho', fetchImpl: async () => { called = true; } });
    assert.equal(called, false);
    assert.equal(r.channel, 'whatsapp');
    assert.equal(r.status, 'mock_sent');
    assert.equal(whatsapp.isLive(), false);
  });

  test('refuses a number that is not a South African cellphone', async () => {
    await assert.rejects(whatsapp.sendPlanLink({ to: '12345', token: 'a.b', providerName: 'X' }), /cellphone/);
  });

  test('with credentials it sends the approved template to the Cloud API', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    let url; let init;
    const fetchImpl = async (u, i) => { url = u; init = i; return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.1' }] }) }; };
    const r = await whatsapp.sendPlanLink({ to: '0821234567', token: 'abc.def', providerName: 'Sandton Ortho', fetchImpl });
    assert.match(url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/1234567890\/messages$/);
    assert.equal(init.headers.Authorization, 'Bearer tok');
    const body = JSON.parse(init.body);
    assert.equal(body.messaging_product, 'whatsapp');
    assert.equal(body.to, '27821234567');
    assert.equal(body.type, 'template');
    assert.equal(body.template.name, whatsapp.TEMPLATE_NAME);
    assert.deepEqual(r, { channel: 'whatsapp', status: 'sent', messageId: 'wamid.1' });
  });

  test('the message names the provider and carries the link token, nothing else', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    let body;
    const fetchImpl = async (u, i) => { body = JSON.parse(i.body); return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'w' }] }) }; };
    await whatsapp.sendPlanLink({ to: '0821234567', token: 'abc.def', providerName: 'Sandton Ortho', fetchImpl });
    const texts = JSON.stringify(body.template.components);
    assert.match(texts, /Sandton Ortho/);
    assert.match(texts, /abc\.def/);
    assert.doesNotMatch(texts, /R\d|amount|cents/i);
  });

  test('an API error is reported as failed, not thrown', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    const r = await whatsapp.sendPlanLink({ to: '0821234567', token: 'a.b', providerName: 'X', fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'bad' }) });
    assert.equal(r.status, 'failed');
  });
});

describe('flow: provider sends a plan link by WhatsApp', () => {
  const NOW = new Date('2026-10-27T09:00:00Z');
  function setup(messenger) {
    const db = { links: [], audit: [] };
    const repo = {
      async insertPlanLink(row) { db.links.push(row); return row; },
      async audit(e) { db.audit.push(e); },
      async getProviderName() { return 'Sandton Ortho'; },
    };
    const sent = [];
    const flow = createKehrFlow({
      repo,
      adapters: { identity: {}, income: {}, scheme: {}, messenger: messenger || { sendPlanLink: async (args) => { sent.push(args); return { channel: 'whatsapp', status: 'sent', messageId: 'w1' }; } } },
      secret: 'x'.repeat(32),
      now: () => NOW,
    });
    return { flow, db, sent };
  }

  test('sends only when the provider confirms the patient agreed to WhatsApp', async () => {
    const { flow, sent } = setup();
    const r = await flow.createProviderPlanLink('prov-1', { patientPhone: '0821234567', amountCents: 100_000, deliver: 'whatsapp' });
    assert.equal(sent.length, 0);
    assert.equal(r.delivery.status, 'not_sent');
  });

  test('sends the token and the provider name, and reports delivery', async () => {
    const { flow, sent, db } = setup();
    const r = await flow.createProviderPlanLink('prov-1', { patientPhone: '0821234567', amountCents: 100_000, deliver: 'whatsapp', patientAgreedToWhatsApp: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].token, r.token);
    assert.equal(sent[0].providerName, 'Sandton Ortho');
    assert.ok(!('amountCents' in sent[0]));
    assert.deepEqual(r.delivery, { channel: 'whatsapp', status: 'sent' });
    const ev = db.audit.find((e) => e.eventType === 'KEHR_PLAN_LINK_SENT');
    assert.ok(ev);
    assert.doesNotMatch(JSON.stringify(ev), /821234567/);
  });

  test('a failed send still creates the link so the provider can share it', async () => {
    const { flow } = setup({ sendPlanLink: async () => ({ channel: 'whatsapp', status: 'failed' }) });
    const r = await flow.createProviderPlanLink('prov-1', { patientPhone: '0821234567', amountCents: 100_000, deliver: 'whatsapp', patientAgreedToWhatsApp: true });
    assert.ok(r.token && r.url);
    assert.equal(r.delivery.status, 'failed');
  });

  test('without deliver the link is created for copying only', async () => {
    const { flow, sent } = setup();
    const r = await flow.createProviderPlanLink('prov-1', { patientPhone: '0821234567', amountCents: 100_000 });
    assert.equal(sent.length, 0);
    assert.equal(r.delivery, undefined);
  });
});
