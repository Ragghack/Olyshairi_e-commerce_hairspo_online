const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// Get user notifications with pagination
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    let filter = { userId: req.user.id };
    if (unreadOnly === 'true') {
      filter.read = false;
    }

    const { notifications, pagination } = await notificationService.getUserNotifications(
      req.user.id,
      parseInt(limit),
      parseInt(page)
    );
    
    res.json({
      success: true,
      notifications,
      pagination
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch notifications' 
    });
  }
});

// Create notification (for testing/admin)
router.post('/', auth, async (req, res) => {
  try {
    const { title, message, type = 'system', data = {}, sendEmail = false } = req.body;
    
    const notification = await notificationService.createNotification(req.user.id, {
      title,
      message,
      type,
      data,
      sendEmail
    });
    
    res.status(201).json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create notification' 
    });
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark notification as read' 
    });
  }
});

// Mark all notifications as read
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    const result = await notificationService.markAllAsRead(req.user.id);
    
    res.json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark notifications as read' 
    });
  }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const notification = await notificationService.deleteNotification(req.params.id, req.user.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete notification' 
    });
  }
});

// Get unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user.id,
      read: false
    });
    
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get unread count' 
    });
  }
});

module.exports = router;