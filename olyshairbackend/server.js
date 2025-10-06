const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/olyshair';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));
// Debug middleware to log JWT issues
app.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    console.log('JWT Token present, length:', token.length);
    // Don't verify here, just log presence
  }
  next();
});
// Routes - Customer/Auth Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/config', require('./routes/config'));
app.use('/api/upload', require('./routes/uploads'));

// Routes - Admin Routes 
app.use('/api/admin/auth', require('./routes/adminAuth'));
app.use('/api/admin/products', require('./routes/products'));
app.use('/api/admin/orders', require('./routes/orders'));  
app.use('/api/admin/users', require('./routes/users'));
app.use('/api/admin/activities', require('./routes/activities'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
  console.log(`📍 MongoDB: ${MONGODB_URI}`);
  console.log(`📍 Test endpoint: http://localhost:${PORT}/api/test`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Admin Auth: http://localhost:${PORT}/api/admin/auth/register`);
  console.log(`📍 Admin Products: http://localhost:${PORT}/api/admin/products`);
  console.log(`📍 Admin Orders: http://localhost:${PORT}/api/admin/orders`);
  console.log(`📍 Admin Users: http://localhost:${PORT}/api/admin/users`);
});