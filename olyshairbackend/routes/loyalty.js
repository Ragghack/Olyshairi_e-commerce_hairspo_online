const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Get user loyalty points
router.get('/', auth, async (req, res) => {
  try {
    
    res.json(loyaltyData);
  } catch (error) {
    console.error('Get loyalty points error:', error);
    res.status(500).json({ error: 'Failed to fetch loyalty points' });
  }
});

module.exports = router;