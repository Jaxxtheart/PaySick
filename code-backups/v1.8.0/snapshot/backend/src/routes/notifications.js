'use strict';

/**
 * NOTIFICATIONS ROUTES — /api/notifications
 *
 * Provides the customer-facing notification inbox API:
 *   GET  /api/notifications            — list in-app notifications
 *   GET  /api/notifications/unread-count — badge count
 *   PUT  /api/notifications/:id/read   — mark one as read
 *   PUT  /api/notifications/read-all   — mark all as read
 */

const express = require('express');
const router  = express.Router();

const { authenticateToken } = require('../middleware/auth.middleware');
const { notificationService } = require('../services/notification.service');

// All routes require authentication
router.use(authenticateToken);

// ─── GET /api/notifications ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const userId     = req.user.user_id;
    const unreadOnly = req.query.unread === 'true';
    const limit      = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const notifications = await notificationService.getUserNotifications(userId, { limit, unreadOnly });

    res.json({ success: true, notifications });
  } catch (err) {
    console.error('[GET /notifications]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
});

// ─── GET /api/notifications/unread-count ─────────────────────────────────────

router.get('/unread-count', async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.user_id);
    res.json({ success: true, count });
  } catch (err) {
    console.error('[GET /notifications/unread-count]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count.' });
  }
});

// ─── PUT /api/notifications/read-all ─────────────────────────────────────────

router.put('/read-all', async (req, res) => {
  try {
    const updated = await notificationService.markAllRead(req.user.user_id);
    res.json({ success: true, updated });
  } catch (err) {
    console.error('[PUT /notifications/read-all]', err.message);
    res.status(500).json({ success: false, error: 'Failed to mark notifications as read.' });
  }
});

// ─── PUT /api/notifications/:id/read ─────────────────────────────────────────

router.put('/:id/read', async (req, res) => {
  try {
    const marked = await notificationService.markRead(req.params.id, req.user.user_id);
    if (!marked) {
      return res.status(404).json({ success: false, error: 'Notification not found or already read.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /notifications/:id/read]', err.message);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read.' });
  }
});

module.exports = router;
