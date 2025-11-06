const express = require('express');
const router = express.Router();
const { register, login, google, getProfile } = require('../controllers/authController');
const auth = require('../middleware/auth'); // ADD THIS LINE

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/google', google);
router.get('/profile', auth, getProfile); // PROTECTED ROUTE
// Add this to your existing auth routes
router.get('/', auth, async (req, res) => {
  try {
    // Return user profile without sensitive data
    res.json({
      success: true,
      user: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        role: req.user.role,
        memberSince: req.user.memberSince,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify authentication'
    });
  }
});
module.exports = router;