const express = require('express');
const router = express.Router();
const { register, login, google, getProfile } = require('../controllers/authController');
const auth = require('../middleware/auth'); // ADD THIS LINE

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', google);
router.get('/profile', auth, getProfile); // PROTECTED ROUTE

module.exports = router;