const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getProfile, updateProfile } = require('../controllers/customerController');

// Protected routes - require authentication
router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);

module.exports = router;