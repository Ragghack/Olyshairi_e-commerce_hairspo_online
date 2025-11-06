const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { secret } = require('../config/jwt');

const auth = async (req, res, next) => {
    try {
        let token = req.header('Authorization')?.replace('Bearer ', '');
        
        // Also check for token in x-auth-token header
        if (!token) {
            token = req.header('x-auth-token');
        }
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'No token provided' 
            });
        }

        console.log('🔐 Token verification attempt:', {
            tokenLength: token.length,
            tokenPrefix: token.substring(0, 20) + '...'
        });

        // Use the centralized secret
        const decoded = jwt.verify(token, secret);
        console.log('✅ Token decoded:', { id: decoded.id, email: decoded.email });
        
        const user = await User.findById(decoded.id).select('-passwordHash');
        if (!user) {
            return res.status(401).json({ 
                success: false,
                error: 'User not found' 
            });
        }

        req.user = user;
        console.log('✅ User authenticated:', user.email);
        next();
    } catch (error) {
        console.error('❌ Auth Middleware Error:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token format' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                error: 'Token expired' 
            });
        }
        
        res.status(401).json({ 
            success: false,
            error: 'Authentication failed' 
        });
    }
};

module.exports = auth;