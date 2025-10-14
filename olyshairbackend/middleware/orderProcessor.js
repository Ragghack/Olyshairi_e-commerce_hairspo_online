// middleware/orderProcessor.js
const Order = require('../models/Order');
const Product = require('../models/Product');

/**
 * Advanced Order Processing Middleware
 * Fetches, processes orders and attaches processed data to request
 */
const orderProcessor = async (req, res, next) => {
  try {
    // Extract token from various sources
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
        message: 'Authentication required'
      });
    }

    // Verify token and decode user info
    const decoded = await verifyToken(token);
    req.user = decoded;

    // Process order-related data based on route
    await processOrderData(req, res);

    next();
  } catch (error) {
    console.error('❌ Order processor error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Please login again'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        message: 'Please login again'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Order processing failed',
      details: error.message
    });
  }
};

// Helper function to extract token from various sources
function extractToken(req) {
  return (
    req.headers.authorization?.replace('Bearer ', '') ||
    req.headers['x-access-token'] ||
    req.headers['x-auth-token'] ||
    req.query.token ||
    req.body.token
  );
}

// Helper function to verify JWT token
async function verifyToken(token) {
  const jwt = require('jsonwebtoken');
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });
}

// Main order processing logic
async function processOrderData(req, res) {
  const { method, originalUrl, query, params } = req;
  
  console.log(`🔄 [OrderProcessor] Processing: ${method} ${originalUrl}`);

  // Route-specific processing
  if (originalUrl.includes('/api/orders') && method === 'GET') {
    await handleOrderFetching(req, query, params);
  }
  
  // Add order statistics to all order-related requests
  if (originalUrl.includes('/orders')) {
    await attachOrderStats(req);
  }
}

// Handle order fetching with advanced processing
async function handleOrderFetching(req, query, params) {
  const { page = 1, limit = 10, status, sort = 'createdAt', order = 'desc' } = query;
  
  // Build filter
  const filter = { 
    user: req.user.id, 
    isDeleted: false 
  };
  
  // Status filter
  if (status && status !== 'all') {
    filter.status = status;
  }

  // Date range filter
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }

  // Build sort options
  const sortOptions = { [sort]: order === 'desc' ? -1 : 1 };

  // Execute queries in parallel for performance
  const [orders, total, statusCounts] = await Promise.all([
    // Fetch orders
    Order.find(filter)
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('items.product', 'name images sku price')
      .select('-__v')
      .lean(),
    
    // Get total count
    Order.countDocuments(filter),
    
    // Get status counts for statistics
    Order.aggregate([
      { $match: { user: req.user.id, isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
  ]);

  // Process and enrich order data
  const processedOrders = orders.map(order => ({
    ...order,
    items: order.items.map(item => ({
      ...item,
      total: item.price * item.quantity,
      product: item.product ? {
        ...item.product,
        image: item.product.images?.[0] || '/images/default-product.jpg'
      } : null
    })),
    statusInfo: getStatusInfo(order.status),
    canReorder: canOrderBeReordered(order),
    canCancel: canOrderBeCancelled(order)
  }));

  // Convert status counts to object
  const statusStats = {};
  statusCounts.forEach(stat => {
    statusStats[stat._id] = stat.count;
  });

  // Attach processed data to request
  req.orderData = {
    orders: processedOrders,
    pagination: {
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
      hasNext: parseInt(page) < Math.ceil(total / limit),
      hasPrev: parseInt(page) > 1,
      limit: parseInt(limit)
    },
    filters: {
      status: status || 'all',
      sort,
      order,
      startDate: query.startDate,
      endDate: query.endDate
    },
    statistics: {
      totalOrders: total,
      statusCounts: statusStats,
      ...await getOrderAnalytics(req.user.id)
    }
  };

  console.log(`✅ [OrderProcessor] Processed ${processedOrders.length} orders for user ${req.user.id}`);
}

// Attach order statistics
async function attachOrderStats(req) {
  req.orderStats = await getOrderAnalytics(req.user.id);
}

// Get comprehensive order analytics
async function getOrderAnalytics(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [recentOrders, totalSpent, favoriteProducts] = await Promise.all([
    Order.countDocuments({
      user: userId,
      isDeleted: false,
      createdAt: { $gte: thirtyDaysAgo }
    }),
    
    Order.aggregate([
      { $match: { user: userId, isDeleted: false, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    
    Order.aggregate([
      { $match: { user: userId, isDeleted: false } },
      { $unwind: '$items' },
      { $group: { 
        _id: '$items.product', 
        totalQuantity: { $sum: '$items.quantity' },
        name: { $first: '$items.name' }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ])
  ]);

  return {
    recentOrderCount: recentOrders,
    totalSpent: totalSpent[0]?.total || 0,
    favoriteProducts: favoriteProducts.map(p => ({
      productId: p._id,
      name: p.name,
      totalPurchased: p.totalQuantity
    }))
  };
}

// Helper functions
function getStatusInfo(status) {
  const statusMap = {
    'pending': { label: 'Pending', color: 'orange', description: 'Order is being processed' },
    'confirmed': { label: 'Confirmed', color: 'blue', description: 'Order has been confirmed' },
    'processing': { label: 'Processing', color: 'purple', description: 'Order is being prepared' },
    'shipped': { label: 'Shipped', color: 'teal', description: 'Order has been shipped' },
    'delivered': { label: 'Delivered', color: 'green', description: 'Order has been delivered' },
    'cancelled': { label: 'Cancelled', color: 'red', description: 'Order has been cancelled' }
  };
  return statusMap[status] || { label: status, color: 'gray', description: 'Unknown status' };
}

function canOrderBeReordered(order) {
  return order.status === 'delivered' && 
         !order.isDeleted && 
         new Date(order.createdAt) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Within 90 days
}

function canOrderBeCancelled(order) {
  const cancellableStatuses = ['pending', 'confirmed'];
  return cancellableStatuses.includes(order.status) && 
         !order.isDeleted;
}

module.exports = orderProcessor;