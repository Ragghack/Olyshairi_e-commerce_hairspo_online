// ================================
// 🌟 OLYSHAIR Backend Server (Clean Version)
// ================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: './olyshair.env' });

const app = express();

// ================================
// 🧩 Middleware
// ================================
app.use(cors({
  origin: [
    'http://127.0.0.1:5500',
    'http://localhost:5500',
    'http://localhost:5001',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static uploads (images/files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ================================
// 💾 MongoDB Connection
// ================================
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://josymambo858_db_user:v3VSBGbeumlMZO9m@daviddbprogress.lgcze5s.mongodb.net/olyshair';

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
})();

// Connection events
mongoose.connection.on('connected', () => console.log('📡 Mongoose connected to database'));
mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ Mongoose disconnected from database'));

// ================================
// 🚦 API Routes
// ================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running smoothly ✅',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// --- Test Route ---
app.get('/api/test', (req, res) => {
  res.json({
    message: '🧪 Test route working fine!',
    database: mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌',
    timestamp: new Date().toISOString()
  });
});

// --- Public & Customer Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/config', require('./routes/config'));
app.use('/api/upload', require('./routes/uploads'));

// --- Admin Routes ---
app.use('/api/admin/auth', require('./routes/adminAuth'));
app.use('/api/admin/products', require('./routes/products'));
app.use('/api/admin/orders', require('./routes/orders'));
app.use('/api/admin/users', require('./routes/users'));
app.use('/api/admin/activities', require('./routes/activities'));

// ================================
// ⚠️ Error Handling Middleware
// ================================
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!'
  });
});

// ================================
// 🚫 404 Not Found Handler
// ================================
app.use('*', (req, res) => {
  console.log('❌ Route not found:', req.originalUrl);
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/test',
      'POST /api/auth/login',
      'GET /api/customer',
      'GET /api/admin/products',
      'GET /api/admin/orders',
      'GET /api/admin/users'
    ]
  });
});

// ================================
// 🧹 Graceful Shutdown
// ================================
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Server termination signal received...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed.');
  process.exit(0);
});

// ================================
// 🚀 Server Listener
// ================================
const PORT = process.env.PORT || 5001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 OLYSHAIR Server started successfully!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 API Base: http://localhost:${PORT}/api`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🧪 Test Route: http://localhost:${PORT}/api/test`);
  console.log(`💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}`);
  console.log(`=========================================\n`);
});

// Export app for testing
module.exports = app;
