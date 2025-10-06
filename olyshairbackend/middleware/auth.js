const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { secret } = require('../config/jwt'); // Import from central config

const auth = async (req, res, next) => {
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

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = auth;