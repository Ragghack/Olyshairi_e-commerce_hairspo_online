const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Mock data for development


// Get user notifications
router.get('/', auth, async (req, res) => {
  try {
    const { limit } = req.query;
    let notifications = mockNotifications;
    
    if (limit) {
      notifications = mockNotifications.slice(0, parseInt(limit));
    }
    
    res.json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark all as read
router.post('/mark-all-read', auth, async (req, res) => {
  try {
    // In a real app, you would update the database
    mockNotifications.forEach(notification => {
      notification.unread = false;
    });
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

module.exports = router;