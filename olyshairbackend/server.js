// ================================
// 🌟 OLYSHAIR Backend Server (Enhanced Version - FIXED)
// ================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './olyshair.env' });


const app = express();

// ================================
// 🧩 ENHANCED MIDDLEWARE
// ================================
app.use(cors({
  origin: [
'https://www.olyshair.com',
  'https://olyshair.com',
  'https://olyshairi-e-commerce-hairspo-online.vercel.app',
  'https://olyshairi-e-commerce-hairspo-online.onrender.com',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'x-auth-token',
    'Accept',
    'Origin',
    'Access-Control-Allow-Origin'
  ],
  exposedHeaders: ['x-auth-token']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enhanced security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Enhanced request logging
  console.log(`🌐 ${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
  console.log(`🔑 Auth: ${req.headers.authorization ? 'Present' : 'Missing'}`);
  console.log(`👤 Origin: ${req.headers.origin}`);
  
  next();
});

// Route debugging middleware
app.use('/api/admin/*', (req, res, next) => {
  console.log(`🔍 ADMIN ROUTE ACCESS: ${req.method} ${req.originalUrl}`);
  console.log(`🔐 Token Present: ${req.headers.authorization ? 'YES' : 'NO'}`);
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
// 💾 ENHANCED MONGODB CONNECTION
// ================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://Davidj_User:KNhA8m39kRZHzuZV@daviddbprogress.lgcze5s.mongodb.net/olyshair?retryWrites=true&w=majority';

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
                delay *= 1.5;
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
    setTimeout(() => {
        console.log('🔄 Attempting to reconnect to MongoDB...');
        connectWithRetry(3, 3000);
    }, 3000);
});

// ================================
// 📦 PRELOAD MODELS
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
// 🔐 AUTHENTICATION MIDDLEWARE LOADING
// ================================
console.log('🔐 Loading authentication middleware...');

// Load auth middleware AFTER models are loaded
let auth, adminAuth;
try {
    auth = require('./middleware/auth');
    console.log('✅ Customer auth middleware loaded');
} catch (error) {
    console.error('❌ Failed to load customer auth middleware:', error);
    // Create fallback auth middleware
    auth = (req, res, next) => {
        res.status(501).json({
            success: false,
            error: 'Authentication system unavailable',
            message: 'Auth middleware failed to load'
        });
    };
}

try {
    adminAuth = require('./middleware/adminAuth');
    console.log('✅ Admin auth middleware loaded');
} catch (error) {
    console.error('❌ Failed to load admin auth middleware:', error);
    // Create fallback admin auth middleware
    adminAuth = (req, res, next) => {
        res.status(501).json({
            success: false,
            error: 'Admin authentication unavailable',
            message: 'Admin auth middleware failed to load'
        });
    };
}

// ================================
// 🚦 ENHANCED API ROUTES
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

// --- Admin Health Check ---
app.get('/api/admin/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Admin routes are working',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    routes: {
      orders: '/api/admin/orders',
      products: '/api/admin/products',
      users: '/api/admin/users'
    }
  });
});

// --- Test Route ---
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: '🧪 Test route working fine!',
    database: mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// --- Debug Routes for Authentication Testing ---
app.post('/api/admin/debug/token-check', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'No token provided for checking'
    });
  }

  try {
    const decoded = jwt.decode(token);
    res.json({
      success: true,
      tokenInfo: {
        length: token.length,
        decoded: decoded,
        isExpired: decoded?.exp ? (Date.now() >= decoded.exp * 1000) : null,
        expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null
      }
    });
  } catch (error) {
    res.json({
      success: false,
      error: 'Token decoding failed',
      message: error.message
    });
  }
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

// ================================
// 🎯 ENHANCED ROUTE REGISTRATION
// ================================
// In server.js route registration section

// --- Newsletter Routes ---
try {
  console.log('🔄 Loading Newsletter route...');
  const newsletterRoute = require('./routes/newsletter');
  app.use('/api/newsletter', newsletterRoute);
  console.log('✅ Newsletter route registered successfully at /api/newsletter');
} catch (error) {
  console.error('❌ Failed to load newsletter route:', error);
  
  // Fallback newsletter route
  const newsletterFallback = express.Router();
  newsletterFallback.post('/subscribe', (req, res) => {
    res.status(501).json({
      success: false,
      error: 'Newsletter service temporarily unavailable',
      message: 'Please try again later'
    });
  });
  app.use('/api/newsletter', newsletterFallback);
  console.log('⚠️ Newsletter using fallback routes');
}
console.log('🎯 Registering enhanced routes...');

// Safe route loader with enhanced error handling
const loadRoute = (routePath, routeName, options = {}) => {
  try {
    console.log(`🔄 Loading route: ${routeName}`);
    
    // Check if route file exists
    if (!fs.existsSync(routePath + '.js') && !fs.existsSync(routePath)) {
      console.warn(`⚠️ Route file not found: ${routePath}`);
      
      // Return a mock router for missing routes
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
        error: 'Route loading failed',
        message: `${routeName} routes failed to load`,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });
    return router;
  }
};
// In server.js route registration section
app.use('/api/validation', loadRoute('./routes/validation', 'Validation'));
// --- Public Routes ---
app.use('/api/auth', loadRoute('./routes/auth', 'Auth'));
app.use('/api/customer', loadRoute('./routes/customer', 'Customer'));
app.use('/api/config', loadRoute('./routes/config', 'Config'));
app.use('/api/upload', loadRoute('./routes/uploads', 'Uploads'));

// --- Product Routes ---
app.use('/api/products', loadRoute('./routes/products', 'Products'));

// --- Payment Routes ---
app.use('/api/payments/paypal', loadRoute('./routes/payments/paypal', 'PayPal'));
app.use('/api/payments/stripe', loadRoute('./routes/payments/stripe', 'Stripe'));
app.use('/api/payments/apple-pay', loadRoute('./routes/payments/apple-pay', 'Apple Pay'));

// --- Customer Routes (with auth) ---
app.use('/api/wishlist', auth, loadRoute('./routes/wishlist', 'Wishlist'));
app.use('/api/cart', auth, loadRoute('./routes/cart', 'Cart'));
app.use('/api/bookings', auth, loadRoute('./routes/bookings', 'Bookings'));
app.use('/api/notifications', auth, loadRoute('./routes/notifications', 'Notifications'));
app.use('/api/loyalty', auth, loadRoute('./routes/loyalty', 'Loyalty'));

// --- ENHANCED ADMIN ROUTES REGISTRATION ---
console.log('👑 Registering enhanced ADMIN routes...');

// Admin Orders - ENHANCED: Better error handling and fallback
try {
  console.log('🔄 Loading Admin Orders route...');
  
  // Check if file exists first
  const fs = require('fs');
  const adminOrdersPath = './routes/adminOrders.js';
  
  if (fs.existsSync(adminOrdersPath)) {
    const adminOrdersRoute = require(adminOrdersPath);
    app.use('/api/admin/orders', adminAuth, adminOrdersRoute);
    console.log('✅ Admin Orders route registered successfully at /api/admin/orders');
  } else {
    throw new Error('Admin orders route file not found');
  }
} catch (error) {
  console.error('❌ Failed to load admin orders route:', error.message);
  
  // Create a working fallback route that won't crash
  const adminOrdersFallback = express.Router();
  
  adminOrdersFallback.get('/', adminAuth, async (req, res) => {
    try {
      // Return empty orders array as fallback
      res.json({
        success: true,
        orders: [],
        pagination: {
          totalPages: 0,
          currentPage: 1,
          total: 0,
          hasNext: false,
          hasPrev: false
        },
        message: 'Using fallback orders data - admin orders route not fully implemented'
      });
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        error: 'Fallback route also failed',
        message: fallbackError.message
      });
    }
  });
  
  // Add other essential routes
  adminOrdersFallback.get('/stats/overview', adminAuth, (req, res) => {
    res.json({
      success: true,
      stats: {
        totalOrders: 0,
        totalRevenue: 0,
        pendingOrders: 0,
        processingOrders: 0,
        shippedOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0
      }
    });
  });
  
  adminOrdersFallback.get('/test/admin-endpoint', adminAuth, (req, res) => {
    res.json({
      success: true,
      message: 'Admin Orders fallback endpoint is working!',
      timestamp: new Date().toISOString()
    });
  });
  
  app.use('/api/admin/orders', adminOrdersFallback);
  console.log('⚠️ Admin Orders using fallback routes');
}

// Admin Products
try {
  console.log('🔄 Loading Admin Products route...');
  const adminProductsRoute = require('./routes/products');
  app.use('/api/admin/products', adminAuth, adminProductsRoute);
  console.log('✅ Admin Products route registered successfully at /api/admin/products');
} catch (error) {
  console.error('❌ Failed to load admin products route:', error);
}

// Admin Users
try {
  console.log('🔄 Loading Admin Users route...');
  const adminUsersRoute = require('./routes/users');
  app.use('/api/admin/users', adminAuth, adminUsersRoute);
  console.log('✅ Admin Users route registered successfully at /api/admin/users');
} catch (error) {
  console.error('❌ Failed to load admin users route:', error);
}

// Other Admin Routes
app.use('/api/admin/auth', loadRoute('./routes/adminAuth', 'Admin Auth'));
app.use('/api/admin/activities', adminAuth, loadRoute('./routes/activities', 'Admin Activities'));
app.use('/api/admin/dashboard', adminAuth, loadRoute('./routes/adminDashboard', 'Admin Dashboard'));

// --- Customer Orders Route (Separate from Admin) ---
try {
  console.log('🔄 Loading Customer Orders route...');
  const customerOrdersRoute = require('./routes/orders');
  app.use('/api/orders', auth, customerOrdersRoute);
  console.log('✅ Customer Orders route registered successfully at /api/orders');
} catch (error) {
  console.error('❌ Failed to load customer orders route:', error);
}


// ================================
// 🔧 ENHANCED ADMIN ROUTE TESTING
// ================================

// Debug route for testing auth - MUST BE AFTER adminAuth is defined
app.get('/api/admin/debug/auth-test', adminAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication test successful!',
    user: req.user,
    headers: {
      authorization: req.headers.authorization,
      'x-auth-token': req.headers['x-auth-token'],
      origin: req.headers.origin
    },
    timestamp: new Date().toISOString()
  });
});

// Test all admin routes
app.get('/api/admin/test-all-routes', adminAuth, async (req, res) => {
  const routeTests = {
    orders: false,
    products: false,
    users: false,
    auth: false
  };

  try {
    // Test orders route
    const ordersCount = await models.Order.countDocuments();
    routeTests.orders = true;
    
    // Test products route  
    const productsCount = await models.Product.countDocuments();
    routeTests.products = true;
    
    // Test users route
    const usersCount = await models.User.countDocuments();
    routeTests.users = true;

    res.json({
      success: true,
      message: 'Admin route tests completed',
      routes: routeTests,
      counts: {
        orders: ordersCount,
        products: productsCount,
        users: usersCount
      },
      user: req.user
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Some admin route tests failed',
      routes: routeTests,
      error: error.message
    });
  }
});

// ================================
// ⚠️ ENHANCED ERROR HANDLING
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
      'GET /api/admin/health',
      'GET /api/test',
      'GET /api/products',
      'GET /api/categories',
      'POST /api/auth/login',
      'GET /api/admin/orders',
      'GET /api/admin/products',
      'GET /api/admin/users'
    ],
    timestamp: new Date().toISOString()
  });
});
// Add this to your server.js in the route section
app.get('/api/auth/debug/verify', async (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(400).json({
            success: false,
            error: 'No token provided for debugging'
        });
    }

    try {
        const decoded = jwt.decode(token);
        const isExpired = decoded?.exp ? (Date.now() >= decoded.exp * 1000) : null;
        
        res.json({
            success: true,
            tokenInfo: {
                length: token.length,
                decoded: decoded,
                isExpired: isExpired,
                expiresAt: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null,
                currentTime: new Date().toISOString()
            }
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'Token decoding failed',
            message: error.message
        });
    }
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

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation',
      message: 'Request blocked by CORS policy',
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
// Validation health check
app.get('/api/validation/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Validation routes are working',
    timestamp: new Date().toISOString(),
    endpoints: {
      batchValidation: 'POST /api/validation/products/validate/batch'
    }
  });
});

// ================================
// 🧹 ENHANCED GRACEFUL SHUTDOWN
// ================================

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  
  try {
    // Close server
    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed.');
      });
    }
    
    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed.');
    }
    
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
// 🚀 ENHANCED SERVER LISTENER
// ================================

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 OLYSHAIR ENHANCED Server started successfully!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
📱 API Base: http://localhost:${PORT}/api
🏥 Health Check: http://localhost:${PORT}/api/health
👑 Admin Health: http://localhost:${PORT}/api/admin/health
🧪 Test Route: http://localhost:${PORT}/api/test
🔧 Debug Routes:
   - POST /api/admin/debug/token-check (Check token format)
   - GET /api/admin/debug/auth-test (Test authentication)
🛍️ Public Products: http://localhost:${PORT}/api/products
📊 Categories: http://localhost:${PORT}/api/categories
🖼️ Uploads: http://localhost:${PORT}/uploads
💾 Database: ${mongoose.connection.readyState === 1 ? 'Connected ✅' : 'Disconnected ❌'}
  
📋 ENHANCED ROUTES:
   👤 Customer: /api/cart, /api/wishlist, /api/orders, /api/bookings
   🔐 Auth: /api/auth
   🛍️ Products: /api/products
   💰 Payments: /api/payments
   👑 Admin: /api/admin
      📦 Orders: /api/admin/orders
      🛍️ Products: /api/admin/products  
      👥 Users: /api/admin/users
      📊 Dashboard: /api/admin/dashboard

🔧 ENHANCED FEATURES:
   ✅ Improved CORS configuration
   ✅ Enhanced error handling
   ✅ Route debugging middleware
   ✅ Better admin route registration
   ✅ Health check endpoints
   ✅ Graceful shutdown handling
   ✅ Authentication debugging tools
   
=========================================
  `);
});

// Export app for testing
module.exports = app;
