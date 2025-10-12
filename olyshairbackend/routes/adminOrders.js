// routes/adminOrders.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const auth =  require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const jwt = require('jsonwebtoke');
// ===== Debug Info =====
console.log('🔍 [AdminOrdersRoute] Route loaded successfully');

// ===============================
// 📋 GET ALL ORDERS (Admin Only) - REAL ORDERS
// ===============================
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    console.log('📦 Fetching REAL admin orders with filters:', {
      page, limit, status, search, startDate, endDate, sortBy, sortOrder
    });

    // Build filter for real orders
    const filter = { isDeleted: false };

    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Search filter (order number, customer name, email)
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.email': { $regex: search, $options: 'i' } },
        { guestEmail: { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // Sort configuration
    const sort = {};
    const validSortFields = ['createdAt', 'updatedAt', 'totalAmount', 'orderNumber'];
    if (validSortFields.includes(sortBy)) {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1; // Default sort
    }

    const options = {
      sort,
      limit: parseInt(limit) > 100 ? 100 : parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    // Fetch REAL orders from database
    const orders = await Order.find(filter)
      .populate('user', 'firstName lastName email')
      .sort(options.sort)
      .limit(options.limit)
      .skip(options.skip)
      .select('-__v')
      .lean();

    const total = await Order.countDocuments(filter);

    console.log(`✅ Found ${orders.length} REAL orders out of ${total} total`);

    // Format orders for frontend with REAL data
    const formattedOrders = orders.map(order => {
      // Determine customer name and email from real data
      let customerName = 'Guest Customer';
      let customerEmail = order.guestEmail || 'No email';

      if (order.user) {
        customerName = `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim();
        customerEmail = order.user.email;
      } else if (order.shippingAddress) {
        customerName = `${order.shippingAddress.firstName || ''} ${order.shippingAddress.lastName || ''}`.trim();
        customerEmail = order.shippingAddress.email || customerEmail;
      }

      // Calculate real item count
      const itemCount = order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerName: customerName || 'Unknown Customer',
        customerEmail: customerEmail,
        status: order.status || 'pending',
        paymentStatus: order.paymentStatus || 'pending',
        totalAmount: order.totalAmount || 0,
        itemCount: itemCount,
        orderDate: order.createdAt,
        shippingMethod: order.shippingMethod,
        trackingNumber: order.trackingNumber,
        estimatedDelivery: order.estimatedDelivery,
        paymentMethod: order.paymentMethod,
        // Include real address information
        shippingAddress: order.shippingAddress
      };
    });

    return res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        totalPages: Math.ceil(total / options.limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / options.limit),
        hasPrev: parseInt(page) > 1
      },
      filters: {
        status,
        search,
        startDate,
        endDate
      }
    });

  } catch (error) {
    console.error('❌ Get REAL admin orders error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      details: error.message
    });
  }
});

// ===============================
// 🔍 GET SINGLE ORDER DETAILS - REAL DATA
// ===============================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 Fetching REAL order details:', id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format'
      });
    }

    // Fetch REAL order with all details
    const order = await Order.findById(id)
      .populate('user', 'firstName lastName email phone')
      .select('-__v')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    console.log('✅ REAL Order found:', order.orderNumber);

    // Format the real order data for frontend
    const formattedOrder = {
      ...order,
      customerInfo: order.user ? {
        name: `${order.user.firstName} ${order.user.lastName}`,
        email: order.user.email,
        phone: order.user.phone
      } : {
        name: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
        email: order.guestEmail || order.shippingAddress.email,
        phone: order.shippingAddress.phone
      }
    };

    return res.json({
      success: true,
      order: formattedOrder
    });

  } catch (error) {
    console.error('❌ Get REAL order details error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch order details',
      details: error.message
    });
  }
});

// ===============================
// ✏️ UPDATE ORDER STATUS - REAL UPDATE
// ===============================
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, trackingNumber, carrier } = req.body;

    console.log('✏️ Updating REAL order status:', { id, status });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order ID format'
      });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order status'
      });
    }

    // Find the real order first
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Update order with real data
    order.status = status;
    
    // Add tracking info when shipping
    if (status === 'shipped') {
      order.shippedAt = new Date();
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (carrier) order.carrier = carrier;
    }

    // Add delivery info when delivered
    if (status === 'delivered') {
      order.actualDelivery = new Date();
    }

    // Add cancellation info
    if (status === 'cancelled') {
      order.cancelledAt = new Date();
      order.cancelledBy = req.user.id;
      order.paymentStatus = 'cancelled';
    }

    // Add notes if provided
    if (notes) {
      order.notes = order.notes ? `${order.notes}\n${new Date().toISOString()}: ${notes}` : `${new Date().toISOString()}: ${notes}`;
    }

    // Save the real updated order
    await order.save();

    console.log(`✅ REAL Order status updated: ${order.orderNumber} -> ${status}`);

    return res.json({
      success: true,
      message: 'Order status updated successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        trackingNumber: order.trackingNumber,
        carrier: order.carrier,
        estimatedDelivery: order.estimatedDelivery,
        actualDelivery: order.actualDelivery
      }
    });

  } catch (error) {
    console.error('❌ Update REAL order status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update order status',
      details: error.message
    });
  }
});

// ===============================
// 📊 GET REAL ORDER STATISTICS
// ===============================
router.get('/stats/overview', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    console.log('📊 Fetching REAL order statistics for last', days, 'days');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get real statistics from database
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          confirmedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get real daily sales data
    const dailySales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isDeleted: false,
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          dailyRevenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get real recent orders for dashboard
    const recentOrders = await Order.find({
      isDeleted: false,
      createdAt: { $gte: startDate }
    })
    .populate('user', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber status totalAmount createdAt shippingAddress guestEmail user')
    .lean();

    const result = stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0
    };

    result.dailySales = dailySales;
    result.recentOrders = recentOrders;

    return res.json({
      success: true,
      statistics: result,
      period: {
        days: parseInt(days),
        startDate,
        endDate: new Date()
      }
    });

  } catch (error) {
    console.error('❌ Get REAL order statistics error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch order statistics',
      details: error.message
    });
  }
});

// ===============================
// 📈 GET REAL SALES ANALYTICS
// ===============================
router.get('/analytics/sales', async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    console.log('📈 Fetching REAL sales analytics for period:', period);

    let startDate = new Date();
    let groupFormat = '%Y-%m-%d';

    switch (period) {
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '12months':
        startDate.setMonth(startDate.getMonth() - 12);
        groupFormat = '%Y-%m';
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get real sales data from database
    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isDeleted: false,
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: groupFormat, date: '$createdAt' }
          },
          revenue: { $sum: '$totalAmount' },
          orders: { $sum: 1 },
          averageOrderValue: { $avg: '$totalAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get real top selling products from order items
    const topProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          isDeleted: false,
          status: { $ne: 'cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          productName: { $first: '$items.name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          averagePrice: { $avg: '$items.price' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    return res.json({
      success: true,
      analytics: {
        salesData,
        topProducts,
        period: {
          type: period,
          startDate,
          endDate: new Date()
        }
      }
    });

  } catch (error) {
    console.error('❌ Get REAL sales analytics error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch sales analytics',
      details: error.message
    });
  }
});

// ===============================
// 🔍 SEARCH ORDERS - REAL SEARCH
// ===============================
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 10 } = req.query;

    console.log('🔍 Searching REAL orders for:', query);

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters long'
      });
    }

    // Real search across multiple order fields
    const orders = await Order.find({
      isDeleted: false,
      $or: [
        { orderNumber: { $regex: query, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: query, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: query, $options: 'i' } },
        { 'shippingAddress.email': { $regex: query, $options: 'i' } },
        { guestEmail: { $regex: query, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: query, $options: 'i' } },
        { transactionId: { $regex: query, $options: 'i' } }
      ]
    })
    .populate('user', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .select('-__v')
    .lean();

    console.log(`✅ Found ${orders.length} REAL orders matching search`);

    return res.json({
      success: true,
      orders: orders,
      searchQuery: query,
      count: orders.length
    });

  } catch (error) {
    console.error('❌ Search REAL orders error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to search orders',
      details: error.message
    });
  }
});

// ===============================
// 🧪 TEST ENDPOINT WITH REAL DATA
// ===============================
router.get('/test/real-data', async (req, res) => {
  try {
    // Get real counts from database
    const totalOrders = await Order.countDocuments({ isDeleted: false });
    const recentOrders = await Order.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('orderNumber status totalAmount createdAt')
      .lean();

    return res.json({
      success: true,
      message: 'Admin Orders endpoint is working with REAL data!',
      data: {
        totalOrders,
        recentOrders,
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
      }
    });
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error.message
    });
  }
});

module.exports = router;