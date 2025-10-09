const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Get user bookings
router.get('/', auth, async (req, res) => {
  try {
    // For now, return empty array until database integration
    const bookings = [];
    
    res.json(bookings);
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

module.exports = router;