// routes/testAdmin.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

router.get('/test', adminAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Admin access granted!',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;