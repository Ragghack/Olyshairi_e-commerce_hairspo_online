// ================================
// 🌟 OLYSHAIR Backend Server (Fixed Version)
// ================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

// Serve static uploads (images/files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ================================
// 💾 MongoDB Connection
// ================================
// ================================
// 💾 MongoDB Connection with Better Error Handling
// ================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://josymambo858_db_user:v3VSBGbeumlMZO9m@daviddbprogress.lgcze5s.mongodb.net/olyshair';

// Enhanced MongoDB connection with retry logic
const connectWithRetry = async (retries = 5, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(MONGODB_URI, {
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                maxPoolSize: 10,
                retryWrites: true,
                w: 'majority'
            });
            console.log('✅ MongoDB connected successfully');
            return;
        } catch (error) {
            console.error(`❌ MongoDB connection attempt ${i + 1} failed:`, error.message);
            
            if (i < retries - 1) {
                console.log(`🔄 Retrying connection in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 1.5; // Exponential backoff
            } else {
                console.error('💥 All MongoDB connection attempts failed');
                throw error;
            }
        }
    }
};

// Connect to MongoDB
connectWithRetry().catch(err => {
    console.error('💥 Failed to connect to MongoDB after all retries:', err);
    process.exit(1);
});

// Connection events
mongoose.connection.on('connected', () => {
    console.log('📡 Mongoose connected to database');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ Mongoose disconnected from database');
    // Attempt to reconnect
    setTimeout(() => {
        connectWithRetry(3, 3000);
    }, 3000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server gracefully...');
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed.');
    process.exit(0);
});

// Connection events
mongoose.connection.on('connected', () => console.log('📡 Mongoose connected to database'));
mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠️ Mongoose disconnected from database'));

// ================================
// 📦 Import Models
// ================================
const Product = require('./models/Product');

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

// --- Public Products Endpoint ---
app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Fetching public products...');
    
    const products = await Product.find({ isActive: true }).sort({ createdAt: -1 });
    
    console.log(`✅ Found ${products.length} active products`);
    
    res.status(200).json(products);
  } catch (error) {
    console.error('❌ Public products fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
});

// --- Cloudinary Test Route ---
app.get('/api/test-cloudinary', async (req, res) => {
  try {
    // Test upload of a small image
    const result = await cloudinary.uploader.upload(
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2RkZCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5Ij5UZXN0PC90ZXh0Pjwvc3ZnPg==',
      { folder: 'olyshair/test' }
    );
    
    res.json({ 
      success: true, 
      message: 'Cloudinary test successful!',
      imageUrl: result.secure_url 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Cloudinary test failed',
      details: error.message 
    });
  }
});

// --- Public Categories Endpoint ---
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await Product.distinct('category', { isActive: true });
    res.status(200).json(categories);
  } catch (error) {
    console.error('❌ Categories fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch categories',
      details: error.message 
    });
  }
});

// Safe route loader function
const loadRoute = (routePath, routeName) => {
  try {
    console.log(`🔄 Loading route: ${routeName}`);
    return require(routePath);
  } catch (error) {
    console.error(`❌ Failed to load route ${routeName}:`, error.message);
    
    // Return a basic router that shows the route is not implemented
    const router = express.Router();
    router.all('*', (req, res) => {
      res.status(501).json({
        error: 'Route not implemented',
        message: `${routeName} routes are not yet available`,
        path: req.originalUrl
      });
    });
    return router;
  }
};

// --- Public & Customer Routes ---
app.use('/api/auth', loadRoute('./routes/auth', 'Auth'));
app.use('/api/customer', loadRoute('./routes/customer', 'Customer'));
app.use('/api/config', loadRoute('./routes/config', 'Config'));
app.use('/api/upload', loadRoute('./routes/uploads', 'Uploads'));
app.use('/api/wishlist', loadRoute('./routes/wishlist', 'wishlist'));
app.use('/api/payments/paypal', loadRoute('./routes/payments/paypal', 'PayPal'));
app.use('/api/payments/stripe', loadRoute('./routes/payments/stripe', 'Stripe'));
app.use('/api/payments/apple-pay', loadRoute('./routes/payments/apple-pay', 'Apple Pay'));

// --- Admin Routes ---
app.use('/api/admin/auth', loadRoute('./routes/adminAuth', 'Admin Auth'));
app.use('/api/admin/products', loadRoute('./routes/products', 'Products'));
app.use('/api/admin/orders', loadRoute('./routes/orders', 'Orders'));
app.use('/api/admin/users', loadRoute('./routes/users', 'Users'));
app.use('/api/admin/activities', loadRoute('./routes/activities', 'Activities'));

// ================================
// ⚠️ Error Handling Middleware
// ================================
// Fallback payment route
app.use('/api/payments', (req, res) => {
  res.status(501).json({
    error: 'Payment method not specified',
    availableMethods: ['/stripe', '/paypal', '/apple-pay']
  });
});
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
      'GET /api/products',
      'GET /api/categories',
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
  console.log(`🛍️ Public Products: http://localhost:${PORT}/api/products`);
  console.log(`📊 Categories: http://localhost:${PORT}/api/categories`);
  console.log(`🖼️ Uploads: http://localhost:${PORT}/uploads`);
  console.log(`💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}`);
  console.log(`=========================================\n`);
});

// Export app for testing
module.exports = app;