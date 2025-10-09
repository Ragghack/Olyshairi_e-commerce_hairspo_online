const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');



// Get user bookings
router.get('/', auth, async (req, res) => {
  try {
    const { limit } = req.query;
    let bookings = mockBookings;

    if (limit) {
      bookings = mockBookings.slice(0, parseInt(limit));
    }
    
    res.json(bookings);
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

module.exports = router;