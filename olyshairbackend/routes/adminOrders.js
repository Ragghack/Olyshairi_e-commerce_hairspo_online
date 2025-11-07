// routes/adminOrders.js
const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');

// GET ALL ORDERS (ADMIN)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      startDate, 
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = { isDeleted: false };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'shippingAddress.firstName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.lastName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.email': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const options = {
      sort,
      limit: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit)
    };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .skip(options.skip)
        .populate('user', 'firstName lastName email phone')
        .populate('items.product', 'name images sku price')
        .select('-__v')
        .lean(),
      Order.countDocuments(filter)
    ]);

    // Format orders for admin display
    const formattedOrders = orders.map(order => ({
      ...order,
      customerName: order.user 
        ? `${order.user.firstName} ${order.user.lastName}`
        : `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      customerEmail: order.user ? order.user.email : order.shippingAddress.email,
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0)
    }));

    return res.json({
      success: true,
      orders: formattedOrders,
      pagination: {
        totalPages: Math.ceil(total / options.limit),
        currentPage: parseInt(page),
        total,
        hasNext: parseInt(page) < Math.ceil(total / options.limit),
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('❌ Admin get orders error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// GET ORDER STATISTICS (ADMIN)
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case 'today':
        dateFilter = { createdAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) } };
        break;
      case '7days':
        dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 7)) } };
        break;
      case '30days':
        dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 30)) } };
        break;
      case '90days':
        dateFilter = { createdAt: { $gte: new Date(now.setDate(now.getDate() - 90)) } };
        break;
    }

    const stats = await Order.aggregate([
      { $match: { ...dateFilter, isDeleted: false } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
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

    const result = stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0
    };

    return res.json({
      success: true,
      stats: result,
      period
    });

  } catch (error) {
    console.error('❌ Admin order stats error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order statistics',
      details: error.message 
    });
  }
});

module.exports = router;