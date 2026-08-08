'use strict';

/**
 * NOTIFICATION SERVICE
 *
 * Dispatches customer notifications across email, SMS, and in-app channels.
 * Persists all notifications to the `notifications` table for audit and inbox.
 *
 * Usage:
 *   const { notificationService } = require('./notification.service');
 *   await notificationService.send(userId, 'payment_success', 'email', { firstName, amount });
 */

const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { sendJourneyEmail } = require('./email.service');
const { MessagingJourneyService, CHANNELS } = require('./messaging-journey.service');

const journeyService = new MessagingJourneyService();

// ─── NotificationService class ────────────────────────────────────────────────

class NotificationService {
  /**
   * Send a single notification via one channel.
   *
   * @param {string} userId
   * @param {string} type          - MESSAGE_TYPES key
   * @param {string} channel       - 'email' | 'sms' | 'in_app'
   * @param {object} data          - Template interpolation data (must include `to` for email)
   * @param {object} [opts]        - Optional: relatedEntityType, relatedEntityId
   * @returns {Promise<object>}    - The persisted notification row
   */
  async send(userId, type, channel, data = {}, opts = {}) {
    const tpl = journeyService.getMessageTemplate(type, channel, data);

    if (!tpl) {
      throw new Error(`Unknown message type "${type}" for channel "${channel}"`);
    }

    const subject = tpl.subject || tpl.title || null;
    const message = tpl.body || tpl.message || '';

    // Persist notification record
    const notificationId = uuidv4();
    await query(
      `INSERT INTO notifications
         (notification_id, user_id, type, channel, subject, message,
          status, related_entity_type, related_entity_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,NOW())`,
      [
        notificationId, userId, type, channel,
        subject, message,
        opts.relatedEntityType || null,
        opts.relatedEntityId   || null
      ]
    );

    // Dispatch via channel
    let dispatchResult = null;

    try {
      if (channel === CHANNELS.EMAIL) {
        dispatchResult = await sendJourneyEmail({
          to:      data.to || data.email,
          subject: subject || '',
          html:    message
        });
      } else if (channel === CHANNELS.SMS) {
        dispatchResult = await this._sendSms(data.phone || data.cellNumber, message);
      }
      // in_app and push: stored in DB only — client polls or uses websocket

      await query(
        `UPDATE notifications
         SET status='sent', sent_at=NOW()
         WHERE notification_id=$1`,
        [notificationId]
      );
    } catch (err) {
      await query(
        `UPDATE notifications
         SET status='failed'
         WHERE notification_id=$1`,
        [notificationId]
      );
      console.error(`[Notification] Dispatch failed for ${type}/${channel}:`, err.message);
    }

    return { notificationId, type, channel, status: dispatchResult ? 'sent' : 'failed' };
  }

  /**
   * Send across all configured channels for a given message type.
   * Uses getTriggerRules to determine the correct channels.
   *
   * @param {string} userId
   * @param {string} type
   * @param {object} data
   * @param {object} [opts]
   */
  async sendAll(userId, type, data = {}, opts = {}) {
    const rules  = journeyService.getTriggerRules();
    const rule   = rules.find(r => r.type === type);
    const channels = rule ? rule.channels : ['email'];

    const results = await Promise.allSettled(
      channels.map(ch => this.send(userId, type, ch, data, opts))
    );

    return results.map((r, i) => ({
      channel: channels[i],
      status:  r.status,
      value:   r.value  || null,
      reason:  r.reason || null
    }));
  }

  /**
   * Enqueue a notification to be sent at a scheduled time.
   * Stores with status='scheduled' and a send_at timestamp.
   */
  async schedule(userId, type, channel, data, sendAt, opts = {}) {
    const tpl = journeyService.getMessageTemplate(type, channel, data);
    if (!tpl) throw new Error(`Unknown message type "${type}" for channel "${channel}"`);

    const notificationId = uuidv4();
    await query(
      `INSERT INTO notifications
         (notification_id, user_id, type, channel, subject, message,
          status, related_entity_type, related_entity_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9)`,
      [
        notificationId, userId, type, channel,
        tpl.subject || tpl.title || null,
        tpl.body    || tpl.message || '',
        opts.relatedEntityType || null,
        opts.relatedEntityId   || null,
        sendAt
      ]
    );

    return { notificationId, type, channel, scheduledFor: sendAt };
  }

  /**
   * Get notification inbox for a user (most recent first).
   */
  async getUserNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
    const conditions = ['user_id = $1', "channel = 'in_app'"];
    const params     = [userId];

    if (unreadOnly) {
      conditions.push('read_at IS NULL');
    }

    const result = await query(
      `SELECT notification_id, type, subject, message, status,
              sent_at, read_at, related_entity_type, related_entity_id, created_at
       FROM notifications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  /**
   * Get unread in-app notification count.
   */
  async getUnreadCount(userId) {
    const result = await query(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE user_id=$1 AND channel='in_app' AND read_at IS NULL AND status='sent'`,
      [userId]
    );
    return parseInt(result.rows[0]?.count || 0, 10);
  }

  /**
   * Mark a notification as read.
   */
  async markRead(notificationId, userId) {
    const result = await query(
      `UPDATE notifications
       SET read_at=NOW()
       WHERE notification_id=$1 AND user_id=$2 AND read_at IS NULL
       RETURNING notification_id`,
      [notificationId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Mark all in-app notifications as read for a user.
   */
  async markAllRead(userId) {
    const result = await query(
      `UPDATE notifications
       SET read_at=NOW()
       WHERE user_id=$1 AND channel='in_app' AND read_at IS NULL`,
      [userId]
    );
    return result.rowCount;
  }

  /**
   * Stub SMS dispatcher — wire up an actual provider (e.g. Vonage, Twilio, BulkSMS)
   * via SMS_PROVIDER env var.
   */
  async _sendSms(to, message) {
    if (!to) {
      console.warn('[SMS] No phone number provided — skipping SMS dispatch.');
      return null;
    }

    if (!process.env.SMS_API_KEY) {
      console.warn(`[SMS] SMS_API_KEY not configured. Would send to ${to}: "${message.substring(0, 60)}..."`);
      return { stub: true };
    }

    // Production: wire in your SMS provider SDK here
    // e.g. BulkSMS South Africa: https://www.bulksms.com/developer/
    throw new Error('SMS provider not yet configured. Set SMS_API_KEY and implement _sendSms().');
  }
}

const notificationService = new NotificationService();

module.exports = { NotificationService, notificationService };
