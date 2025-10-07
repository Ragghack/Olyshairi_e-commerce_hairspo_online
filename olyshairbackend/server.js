// ================================
// 🌐 OLYSHAIR Backend Server
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
app.use(
  cors({
    origin: ['http://localhost:5500'], // adjust if frontend is hosted elsewhere
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images and files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ================================
// 💾 MongoDB Connection
// ================================
const MONGODB_URI = process.env.MONGODB_URI;

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => console.error('❌ MongoDB connection error:', err.message));

// Optional — connection event logs
mongoose.connection.on('connected', () => console.log('📡 Mongoose connected'));
mongoose.connection.on('error', (err) =>
  console.error('❌ Mongoose error:', err)
);
mongoose.connection.on('disconnected', () =>
  console.warn('⚠️ Mongoose disconnected')
);

// ================================
// 🔐 Debug JWT Middleware (Optional)
// ================================
app.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) console.log('🔑 JWT Token detected (len):', token.length);
  next();
});

// ================================
// 🚦 API Routes
// ================================

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
// 🩺 Health Check & Test Endpoints
// ================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running smoothly ✅',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/test', (req, res) => {
  res.json({
    message: '🧪 Test route working fine!',
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
  });
});

// ================================
// ⚠️ Error Handling Middleware
// ================================
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ================================
// 🚫 404 Not Found Handler
// ================================
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// ================================
// 🚀 Server Listener
// ================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 API base: http://localhost:${PORT}/api`);
  console.log(`📍 MongoDB: ${MONGODB_URI}`);
  console.log(`📍 Test route: http://localhost:${PORT}/api/test`);
  console.log(`📍 Health: http://localhost:${PORT}/api/health`);
  console.log(`📍 Admin Auth: http://localhost:${PORT}/api/admin/auth/register`);
  console.log(`📍 Admin Products: http://localhost:${PORT}/api/admin/products`);
  console.log(`📍 Admin Orders: http://localhost:${PORT}/api/admin/orders`);
  console.log(`📍 Admin Users: http://localhost:${PORT}/api/admin/users`);
});
