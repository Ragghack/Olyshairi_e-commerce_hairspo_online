// Centralized JWT configuration
const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production-12345',
  expiresIn: '24h'
};

module.exports = JWT_CONFIG;