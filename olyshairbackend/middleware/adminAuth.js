const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { secret } = require('../config/jwt'); // Import from central config

const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Use the centralized secret
    const decoded = jwt.verify(token, secret);
    
    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin Auth Middleware Error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = adminAuth;