// ================================
// 🌟 OLYSHAIR Backend Server (Enhanced Version)
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
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-auth-token']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Request logging
  console.log(`🌐 ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
  next();
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ================================
// 💾 MongoDB Connection
// ================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://josymambo858_db_user:v3VSBGbeumlMZO9m@daviddbprogress.lgcze5s.mongodb.net/olyshair';

// Enhanced MongoDB connection with retry logic
const connectWithRetry = async (retries = 5, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await mongoose.connect(MONGODB_URI, {
                serverSelectionTimeoutMS: 15000,
                socketTimeoutMS: 45000,
                maxPoolSize: 20,
                minPoolSize: 5,
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
        console.log('🔄 Attempting to reconnect to MongoDB...');
        connectWithRetry(3, 3000);
    }, 3000);
});

// ================================
// 📦 Import Models (Preload for better performance)
// ================================
console.log('📦 Preloading models...');
const models = {
    Product: require('./models/Product'),
    User: require('./models/User'),
    Order: require('./models/Order'),
    Cart: require('./models/Cart'),
    Wishlist: require('./models/Wishlist')
};
console.log('✅ Models loaded successfully');

// ================================
// 🚦 API Routes
// ================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
  const health = {
    status: 'OK',
    message: 'Server is running smoothly ✅',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.json(health);
});

// --- Test Route ---
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '🧪 Test route working fine!',
    database: mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// --- Public Products Endpoint ---
app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Fetching public products...');
    
    const { 
      category, 
      search, 
      page = 1, 
      limit = 12,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      featured 
    } = req.query;

    const filter = { isActive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    if (featured === 'true') {
      filter.isFeatured = true;
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await models.Product.find(filter)
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-__v');

    const total = await models.Product.countDocuments(filter);
    
    console.log(`✅ Found ${products.length} active products`);
    
    res.json({
      success: true,
      products,
      pagination: {
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('❌ Public products fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
});

// --- Public Categories Endpoint ---
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await models.Product.distinct('category', { isActive: true });
    
    // Get category counts
    const categoryCounts = await models.Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    const categoriesWithCounts = categories.map(category => {
      const countData = categoryCounts.find(c => c._id === category);
      return {
        name: category,
        count: countData ? countData.count : 0,
        slug: category.toLowerCase().replace(/\s+/g, '-')
      };
    });

    res.json({
      success: true,
      categories: categoriesWithCounts
    });
  } catch (error) {
    console.error('❌ Categories fetch error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch categories',
      details: error.message 
    });
  }
});

// --- Cloudinary Test Route ---
app.get('/api/test-cloudinary', async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({ 
        success: false, 
        error: 'Cloudinary not configured'
      });
    }

    const cloudinary = require('cloudinary').v2;
    
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
    console.error('❌ Cloudinary test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Cloudinary test failed',
      details: error.message 
    });
  }
});

// Safe route loader function with enhanced error handling
const loadRoute = (routePath, routeName, options = {}) => {
  try {
    console.log(`🔄 Loading route: ${routeName}`);
    
    // Check if route file exists
    if (!fs.existsSync(routePath + '.js') && !fs.existsSync(routePath)) {
      console.warn(`⚠️ Route file not found: ${routePath}`);
      throw new Error(`Route file not found: ${routePath}`);
    }
    
    const route = require(routePath);
    
    if (options.middleware) {
      return options.middleware(route);
    }
    
    console.log(`✅ Route loaded successfully: ${routeName}`);
    return route;
  } catch (error) {
    console.error(`❌ Failed to load route ${routeName}:`, error.message);
    
    // Return a basic router that shows the route is not implemented
    const router = express.Router();
    router.all('*', (req, res) => {
      res.status(501).json({
        success: false,
        error: 'Route not implemented',
        message: `${routeName} routes are not yet available`,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });
    return router;
  }
};

// ================================
// 🎯 ROUTE REGISTRATION
// ================================

console.log('🎯 Registering routes...');

// --- Public Routes ---
app.use('/api/auth', loadRoute('./routes/auth', 'Auth'));
app.use('/api/customer', loadRoute('./routes/customer', 'Customer'));
app.use('/api/config', loadRoute('./routes/config', 'Config'));
app.use('/api/upload', loadRoute('./routes/uploads', 'Uploads'));

// --- Customer Routes (with auth) ---
const auth = require('./middleware/auth');
app.use('/api/wishlist', auth, loadRoute('./routes/wishlist', 'Wishlist'));
app.use('/api/cart', auth, loadRoute('./routes/cart', 'Cart'));
app.use('/api/orders', auth, loadRoute('./routes/orders', 'Orders'));
app.use('/api/bookings', auth, loadRoute('./routes/bookings', 'Bookings'));
app.use('/api/notifications', auth, loadRoute('./routes/notifications', 'Notifications'));
app.use('/api/loyalty', auth, loadRoute('./routes/loyalty', 'Loyalty'));

// --- Product Routes ---
app.use('/api/products', loadRoute('./routes/products', 'Products'));

// --- Payment Routes ---
app.use('/api/payments/paypal', loadRoute('./routes/payments/paypal', 'PayPal'));
app.use('/api/payments/stripe', loadRoute('./routes/payments/stripe', 'Stripe'));
app.use('/api/payments/apple-pay', loadRoute('./routes/payments/apple-pay', 'Apple Pay'));

// --- Admin Routes ---
const adminAuth = require('./middleware/adminAuth');
app.use('/api/admin/auth', loadRoute('./routes/adminAuth', 'Admin Auth'));
app.use('/api/admin/products', adminAuth, loadRoute('./routes/products', 'Admin Products'));
app.use('/api/admin/orders', adminAuth, loadRoute('./routes/orders', 'Admin Orders'));
app.use('/api/admin/users', adminAuth, loadRoute('./routes/users', 'Admin Users'));
app.use('/api/admin/activities', adminAuth, loadRoute('./routes/activities', 'Admin Activities'));
app.use('/api/admin/dashboard', adminAuth, loadRoute('./routes/adminDashboard', 'Admin Dashboard'));

// ================================
// ⚠️ ERROR HANDLING MIDDLEWARE
// ================================

// Fallback payment route
app.use('/api/payments', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Payment method not specified',
    availableMethods: ['/stripe', '/paypal', '/apple-pay'],
    timestamp: new Date().toISOString()
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log('❌ API route not found:', req.originalUrl);
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/test',
      'GET /api/products',
      'GET /api/categories',
      'POST /api/auth/login',
      'GET /api/customer/profile',
      'GET /api/admin/products',
      'GET /api/admin/orders',
      'GET /api/admin/users'
    ],
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🚨 Server Error:', err.stack);
  
  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(error => error.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: errors,
      timestamp: new Date().toISOString()
    });
  }
  
  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: 'Duplicate Entry',
      message: `${field} already exists`,
      timestamp: new Date().toISOString()
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }
  
  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
});

// ================================
// 🧹 GRACEFUL SHUTDOWN
// ================================

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  
  try {
    // Close server
    server.close(() => {
      console.log('✅ HTTP server closed.');
    });
    
    // Close database connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed.');
    
    // Exit process
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Listen for shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ================================
// 🚀 SERVER LISTENER
// ================================
const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 OLYSHAIR Server started successfully!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
📱 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/api/health
🧪 Test Route: http://localhost:${PORT}/api/test
🛍️ Public Products: http://localhost:${PORT}/api/products
📊 Categories: http://localhost:${PORT}/api/categories
🖼️ Uploads: http://localhost:${PORT}/uploads
💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}
  
📋 Available Routes:
   👤 Customer: /api/cart, /api/wishlist, /api/orders, /api/bookings
   🔐 Auth: /api/auth
   🛍️ Products: /api/products
   💰 Payments: /api/payments
   👑 Admin: /api/admin
   
=========================================
  `);
});

// Export app for testing
module.exports = app;