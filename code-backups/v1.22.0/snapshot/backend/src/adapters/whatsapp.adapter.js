/**
 * WhatsApp Adapter: Kehr plan links (v1.22.0).
 *
 * Interface:
 *   sendPlanLink({ to, token, providerName, fetchImpl? })
 *     -> { channel: 'whatsapp', status: 'sent'|'mock_sent'|'failed', messageId? }
 *   isLive() -> true when the Cloud API credentials are configured
 *
 * Production: Meta WhatsApp Cloud API, approved template TEMPLATE_NAME:
 *   Body:   "{{1}} has sent your Kehr payment plan. Open the link to choose
 *            how many months suits you. It works only on this number."
 *   Button: URL, https://<site>/kehr-pass.html?link={{1}}
 * Configure WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID; without them
 * this is a mock and sends nothing.
 *
 * The message carries the provider's name and the signed link token only:
 * no amount, patient name or health information (WhatsApp is a third party).
 */

'use strict';

const crypto = require('crypto');
const { normalisePhone } = require('../services/plan-link.service');

const GRAPH_API_VERSION = 'v21.0';
const TEMPLATE_NAME = 'kehr_plan_link';
const TEMPLATE_LANGUAGE = 'en';

function isLive() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

async function sendPlanLink({ to, token, providerName, fetchImpl } = {}) {
  const phone = normalisePhone(to);
  if (!phone) throw new Error('sendPlanLink requires a South African cellphone number');
  if (!token) throw new Error('sendPlanLink requires the link token');

  if (!isLive()) {
    return { channel: 'whatsapp', status: 'mock_sent', messageId: `mock-wa-${crypto.randomBytes(6).toString('hex')}` };
  }

  const body = {
    messaging_product: 'whatsapp',
    to: phone.slice(1), // Cloud API takes digits without the "+"
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANGUAGE },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: String(providerName || 'Your provider').slice(0, 60) }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: token }] },
      ],
    },
  };

  const doFetch = fetchImpl || globalThis.fetch;
  try {
    const res = await doFetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`WhatsApp send failed (${res.status}): ${detail.slice(0, 200)}`);
      return { channel: 'whatsapp', status: 'failed' };
    }
    const data = await res.json();
    return { channel: 'whatsapp', status: 'sent', messageId: data.messages && data.messages[0] ? data.messages[0].id : null };
  } catch (error) {
    console.error('WhatsApp send error:', error.message);
    return { channel: 'whatsapp', status: 'failed' };
  }
}

module.exports = { TEMPLATE_NAME, GRAPH_API_VERSION, isLive, sendPlanLink };
